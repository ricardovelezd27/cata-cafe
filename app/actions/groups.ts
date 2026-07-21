"use server";

// Tasting Groups: a maestro's standing address book of co-cuppers (linked
// users or plain email-only invitees), reusable across sessions without
// re-inviting people one by one. Members live in TastingGroupMember and are
// auto-linked to a Profile on signup by the `handle_new_user` trigger (see
// prisma/sql/rls_and_triggers.sql Phase 8b) when their email matches.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { sendEmail, escapeHtml } from "@/lib/email";

type Locale = "es" | "en";

const MAX_GROUP_MEMBERS = 200;

// Same email shape check used by the landing-page waitlist (app/actions/waitlist.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
    update: {},
  });
  return user;
}

async function getOrigin() {
  const h = await headers();
  return (
    h.get("origin") ||
    `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost:3000"}`
  );
}

// ─── Create a tasting group ────────────────────────────────────────────────────
export async function createGroup(input: { name: string }): Promise<{ groupId: string }> {
  const user = await requireUser();

  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw new Error("invalid_name");

  const group = await prisma.tastingGroup.create({
    data: { name, createdBy: user.id },
  });

  revalidatePath("/es/app/groups");
  revalidatePath("/en/app/groups");
  return { groupId: group.id };
}

// ─── Rename a tasting group (owner only) ───────────────────────────────────────
export async function renameGroup(groupId: string, name: string): Promise<{ ok: true }> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw new Error("invalid_name");

  await prisma.tastingGroup.update({
    where: { id: groupId },
    data: { name: trimmed },
  });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Delete a tasting group (owner only) — members cascade ────────────────────
export async function deleteGroup(groupId: string): Promise<{ ok: true }> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.tastingGroup.delete({ where: { id: groupId } });

  revalidatePath("/es/app/groups");
  revalidatePath("/en/app/groups");
  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Add a member by linked user id (owner only) ───────────────────────────────
// Resolves the target's current email via the service-role admin client (the
// Profile model has no email column) and snapshots their displayName. Upserts
// on the (groupId, email) unique so re-adding an already-present email re-links
// userId/displayName instead of erroring.
export async function addMemberByUserId(
  groupId: string,
  userId: string,
): Promise<{ ok: true; memberId: string }> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const rawEmail = data?.user?.email;
  if (error || !rawEmail) throw new Error("email_unresolvable");
  const email = rawEmail.trim().toLowerCase();

  const targetProfile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });

  const existing = await prisma.tastingGroupMember.findUnique({
    where: { groupId_email: { groupId, email } },
    select: { id: true },
  });
  if (!existing) {
    const count = await prisma.tastingGroupMember.count({ where: { groupId } });
    if (count >= MAX_GROUP_MEMBERS) throw new Error("group_full");
  }

  const member = await prisma.tastingGroupMember.upsert({
    where: { groupId_email: { groupId, email } },
    create: { groupId, email, userId, displayName: targetProfile?.displayName ?? null },
    update: { userId, displayName: targetProfile?.displayName ?? null },
  });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true, memberId: member.id };
}

// ─── Add a member by plain email (owner only) ──────────────────────────────────
// No live user lookup here — the account may not exist yet. Auto-link happens
// later via the handle_new_user DB trigger when/if that email signs up (see
// prisma/sql/rls_and_triggers.sql Phase 8b). On conflict we never null out an
// already-linked userId — only displayName is updated, and only if provided.
export async function addMemberByEmail(
  groupId: string,
  email: string,
  displayName?: string,
): Promise<{ ok: true; memberId: string }> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) throw new Error("invalid_email");

  const trimmedDisplayName = displayName?.trim();

  const existing = await prisma.tastingGroupMember.findUnique({
    where: { groupId_email: { groupId, email: normalizedEmail } },
    select: { id: true },
  });
  if (!existing) {
    const count = await prisma.tastingGroupMember.count({ where: { groupId } });
    if (count >= MAX_GROUP_MEMBERS) throw new Error("group_full");
  }

  const member = await prisma.tastingGroupMember.upsert({
    where: { groupId_email: { groupId, email: normalizedEmail } },
    create: {
      groupId,
      email: normalizedEmail,
      userId: null,
      displayName: trimmedDisplayName || null,
    },
    // Never touch userId here — re-adding an email that's already linked to a
    // user must not sever that link.
    update: trimmedDisplayName ? { displayName: trimmedDisplayName } : {},
  });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true, memberId: member.id };
}

// ─── Remove a member (owner only) ──────────────────────────────────────────────
export async function removeMember(groupId: string, memberId: string): Promise<{ ok: true }> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const member = await prisma.tastingGroupMember.findUnique({
    where: { id: memberId },
    select: { groupId: true },
  });
  if (!member || member.groupId !== groupId) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.tastingGroupMember.delete({ where: { id: memberId } });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Send an email blast to a group (owner only) ───────────────────────────────

export type GroupEmailResult = {
  email: string;
  status: "sent" | "skipped" | "failed";
};

export type GroupEmailSummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  results: GroupEmailResult[];
};

const GROUP_EMAIL_TEXT: Record<
  Locale,
  { greeting: string; inviteLabel: string; footer: string }
> = {
  es: {
    greeting: "Hola,",
    inviteLabel: "Unirse a la sesión",
    footer:
      "Recibiste este correo porque un maestro de cata te añadió a su grupo en Cata Café.",
  },
  en: {
    greeting: "Hello,",
    inviteLabel: "Join the session",
    footer:
      "You received this email because a tasting master added you to their group on Cata Café.",
  },
};

function buildGroupEmailHtml(args: {
  message: string;
  inviteUrl: string | null;
  locale: Locale;
}): string {
  const text = GROUP_EMAIL_TEXT[args.locale];
  const messageHtml = escapeHtml(args.message).replace(/\n/g, "<br>");
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
      <h2 style="color:#3D5A3E; margin:0 0 8px;">Cata Café</h2>
      <p>${text.greeting}</p>
      <p>${messageHtml}</p>
      ${
        args.inviteUrl
          ? `<p style="margin:24px 0;"><a href="${args.inviteUrl}" style="background:#3D5A3E; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">${text.inviteLabel}</a></p>`
          : ""
      }
      <p style="color:#7a7168; font-size:13px;">${text.footer}</p>
    </div>`;
}

export async function sendGroupEmail(input: {
  groupId: string;
  subject: string;
  message: string;
  sessionId?: string;
  memberIds?: string[];
}): Promise<GroupEmailSummary> {
  const user = await requireUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: input.groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const subject = input.subject.trim();
  if (subject.length < 1 || subject.length > 200) throw new Error("invalid_input");

  const message = input.message.trim();
  if (message.length < 1 || message.length > 5000) throw new Error("invalid_input");

  // Resolve (or create) an invite link for the session, independently
  // re-verifying ownership — never trust a sessionId passed alongside a group
  // the caller happens to own; the SESSION must also be theirs, or a maestro
  // could embed an invite link to someone else's session in a group email.
  let inviteToken: string | null = null;
  if (input.sessionId) {
    const session = await prisma.cuppingSession.findUnique({
      where: { id: input.sessionId },
      select: { id: true, createdBy: true },
    });
    if (!session || session.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }

    const now = new Date();
    const candidateInvites = await prisma.sessionInvite.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      select: { token: true, maxUses: true, useCount: true, expiresAt: true },
    });
    const validInvite = candidateInvites.find(
      (inv) =>
        (!inv.expiresAt || inv.expiresAt > now) &&
        (inv.maxUses === null || inv.useCount < inv.maxUses),
    );

    if (validInvite) {
      inviteToken = validInvite.token;
    } else {
      inviteToken = crypto.randomUUID();
      await prisma.sessionInvite.create({
        data: {
          sessionId: session.id,
          token: inviteToken,
          maxUses: null,
          expiresAt: null,
          createdBy: user.id,
        },
      });
    }
  }

  // Snapshot members ONCE — never re-query per recipient below.
  const members = await prisma.tastingGroupMember.findMany({
    where: {
      groupId: input.groupId,
      ...(input.memberIds ? { id: { in: input.memberIds } } : {}),
    },
    select: { id: true, email: true, userId: true },
  });
  if (input.memberIds && members.length !== input.memberIds.length) {
    throw new Error("invalid_member_ids");
  }

  const senderProfile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { preferredLang: true },
  });
  const senderLocale: Locale = senderProfile?.preferredLang === "en" ? "en" : "es";

  // Batch-fetch recipient locale for every linked member in one query.
  const linkedUserIds = [
    ...new Set(members.map((m) => m.userId).filter((id): id is string => !!id)),
  ];
  const linkedProfiles =
    linkedUserIds.length > 0
      ? await prisma.profile.findMany({
          where: { id: { in: linkedUserIds } },
          select: { id: true, preferredLang: true },
        })
      : [];
  const localeByUserId = new Map<string, Locale>(
    linkedProfiles.map((p) => [p.id, p.preferredLang === "en" ? "en" : "es"]),
  );

  const origin = await getOrigin();
  const admin = createAdminClient();

  // Resolve live email + build the per-recipient (locale-varying) html.
  const prepared = await Promise.all(
    members.map(async (m) => {
      let email = m.email;
      if (m.userId) {
        try {
          const { data, error } = await admin.auth.admin.getUserById(m.userId);
          const liveEmail = data?.user?.email;
          if (!error && liveEmail) email = liveEmail;
        } catch {
          // Fall back to the stored snapshot email below.
        }
      }

      const recipientLocale: Locale = m.userId
        ? localeByUserId.get(m.userId) ?? senderLocale
        : senderLocale;

      const inviteUrl = inviteToken ? `${origin}/${recipientLocale}/join/${inviteToken}` : null;
      const html = buildGroupEmailHtml({ message, inviteUrl, locale: recipientLocale });

      return { email, html };
    }),
  );

  const sendOutcomes = await Promise.allSettled(
    prepared.map((job) => sendEmail({ to: job.email, subject, html: job.html })),
  );

  const results: GroupEmailResult[] = sendOutcomes.map((outcome, i) => {
    const email = prepared[i].email;
    if (outcome.status === "rejected") {
      console.warn(`[sendGroupEmail] send rejected for ${email}: ${String(outcome.reason)}`);
      return { email, status: "failed" as const };
    }
    if (outcome.value.skipped) return { email, status: "skipped" as const };
    if (!outcome.value.ok) {
      console.warn(`[sendGroupEmail] send failed for ${email}: ${outcome.value.error}`);
      return { email, status: "failed" as const };
    }
    return { email, status: "sent" as const };
  });

  const summary: GroupEmailSummary = {
    attempted: members.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };

  revalidatePath(`/es/app/groups/${input.groupId}`);
  revalidatePath(`/en/app/groups/${input.groupId}`);
  return summary;
}

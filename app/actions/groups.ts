"use server";

// Tasting Groups: a maestro's standing address book of co-cuppers (linked
// users or plain email-only invitees), reusable across sessions without
// re-inviting people one by one. Members live in TastingGroupMember and are
// auto-linked to a Profile on signup by the `handle_new_user` trigger (see
// prisma/sql/rls_and_triggers.sql Phase 8b) when their email matches.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { requireRegisteredUser } from "@/lib/auth";
import { escapeHtml } from "@/lib/email";
import { deliverGroupMail, type GroupEmailResult, type GroupMailJob } from "@/lib/groupEmail";
import { isBroadcastId, summarize } from "@/lib/groupEmailPlan";
import { logWarn } from "@/lib/log";
import { maskEmail } from "@/lib/maskEmail";
import { coCupperIdsAmong, isCoCupper } from "@/lib/coCuppers";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";

type Locale = "es" | "en";

const MAX_GROUP_MEMBERS = 200;

// Same email shape check used by the landing-page waitlist (app/actions/waitlist.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getOrigin() {
  const h = await headers();
  return (
    h.get("origin") ||
    `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost:3000"}`
  );
}

// Finds a still-valid SessionInvite for a session, or mints a fresh one.
// Extracted from sendGroupEmail so notifyGroupOfSession can reuse the exact
// same token-resolution rules. Callers must independently verify session
// ownership BEFORE calling this — it does no auth checks of its own.
async function resolveOrCreateSessionInvite(
  sessionId: string,
  createdBy: string,
): Promise<string> {
  const now = new Date();
  const candidateInvites = await prisma.sessionInvite.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    select: { token: true, maxUses: true, useCount: true, expiresAt: true },
  });
  const validInvite = candidateInvites.find(
    (inv) =>
      (!inv.expiresAt || inv.expiresAt > now) &&
      (inv.maxUses === null || inv.useCount < inv.maxUses),
  );
  if (validInvite) return validInvite.token;

  const token = crypto.randomUUID();
  await prisma.sessionInvite.create({
    data: { sessionId, token, maxUses: null, expiresAt: null, createdBy },
  });
  return token;
}

// NOTE: the old name-only `createGroup` action was removed — every creation
// path now goes through createGroupWithMembers (empty roster is fine).

// ─── Update a tasting group's name/description (owner only) ───────────────────
// Replaces the old renameGroup — name and description are both optional so
// callers can update either independently. Passing description: null (or an
// empty/whitespace-only string) clears it back to null.
export async function updateGroup(
  groupId: string,
  input: { name?: string; description?: string | null },
): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const data: { name?: string; description?: string | null } = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) throw new Error("invalid_name");
    data.name = trimmed;
  }

  if (input.description !== undefined) {
    const trimmed = input.description?.trim() || null;
    if (trimmed && trimmed.length > 500) throw new Error("invalid_description");
    data.description = trimmed;
  }

  await prisma.tastingGroup.update({
    where: { id: groupId },
    data,
  });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Delete a tasting group (owner only) — members cascade ────────────────────
export async function deleteGroup(groupId: string): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

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
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  // The target must be a real co-cupper of the caller. Without this, owning
  // any group let a caller resolve ANY account's email from a harvested UUID
  // via the service-role lookup below (platform-wide email enumeration).
  if (!(await isCoCupper(user.id, userId))) {
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

// ─── Group invitation email (join-the-platform, not a specific session) ───────
// No new token flow — reuses the existing magic-link auth plumbing. The
// recipient lands on /auth/login with their email prefilled, signs in via
// magic link, /auth/callback honors ?next= and drops them on the group page;
// handle_new_user auto-links their member row by email. Unlike the session
// join page, this path has no anonymous option, which is the point — it
// closes the NULL-email gap that guest join left open for group invites.

const GROUP_INVITE_TEXT: Record<
  Locale,
  {
    subject: (inviter: string, groupName: string) => string;
    greeting: string;
    intro: (inviter: string, groupName: string) => string;
    cta: string;
    footer: string;
  }
> = {
  es: {
    subject: (inviter, groupName) => `${inviter} te agregó al grupo "${groupName}" en Café Sensible`,
    greeting: "Hola,",
    intro: (inviter, groupName) => `${inviter} te agregó a su grupo de cata ${groupName}.`,
    cta: "Unirme en Café Sensible",
    footer:
      "Recibiste este correo porque un maestro de cata te añadió a su grupo en Café Sensible.",
  },
  en: {
    subject: (inviter, groupName) =>
      `${inviter} added you to the group "${groupName}" on Café Sensible`,
    greeting: "Hello,",
    intro: (inviter, groupName) => `${inviter} added you to their tasting group ${groupName}.`,
    cta: "Join on Café Sensible",
    footer:
      "You received this email because a tasting master added you to their group on Café Sensible.",
  },
};

function buildGroupInviteHtml(args: {
  inviterName: string;
  groupName: string;
  description: string | null;
  ctaUrl: string;
  locale: Locale;
}): string {
  const text = GROUP_INVITE_TEXT[args.locale];
  const introHtml = escapeHtml(text.intro(args.inviterName, args.groupName));
  const descriptionHtml = args.description
    ? `<p>${escapeHtml(args.description).replace(/\n/g, "<br>")}</p>`
    : "";
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
      <h2 style="color:#3D5A3E; margin:0 0 8px;">Café Sensible</h2>
      <p>${text.greeting}</p>
      <p>${introHtml}</p>
      ${descriptionHtml}
      <p style="margin:24px 0;"><a href="${args.ctaUrl}" style="background:#3D5A3E; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">${text.cta}</a></p>
      <p style="color:#7a7168; font-size:13px;">${text.footer}</p>
    </div>`;
}

// Sends a "join the group" invitation to each recipient. Locale is resolved
// per recipient: linked members (userId set) use their own preferredLang
// (batch-fetched); unlinked (email-only) recipients fall back to the
// sender's locale. Callers do their own auth/ownership checks. Goes through
// the one group sender (lib/groupEmail.ts): budgeted as `group_invite`,
// ledgered, retried; a refusal comes back as `rate_limited`, never a throw.
type InvitationOutcome =
  | { ok: true; summary: GroupEmailSummary }
  | { ok: false; error: "rate_limited" };

async function sendGroupInvitationEmails(args: {
  group: { id: string; name: string; description: string | null };
  inviterId: string;
  inviterName: string;
  recipients: {
    memberId: string;
    email: string;
    userId: string | null;
    displayName?: string | null;
  }[];
  origin: string;
  senderLocale: Locale;
}): Promise<InvitationOutcome> {
  const linkedUserIds = [
    ...new Set(args.recipients.map((r) => r.userId).filter((id): id is string => !!id)),
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

  const jobs: GroupMailJob[] = args.recipients.map((r) => {
    const recipientLocale: Locale = r.userId
      ? localeByUserId.get(r.userId) ?? args.senderLocale
      : args.senderLocale;

    const ctaUrl = `${args.origin}/${recipientLocale}/auth/login?email=${encodeURIComponent(
      r.email,
    )}&next=${encodeURIComponent(`/${recipientLocale}/app/groups/${args.group.id}`)}`;

    return {
      memberId: r.memberId,
      label: r.displayName || maskEmail(r.email),
      email: r.email,
      subject: GROUP_INVITE_TEXT[recipientLocale].subject(args.inviterName, args.group.name),
      html: buildGroupInviteHtml({
        inviterName: args.inviterName,
        groupName: args.group.name,
        description: args.group.description,
        ctaUrl,
        locale: recipientLocale,
      }),
    };
  });

  const broadcastId = crypto.randomUUID();
  const outcome = await deliverGroupMail({
    userId: args.inviterId,
    groupId: args.group.id,
    kind: "group_invite",
    broadcastId,
    jobs,
  });
  if (!outcome.ok) return { ok: false, error: "rate_limited" };
  return { ok: true, summary: toSummary(outcome.results, broadcastId) };
}

// ─── Create a group with an initial member roster in one go ───────────────────
// Single atomic nested create (name + description + members all land in one
// prisma.tastingGroup.create). Invitation emails are best-effort and fired
// AFTER the create succeeds, only to members who aren't yet linked to an
// account — a failed/skipped/throttled send never fails the action (a
// throttled one reports `emailBlocked: "rate_limited"`). `clientKey` is the
// dialog's idempotency key: a replayed submit returns the stored group and
// sends nothing.
export async function createGroupWithMembers(input: {
  name: string;
  description?: string;
  members: { email: string; displayName?: string }[];
  coCupperUserIds?: string[];
  locale?: Locale;
  clientKey?: string;
}): Promise<
  | {
      ok: true;
      groupId: string;
      memberCount: number;
      emailSummary: GroupEmailSummary | null;
      emailBlocked?: "rate_limited";
    }
  | {
      ok: false;
      error:
        | "invalid_name"
        | "invalid_description"
        | "invalid_email"
        | "invalid_input"
        | "group_full"
        | "generic";
    }
> {
  const user = await requireRegisteredUser();

  const clientKey = input.clientKey;
  if (clientKey !== undefined && !isBroadcastId(clientKey)) {
    return { ok: false, error: "invalid_input" };
  }
  if (clientKey) {
    const replay = await findGroupReplay(clientKey, user.id);
    if (replay === "foreign") return { ok: false, error: "invalid_input" };
    if (replay) return { ok: true, ...replay, emailSummary: null };
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "invalid_name" };

  const description = input.description?.trim() || null;
  if (description && description.length > 500) return { ok: false, error: "invalid_description" };

  const emailMembers: { email: string; displayName: string | null }[] = [];
  for (const m of input.members ?? []) {
    const email = m.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };
    emailMembers.push({ email, displayName: m.displayName?.trim() || null });
  }

  // Resolve co-cupper userIds → live email/displayName via the admin client,
  // exactly like addMemberByUserId. Silently drop anything unresolvable —
  // a stale/deleted userId shouldn't block group creation.
  const coCupperMembers: { email: string; displayName: string | null; userId: string }[] = [];
  if (input.coCupperUserIds && input.coCupperUserIds.length > 0) {
    // Only ids that are genuinely in the caller's co-cupper network may be
    // resolved to an email (see addMemberByUserId). Anything else is dropped
    // silently, consistent with the stale-id handling below.
    const allowed = await coCupperIdsAmong(user.id, input.coCupperUserIds);
    const admin = createAdminClient();
    for (const uid of input.coCupperUserIds) {
      if (!allowed.has(uid)) continue;
      try {
        const { data, error } = await admin.auth.admin.getUserById(uid);
        const rawEmail = data?.user?.email;
        if (error || !rawEmail) continue;
        const email = rawEmail.trim().toLowerCase();
        const profile = await prisma.profile.findUnique({
          where: { id: uid },
          select: { displayName: true },
        });
        coCupperMembers.push({ email, displayName: profile?.displayName ?? null, userId: uid });
      } catch {
        continue;
      }
    }
  }

  // Merge + dedupe by lowercase email. Co-cupper entries (already linked to a
  // Profile) take priority for userId/displayName over a plain email row.
  const byEmail = new Map<string, { email: string; displayName: string | null; userId: string | null }>();
  for (const m of emailMembers) {
    byEmail.set(m.email, { email: m.email, displayName: m.displayName, userId: null });
  }
  for (const m of coCupperMembers) {
    const existing = byEmail.get(m.email);
    byEmail.set(m.email, {
      email: m.email,
      displayName: m.displayName ?? existing?.displayName ?? null,
      userId: m.userId,
    });
  }

  const allMembers = [...byEmail.values()];
  if (allMembers.length > MAX_GROUP_MEMBERS) return { ok: false, error: "group_full" };

  let groupId: string;
  let createdMembers: { id: string; email: string }[];
  try {
    const group = await prisma.tastingGroup.create({
      data: {
        name,
        description,
        createdBy: user.id,
        clientKey: clientKey ?? null,
        members: {
          create: allMembers.map((m) => ({
            email: m.email,
            userId: m.userId,
            displayName: m.displayName,
          })),
        },
      },
      select: { id: true, members: { select: { id: true, email: true } } },
    });
    groupId = group.id;
    createdMembers = group.members;
  } catch (e) {
    // A unique violation on clientKey is a concurrent replay of this submit.
    if (clientKey && (e as { code?: string })?.code === "P2002") {
      const replay = await findGroupReplay(clientKey, user.id);
      if (replay && replay !== "foreign") return { ok: true, ...replay, emailSummary: null };
    }
    logWarn({
      where: "createGroupWithMembers",
      message: "create_failed",
      userId: user.id,
      code: (e as { code?: string })?.code ?? "unknown",
    });
    return { ok: false, error: "generic" };
  }

  let emailSummary: GroupEmailSummary | null = null;
  let emailBlocked: "rate_limited" | undefined;
  const memberIdByEmail = new Map(createdMembers.map((m) => [m.email, m.id]));
  const unlinkedRecipients = allMembers.filter((m) => !m.userId);
  if (unlinkedRecipients.length > 0) {
    try {
      const inviterProfile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { displayName: true, preferredLang: true },
      });
      const senderLocale: Locale =
        input.locale === "en" || input.locale === "es"
          ? input.locale
          : inviterProfile?.preferredLang === "en"
            ? "en"
            : "es";
      const origin = await getOrigin();
      const sent = await sendGroupInvitationEmails({
        group: { id: groupId, name, description },
        inviterId: user.id,
        inviterName: inviterProfile?.displayName ?? "",
        recipients: unlinkedRecipients.flatMap((m) => {
          const memberId = memberIdByEmail.get(m.email);
          return memberId
            ? [{ memberId, email: m.email, userId: null, displayName: m.displayName }]
            : [];
        }),
        origin,
        senderLocale,
      });
      if (sent.ok) emailSummary = sent.summary;
      else emailBlocked = sent.error;
    } catch (e) {
      logWarn({
        where: "createGroupWithMembers",
        message: "invitation_emails_threw",
        groupId,
        code: (e as { code?: string })?.code ?? "unknown",
      });
    }
  }

  revalidatePath("/es/app/groups");
  revalidatePath("/en/app/groups");

  return { ok: true, groupId, memberCount: allMembers.length, emailSummary, emailBlocked };
}

// The stored group of an already-processed create-group submit. "foreign" when
// the key belongs to someone else (never reveal their group).
async function findGroupReplay(
  clientKey: string,
  userId: string,
): Promise<{ groupId: string; memberCount: number } | "foreign" | null> {
  const existing = await prisma.tastingGroup.findUnique({
    where: { clientKey },
    select: { id: true, createdBy: true, _count: { select: { members: true } } },
  });
  if (!existing) return null;
  if (existing.createdBy !== userId) return "foreign";
  return { groupId: existing.id, memberCount: existing._count.members };
}

// ─── Add a member by plain email (owner only) ──────────────────────────────────
// No live user lookup here — the account may not exist yet. Auto-link happens
// later via the handle_new_user DB trigger when/if that email signs up (see
// prisma/sql/rls_and_triggers.sql Phase 8b). On conflict we never null out an
// already-linked userId — only displayName is updated, and only if provided.
// By default (sendInvite !== false) an unlinked row triggers a best-effort
// invitation email; emailStatus reflects the outcome.
export async function addMemberByEmail(
  groupId: string,
  email: string,
  displayName?: string,
  options?: { sendInvite?: boolean },
): Promise<{
  ok: true;
  memberId: string;
  emailStatus?: "sent" | "skipped" | "failed" | "rate_limited";
}> {
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true, name: true, description: true },
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
    select: { id: true, userId: true },
  });

  const sendInvite = options?.sendInvite !== false;
  let emailStatus: "sent" | "skipped" | "failed" | "rate_limited" | undefined;

  if (sendInvite && member.userId === null) {
    try {
      const inviterProfile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { displayName: true, preferredLang: true },
      });
      const senderLocale: Locale = inviterProfile?.preferredLang === "en" ? "en" : "es";
      const origin = await getOrigin();
      const sent = await sendGroupInvitationEmails({
        group: { id: groupId, name: group.name, description: group.description },
        inviterId: user.id,
        inviterName: inviterProfile?.displayName ?? "",
        recipients: [
          {
            memberId: member.id,
            email: normalizedEmail,
            userId: null,
            displayName: trimmedDisplayName || null,
          },
        ],
        origin,
        senderLocale,
      });
      emailStatus = sent.ok ? (sent.summary.results[0]?.status ?? "failed") : sent.error;
    } catch (e) {
      logWarn({
        where: "addMemberByEmail",
        message: "invitation_email_threw",
        groupId,
        code: (e as { code?: string })?.code ?? "unknown",
      });
      emailStatus = "failed";
    }
  }

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true, memberId: member.id, emailStatus };
}

// ─── Remove a member (owner only) ──────────────────────────────────────────────
export async function removeMember(groupId: string, memberId: string): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

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

export type { GroupEmailResult };

export type GroupEmailSummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  /** One row per recipient, labelled by name or masked address. */
  results: GroupEmailResult[];
  /** Echo of the broadcast id, for "Reintentar fallidos". */
  broadcastId?: string;
};

function toSummary(results: GroupEmailResult[], broadcastId: string): GroupEmailSummary {
  return { ...summarize(results), broadcastId };
}

const GROUP_EMAIL_TEXT: Record<
  Locale,
  { greeting: string; inviteLabel: string; openAppLabel: string; footer: string }
> = {
  es: {
    greeting: "Hola,",
    inviteLabel: "Unirse a la sesión",
    openAppLabel: "Abrir Café Sensible",
    footer:
      "Recibiste este correo porque un maestro de cata te añadió a su grupo en Café Sensible.",
  },
  en: {
    greeting: "Hello,",
    inviteLabel: "Join the session",
    openAppLabel: "Open Café Sensible",
    footer:
      "You received this email because a tasting master added you to their group on Café Sensible.",
  },
};

// Every group email now carries a link: a session invite when one was
// requested, else a fallback CTA into the app itself — no more linkless
// broadcast emails.
function buildGroupEmailHtml(args: {
  message: string;
  inviteUrl: string | null;
  locale: Locale;
  origin: string;
}): string {
  const text = GROUP_EMAIL_TEXT[args.locale];
  const messageHtml = escapeHtml(args.message).replace(/\n/g, "<br>");
  const ctaUrl = args.inviteUrl ?? `${args.origin}/${args.locale}/app`;
  const ctaLabel = args.inviteUrl ? text.inviteLabel : text.openAppLabel;
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
      <h2 style="color:#3D5A3E; margin:0 0 8px;">Café Sensible</h2>
      <p>${text.greeting}</p>
      <p>${messageHtml}</p>
      <p style="margin:24px 0;"><a href="${ctaUrl}" style="background:#3D5A3E; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">${ctaLabel}</a></p>
      <p style="color:#7a7168; font-size:13px;">${text.footer}</p>
    </div>`;
}

// `broadcastId` is minted by the composer per message and re-sent with the
// same subject/message to "Reintentar fallidos": the ledger then knows who
// already got it and only the rest are sent (a retry takes no broadcast slot).
export async function sendGroupEmail(input: {
  groupId: string;
  subject: string;
  message: string;
  sessionId?: string;
  memberIds?: string[];
  broadcastId?: string;
}): Promise<ActionResult<GroupEmailSummary>> {
  return run("sendGroupEmail", async () => {
    const user = await requireRegisteredUser();

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

    if (input.broadcastId !== undefined && !isBroadcastId(input.broadcastId)) {
      throw new Error("invalid_input");
    }
    const broadcastId = input.broadcastId ?? crypto.randomUUID();

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
      inviteToken = await resolveOrCreateSessionInvite(session.id, user.id);
    }

    // Snapshot members ONCE — never re-query per recipient below.
    const members = await prisma.tastingGroupMember.findMany({
      where: {
        groupId: input.groupId,
        ...(input.memberIds ? { id: { in: input.memberIds } } : {}),
      },
      select: { id: true, email: true, userId: true, displayName: true },
    });
    if (input.memberIds && members.length !== input.memberIds.length) {
      throw new Error("invalid_input");
    }

    const senderProfile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { preferredLang: true },
    });
    const senderLocale: Locale = senderProfile?.preferredLang === "en" ? "en" : "es";

    const localeByUserId = await localesOfLinkedMembers(members);
    const origin = await getOrigin();
    const emails = await liveEmails(members);

    const jobs: GroupMailJob[] = members.map((m) => {
      const recipientLocale: Locale = m.userId
        ? localeByUserId.get(m.userId) ?? senderLocale
        : senderLocale;
      const inviteUrl = inviteToken ? `${origin}/${recipientLocale}/join/${inviteToken}` : null;
      return {
        memberId: m.id,
        label: m.displayName || maskEmail(m.email),
        email: emails.get(m.id) ?? m.email,
        subject,
        html: buildGroupEmailHtml({ message, inviteUrl, locale: recipientLocale, origin }),
      };
    });

    const outcome = await deliverGroupMail({
      userId: user.id,
      groupId: input.groupId,
      kind: "group_broadcast",
      broadcastId,
      jobs,
    });
    if (!outcome.ok) throw new Error(outcome.error);

    revalidatePath(`/es/app/groups/${input.groupId}`);
    revalidatePath(`/en/app/groups/${input.groupId}`);
    return toSummary(outcome.results, broadcastId);
  }, { groupId: input.groupId });
}

// Recipient language for every linked member, in one query.
async function localesOfLinkedMembers(
  members: { userId: string | null }[],
): Promise<Map<string, Locale>> {
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
  return new Map<string, Locale>(
    linkedProfiles.map((p) => [p.id, p.preferredLang === "en" ? "en" : "es"]),
  );
}

// The live address of each linked member (the account's current email wins
// over the stored snapshot). Stays server-side: only labels reach the client.
async function liveEmails(
  members: { id: string; userId: string | null }[],
): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const out = new Map<string, string>();
  await Promise.all(
    members.map(async (m) => {
      if (!m.userId) return;
      try {
        const { data, error } = await admin.auth.admin.getUserById(m.userId);
        const liveEmail = data?.user?.email;
        if (!error && liveEmail) out.set(m.id, liveEmail);
      } catch {
        // Fall back to the stored snapshot email.
      }
    }),
  );
  return out;
}

// ─── Notify a group that a new session was created (owner only) ───────────────
// Links a member straight into the session: a linked member goes to
// /{locale}/join/{token} directly; an unlinked (email-only) member is routed
// through /auth/login first, same as the group-membership invite — this
// steers known-email invitees toward email signup (so handle_new_user links
// them) instead of dropping them on the session's anonymous guest-join CTA.

const GROUP_SESSION_INVITE_TEXT: Record<
  Locale,
  {
    subject: (sessionName: string) => string;
    greeting: string;
    intro: (sessionName: string) => string;
    cta: string;
    footer: string;
  }
> = {
  es: {
    subject: (sessionName) => `Nueva sesión de catación: ${sessionName}`,
    greeting: "Hola,",
    intro: (sessionName) =>
      `Te invito a una sesión de catación en Café Sensible: ${sessionName}. Usa el enlace para unirte.`,
    cta: "Unirme a la sesión",
    footer: "Recibiste este correo porque eres integrante de un grupo de cata en Café Sensible.",
  },
  en: {
    subject: (sessionName) => `New cupping session: ${sessionName}`,
    greeting: "Hello,",
    intro: (sessionName) =>
      `You're invited to a cupping session on Café Sensible: ${sessionName}. Use the link to join.`,
    cta: "Join the session",
    footer: "You received this email because you're a member of a tasting group on Café Sensible.",
  },
};

function buildGroupSessionInviteHtml(args: {
  sessionName: string;
  ctaUrl: string;
  locale: Locale;
}): string {
  const text = GROUP_SESSION_INVITE_TEXT[args.locale];
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
      <h2 style="color:#3D5A3E; margin:0 0 8px;">Café Sensible</h2>
      <p>${text.greeting}</p>
      <p>${escapeHtml(text.intro(args.sessionName))}</p>
      <p style="margin:24px 0;"><a href="${args.ctaUrl}" style="background:#3D5A3E; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">${text.cta}</a></p>
      <p style="color:#7a7168; font-size:13px;">${text.footer}</p>
    </div>`;
}

export async function notifyGroupOfSession(input: {
  groupId: string;
  sessionId: string;
}): Promise<ActionResult<GroupEmailSummary>> {
  return run("notifyGroupOfSession", async () => {
    const user = await requireRegisteredUser();

    // Both the group AND the session must independently belong to this user —
    // same rationale as sendGroupEmail: never trust a sessionId passed
    // alongside a group the caller happens to own.
    const group = await prisma.tastingGroup.findUnique({
      where: { id: input.groupId },
      select: { createdBy: true },
    });
    if (!group || group.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }

    const session = await prisma.cuppingSession.findUnique({
      where: { id: input.sessionId },
      select: { id: true, createdBy: true, name: true },
    });
    if (!session || session.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }

    const inviteToken = await resolveOrCreateSessionInvite(session.id, user.id);

    const members = await prisma.tastingGroupMember.findMany({
      where: { groupId: input.groupId },
      select: { id: true, email: true, userId: true, displayName: true },
    });

    const senderProfile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { preferredLang: true },
    });
    const senderLocale: Locale = senderProfile?.preferredLang === "en" ? "en" : "es";

    const localeByUserId = await localesOfLinkedMembers(members);
    const origin = await getOrigin();
    const emails = await liveEmails(members);

    const jobs: GroupMailJob[] = members.map((m) => {
      const email = emails.get(m.id) ?? m.email;
      const recipientLocale: Locale = m.userId
        ? localeByUserId.get(m.userId) ?? senderLocale
        : senderLocale;

      const ctaUrl = m.userId
        ? `${origin}/${recipientLocale}/join/${inviteToken}`
        : `${origin}/${recipientLocale}/auth/login?email=${encodeURIComponent(
            email,
          )}&next=${encodeURIComponent(`/${recipientLocale}/join/${inviteToken}`)}`;

      return {
        memberId: m.id,
        label: m.displayName || maskEmail(m.email),
        email,
        subject: GROUP_SESSION_INVITE_TEXT[recipientLocale].subject(session.name),
        html: buildGroupSessionInviteHtml({
          sessionName: session.name,
          ctaUrl,
          locale: recipientLocale,
        }),
      };
    });

    const broadcastId = crypto.randomUUID();
    const outcome = await deliverGroupMail({
      userId: user.id,
      groupId: input.groupId,
      kind: "group_broadcast",
      broadcastId,
      jobs,
    });
    if (!outcome.ok) throw new Error(outcome.error);
    return toSummary(outcome.results, broadcastId);
  }, { groupId: input.groupId, sessionId: input.sessionId });
}

// ═══ Announcements feed (GroupPost) ═══════════════════════════════════════════
// Owner-only authorship; members read the feed on the group page. Optional
// email notification reuses the sendGroupEmail broadcast machinery (chunked
// Resend sends, per-recipient locale) and is best-effort — a failed blast
// never fails the post itself.

export async function createGroupPost(input: {
  groupId: string;
  title?: string;
  body: string;
  notifyByEmail?: boolean;
}): Promise<
  | {
      ok: true;
      postId: string;
      emailSummary?: GroupEmailSummary;
      emailBlocked?: "rate_limited";
    }
  | { ok: false; error: "body_required" | "body_too_long" | "title_too_long" }
> {
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: input.groupId },
    select: { createdBy: true, name: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const body = input.body?.trim();
  if (!body) return { ok: false, error: "body_required" };
  if (body.length > 5000) return { ok: false, error: "body_too_long" };
  const title = input.title?.trim() || null;
  if (title && title.length > 120) return { ok: false, error: "title_too_long" };

  const post = await prisma.groupPost.create({
    data: { groupId: input.groupId, authorId: user.id, title, body },
    select: { id: true },
  });

  // The post is already saved: a throttled or failed blast never fails it.
  let emailSummary: GroupEmailSummary | undefined;
  let emailBlocked: "rate_limited" | undefined;
  if (input.notifyByEmail) {
    try {
      const result = await sendGroupEmail({
        groupId: input.groupId,
        subject: title || group.name,
        message: body,
      });
      if (result.ok) {
        emailSummary = result.data;
        if (emailSummary.sent > 0) {
          await prisma.groupPost.update({
            where: { id: post.id },
            data: { emailSent: true },
          });
        }
      } else if (result.error === "rate_limited") {
        emailBlocked = "rate_limited";
      } else {
        logWarn({
          where: "createGroupPost",
          message: "notify_email_failed",
          groupId: input.groupId,
          code: result.error,
        });
      }
    } catch (e) {
      logWarn({
        where: "createGroupPost",
        message: "notify_email_threw",
        groupId: input.groupId,
        code: (e as { code?: string })?.code ?? "unknown",
      });
    }
  }

  revalidatePath(`/es/app/groups/${input.groupId}`);
  revalidatePath(`/en/app/groups/${input.groupId}`);
  return { ok: true, postId: post.id, emailSummary, emailBlocked };
}

export async function updateGroupPost(
  postId: string,
  input: { title?: string | null; body?: string },
): Promise<{ ok: true } | { ok: false; error: "body_required" | "body_too_long" | "title_too_long" }> {
  const user = await requireRegisteredUser();

  const post = await prisma.groupPost.findUnique({
    where: { id: postId },
    select: { groupId: true, group: { select: { createdBy: true } } },
  });
  if (!post || post.group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const data: { title?: string | null; body?: string } = {};
  if (input.title !== undefined) {
    const title = input.title?.trim() || null;
    if (title && title.length > 120) return { ok: false, error: "title_too_long" };
    data.title = title;
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) return { ok: false, error: "body_required" };
    if (body.length > 5000) return { ok: false, error: "body_too_long" };
    data.body = body;
  }

  await prisma.groupPost.update({ where: { id: postId }, data });

  revalidatePath(`/es/app/groups/${post.groupId}`);
  revalidatePath(`/en/app/groups/${post.groupId}`);
  return { ok: true };
}

export async function deleteGroupPost(postId: string): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

  const post = await prisma.groupPost.findUnique({
    where: { id: postId },
    select: { groupId: true, group: { select: { createdBy: true } } },
  });
  if (!post || post.group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.groupPost.delete({ where: { id: postId } });

  revalidatePath(`/es/app/groups/${post.groupId}`);
  revalidatePath(`/en/app/groups/${post.groupId}`);
  return { ok: true };
}

// ─── Duplicate a group as a template (owner only) ─────────────────────────────
// Copies name/description and the full roster (email/userId/displayName rows)
// WITHOUT sending any invitation emails — members are already known people;
// re-inviting on copy would spam them. Posts and session links are not copied.
export async function duplicateGroup(
  groupId: string,
  locale: string = "es",
): Promise<{ ok: true; groupId: string }> {
  const user = await requireRegisteredUser();

  const source = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: {
      createdBy: true,
      name: true,
      description: true,
      members: { select: { email: true, userId: true, displayName: true } },
    },
  });
  if (!source || source.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const prefix = locale === "en" ? "Copy of" : "Copia de";
  const copy = await prisma.tastingGroup.create({
    data: {
      name: `${prefix} ${source.name}`.slice(0, 80),
      description: source.description,
      createdBy: user.id,
      members: {
        create: source.members.map((m) => ({
          email: m.email,
          userId: m.userId,
          displayName: m.displayName,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/es/app/groups");
  revalidatePath("/en/app/groups");
  return { ok: true, groupId: copy.id };
}

// ─── Member self-service: leave a group ───────────────────────────────────────
// A member deletes their OWN membership row(s). The owner can never leave
// their own group (it would orphan it) — deleting the group is their exit.
export async function leaveGroup(groupId: string): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  if (!group) throw new Error("not_found_or_forbidden");
  if (group.createdBy === user.id) throw new Error("owner_cannot_leave");

  const res = await prisma.tastingGroupMember.deleteMany({
    where: { groupId, userId: user.id },
  });
  if (res.count === 0) throw new Error("not_found_or_forbidden");

  revalidatePath("/es/app/groups");
  revalidatePath("/en/app/groups");
  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Edit a member's display name (owner only) ────────────────────────────────
export async function updateMemberDisplayName(
  groupId: string,
  memberId: string,
  displayName: string,
): Promise<{ ok: true }> {
  const user = await requireRegisteredUser();

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

  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw new Error("invalid_name");

  await prisma.tastingGroupMember.update({
    where: { id: memberId },
    data: { displayName: trimmed },
  });

  revalidatePath(`/es/app/groups/${groupId}`);
  revalidatePath(`/en/app/groups/${groupId}`);
  return { ok: true };
}

// ─── Resend a membership invitation (owner only) ──────────────────────────────
// Only meaningful for unlinked members (no account yet) — linked members are
// already in; returns "skipped" for them instead of erroring so the UI can
// simply hide/disable the affordance.
export async function resendInvitation(
  groupId: string,
  memberId: string,
): Promise<{ ok: true; emailStatus: "sent" | "skipped" | "failed" | "rate_limited" }> {
  const user = await requireRegisteredUser();

  const group = await prisma.tastingGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true, name: true, description: true },
  });
  if (!group || group.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const member = await prisma.tastingGroupMember.findUnique({
    where: { id: memberId },
    select: { groupId: true, email: true, userId: true, displayName: true },
  });
  if (!member || member.groupId !== groupId) {
    throw new Error("not_found_or_forbidden");
  }
  if (member.userId !== null) return { ok: true, emailStatus: "skipped" };

  try {
    const inviterProfile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { displayName: true, preferredLang: true },
    });
    const senderLocale: Locale = inviterProfile?.preferredLang === "en" ? "en" : "es";
    const origin = await getOrigin();
    const sent = await sendGroupInvitationEmails({
      group: { id: groupId, name: group.name, description: group.description },
      inviterId: user.id,
      inviterName: inviterProfile?.displayName ?? "",
      recipients: [
        { memberId, email: member.email, userId: null, displayName: member.displayName },
      ],
      origin,
      senderLocale,
    });
    return {
      ok: true,
      emailStatus: sent.ok ? (sent.summary.results[0]?.status ?? "failed") : sent.error,
    };
  } catch (e) {
    logWarn({
      where: "resendInvitation",
      message: "invitation_email_threw",
      groupId,
      code: (e as { code?: string })?.code ?? "unknown",
    });
    return { ok: true, emailStatus: "failed" };
  }
}

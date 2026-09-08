"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleOwner,
  assertSessionWritable,
} from "@/lib/sessionAuth";
import { closeSessionInternal } from "@/lib/closeSession";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";

// ─── Submit all draft evaluations for a session ───────────────────────────────
export async function submitAllEvaluations(sessionId: string) {
  const user = await requireUser();
  // Member gate + closed guard (a closed session's results are final).
  assertSessionWritable(await requireSessionMember(sessionId, user.id));

  // Single batched update instead of one round-trip per draft eval. The aggregate
  // trigger is FOR EACH ROW, so it still fires once per updated evaluation.
  await prisma.evaluation.updateMany({
    where: {
      isDraft: true,
      cupperId: user.id,
      sessionSample: { sessionId },
    },
    data: { isDraft: false, submittedAt: new Date() },
  });

  await maybeAutoCloseSoloSession(sessionId, user.id);

  revalidatePath(`/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// Solo sessions have no group "maestro" close flow — before this existed they
// stayed "draft"/"active" forever and never fed UserCoffeeHistory. A solo
// session auto-closes when its owner has a submitted evaluation for EVERY
// sample (partial submits keep it open so the owner can keep cupping).
// Closing also reveals coffee-linked samples: solo blind ends at submit, and
// syncCoffeeHistoryForSession only picks up revealed samples.
async function maybeAutoCloseSoloSession(sessionId: string, userId: string) {
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, status: true, createdBy: true },
  });
  if (
    !session ||
    session.isGroup ||
    session.createdBy !== userId ||
    session.status === "closed"
  ) {
    return;
  }

  const [sampleCount, submittedCount] = await Promise.all([
    prisma.sessionSample.count({ where: { sessionId } }),
    prisma.evaluation.count({
      where: {
        sessionSample: { sessionId },
        cupperId: userId,
        isDraft: false,
      },
    }),
  ]);
  if (sampleCount === 0 || submittedCount < sampleCount) return;

  // Same routine as the owner close and the cron: reveal → history. Solo
  // sessions never email. Idempotent, so two concurrent submits can't double-run.
  await closeSessionInternal(sessionId, { reason: "solo_auto", emails: "skip" });
}

// ─── Submit a single sample's evaluation (triggers aggregate) ─────────────────
export async function submitSampleEvaluation(sessionSampleId: string) {
  const user = await requireUser();

  const evaluation = await prisma.evaluation.findUnique({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId,
        cupperId: user.id,
      },
    },
    select: { id: true, isDraft: true, sessionSample: { select: { sessionId: true } } },
  });

  if (!evaluation || !evaluation.isDraft) return { ok: true };

  await prisma.evaluation.update({
    where: { id: evaluation.id },
    data: { isDraft: false, submittedAt: new Date() },
  });

  revalidatePath(`/app/sessions/${evaluation.sessionSample.sessionId}/results`);
  return { ok: true };
}

// ─── Submit an evaluation (set isDraft=false) ─────────────────────────────────
export async function submitEvaluation(evaluationId: string) {
  const user = await requireUser();

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: { id: true, cupperId: true, sessionSample: { select: { sessionId: true } } },
  });

  if (!evaluation || evaluation.cupperId !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { isDraft: false, submittedAt: new Date() },
  });

  revalidatePath(
    `/app/sessions/${evaluation.sessionSample.sessionId}/results`,
  );
  return { ok: true };
}

// ─── Start a session (maestro moves past invite screen) ───────────────────────
// Idempotent: only an active, not-yet-started session gets `startedAt`. A
// second click (wizard step 2 AND the master panel both expose this) is a
// no-op instead of resetting the start time.
export async function startSession(sessionId: string) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const res = await prisma.cuppingSession.updateMany({
    where: { id: sessionId, startedAt: null, status: "active" },
    data: { startedAt: new Date() },
  });

  revalidatePath(`/es/app/sessions/${sessionId}/cup`);
  revalidatePath(`/en/app/sessions/${sessionId}/cup`);
  return { ok: true as const, started: res.count > 0 };
}

// ─── Close a session ──────────────────────────────────────────────────────────
// Thin owner-authorized wrapper over lib/closeSession.ts (shared with the solo
// auto-close and the daily cron). Group close emails are queued with
// next/server after() so the click returns as soon as the status flips; their
// per-recipient outcome lands in close_email_deliveries (shown on results).
export async function closeSession(sessionId: string) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const result = await closeSessionInternal(sessionId, { reason: "owner", emails: "after" });

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  revalidatePath(`/es/app/sessions/${sessionId}/cup`);
  revalidatePath(`/en/app/sessions/${sessionId}/cup`);
  return { ok: true as const, closed: result.closed, emailsQueued: result.emailsQueued };
}

// ─── Re-send close emails to participants who did not get theirs ─────────────
// Owner only, closed group sessions only. sendCloseEmails skips every
// recipient already marked "sent", so this only retries failed/skipped rows.
export async function resendCloseEmails(sessionId: string) {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);
  if (!session.isGroup) return { ok: false as const, error: "not_group" };
  if (session.status !== "closed") return { ok: false as const, error: "not_closed" };

  after(async () => {
    try {
      const { sendCloseEmails } = await import("@/lib/closeEmail");
      await sendCloseEmails(sessionId);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          where: "resendCloseEmails",
          sessionId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });

  return { ok: true as const };
}

// ─── Reveal a sample (link coffee identity) ───────────────────────────────────
export async function revealSample(sampleId: string, coffeeId?: string) {
  const user = await requireUser();
  const { sessionId } = await requireSampleOwner(sampleId, user.id);

  // Never trust a client-supplied coffee id: re-validate it against the same
  // usable-coffee rule the wizard and addSessionSample enforce, otherwise an
  // owner could attach ANY user's private coffee to their sample and have its
  // origin data rendered on results / written into coffee history.
  if (coffeeId) {
    const usable = await prisma.coffee.findFirst({
      where: { id: coffeeId, ...usableCoffeeWhere(user.id) },
      select: { id: true },
    });
    if (!usable) throw new Error("coffee_not_usable");
  }

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { revealed: true, ...(coffeeId ? { coffeeId } : {}) },
  });

  revalidatePath(`/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// ─── Complete onboarding for a guest (anonymous) user ────────────────────────
// Called right after supabase.auth.signInAnonymously() on the client, before
// joinViaToken. Upsert (not update) because the DB trigger normally creates
// the Profile row on signup, but we can't depend on its timing relative to
// this call — the upsert makes either ordering safe.
export async function completeGuestOnboarding(name: string) {
  const user = await requireUser({ skipProfileUpsert: true });
  const displayName = name.trim() || "Catador";

  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName, onboardingCompleted: true },
    update: { displayName, onboardingCompleted: true },
  });

  return { ok: true };
}

// ─── Join a session via invite token ─────────────────────────────────────────
// Rules (2026-09-08):
//   * the OWNER opening their own link is a no-op (never demoted to "joined",
//     never burns a use) — mirrors joinCoffeeViaToken
//   * an existing participant re-opening the link is a no-op (no useCount burn)
//   * a closed session's link lands existing members on results and refuses
//     newcomers with `session_closed`
//   * maxUses is enforced INSIDE the transaction (increment-then-check on the
//     locked row, rolled back on overflow) so N simultaneous scans of a
//     10-seat link cannot all get in
export async function joinViaToken(token: string, locale: string = "es") {
  const user = await requireUser();

  const invite = await prisma.sessionInvite.findUnique({
    where: { token },
    select: {
      id: true,
      sessionId: true,
      maxUses: true,
      useCount: true,
      expiresAt: true,
      session: {
        select: { startedAt: true, status: true, createdBy: true, isAsync: true },
      },
    },
  });

  if (!invite) throw new Error("invalid_token");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error("token_expired");
  }

  const { sessionId, session } = invite;
  const base = `/${locale}/app/sessions/${sessionId}`;
  const closed = session.status === "closed";
  const destination = closed
    ? `${base}/results`
    : !session.startedAt && !session.isAsync
      ? `${base}/waiting`
      : `${base}/cup`;

  if (session.createdBy === user.id) {
    redirect(closed ? `${base}/results` : `${base}/cup`);
  }

  const existing = await prisma.sessionParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    select: { userId: true },
  });
  if (existing) redirect(destination);

  if (closed) throw new Error("session_closed");
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    throw new Error("token_exhausted");
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.sessionInvite.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
      select: { useCount: true, maxUses: true },
    });
    // Re-check on the locked row: a concurrent redemption may have taken the
    // last seat between the read above and this increment. Throwing rolls the
    // increment back.
    if (fresh.maxUses !== null && fresh.useCount > fresh.maxUses) {
      throw new Error("token_exhausted");
    }
    await tx.sessionParticipant.create({
      data: { sessionId, userId: user.id, status: "joined" },
    });
  });

  redirect(destination);
}

// ─── Create an invite token ───────────────────────────────────────────────────
export async function createInviteToken(
  sessionId: string,
  maxUses?: number,
  expiresAt?: string,
): Promise<{ token: string }> {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const token = crypto.randomUUID();

  await prisma.sessionInvite.create({
    data: {
      sessionId,
      token,
      maxUses: maxUses ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: user.id,
    },
  });

  return { token };
}

// ─── Exclude / re-include a participant from group results (owner only) ──────
// Sets session_participants.excludedFromResults, then re-fires the aggregate
// trigger for every submitted evaluation in the session so community scores,
// penalties and attrAverages recompute without the excluded cuppers. The
// trigger only fires on `UPDATE OF "isDraft"`, so a no-op write to that column
// is enough to re-run it. Descriptor frequency recomputes on the next page load.
export async function setParticipantExclusion(
  sessionId: string,
  participantUserId: string,
  excluded: boolean,
) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId, userId: participantUserId } },
    data: { excludedFromResults: excluded },
  });

  // Re-fire trg_recompute_aggregate for the whole session. Touching "isDraft"
  // (even to its current value) satisfies `AFTER UPDATE OF "isDraft"`; the
  // WHEN (NEW."isDraft" = false) clause keeps it to submitted evaluations.
  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false
  `;

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true, excluded };
}

// ─── Recompute aggregate scores for all samples in a session (owner only) ────
// Self-healing recompute: re-fires trg_recompute_aggregate for every submitted
// evaluation in the session via a no-op write to "isDraft" (same pattern as
// setParticipantExclusion). The DB trigger is the single source of truth for
// communityScore, penalties and attrAverages — it applies the exclusion and
// completeness filters that a TS-side recomputation would have to duplicate.
// Owner-initiated and rare, so the per-row trigger storm is acceptable.
export async function refreshAggregateScores(sessionId: string) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false
  `;

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// NOTE: the old `syncCoffeeHistory` server action moved to
// lib/coffeeHistory.ts as syncCoffeeHistoryForSession(). It was a public HTTP
// endpoint with no ownership check; the lib function is called internally by
// closeSession after requireSessionOwner.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRegisteredUser } from "@/lib/auth";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleOwner,
  assertSessionWritable,
  assertSessionStarted,
  isSessionExpired,
} from "@/lib/sessionAuth";
import { closeSessionInternal } from "@/lib/closeSession";
import * as v from "@/lib/validate";
import { runLengthMs } from "@/lib/warmup/syncedRun";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import { refireAggregates } from "@/lib/aggregates";

// ─── Submit all draft evaluations for a session ───────────────────────────────
export async function submitAllEvaluations(sessionId: string) {
  const user = await requireUser();
  // Member gate + closed/expired guard (a closed session's results are final)
  // + not-started guard (a participant cannot write before the master starts).
  const auth = await requireSessionMember(sessionId, user.id);

  // F-solo-1: a solo close that threw after the flip leaves the session closed
  // but not finalized. Resubmitting must repair it (phase 2 of the close), not
  // fail with session_closed. A finalized session still falls through to the
  // guard below.
  if (auth.status === "closed" && !auth.isGroup && auth.createdBy === user.id) {
    const repair = await closeSessionInternal(sessionId, {
      reason: "solo_auto",
      emails: "skip",
      repairGraceMs: 0,
    });
    if (repair.repaired) {
      revalidatePath(`/es/app/sessions/${sessionId}/results`);
      revalidatePath(`/en/app/sessions/${sessionId}/results`);
      return { ok: true };
    }
  }

  assertSessionWritable(auth);
  assertSessionStarted({ ...auth, isOwner: auth.createdBy === user.id });

  // Did this cupper already have a submitted evaluation? Needed to detect the
  // submit that flips group results to visible (see touchOnResultsVisible).
  const hadSubmittedBefore = auth.isGroup
    ? (await prisma.evaluation.count({
        where: { cupperId: user.id, isDraft: false, sessionSample: { sessionId } },
      })) > 0
    : true;

  // Single batched update instead of one round-trip per draft eval. The aggregate
  // trigger is FOR EACH ROW, so it still fires once per updated evaluation.
  // The write is conditional on the session still being open (F-grupal-6): a
  // close or a passed `closesAt` that lands between the guard above and this
  // statement cannot be raced past.
  const now = new Date();
  const res = await prisma.evaluation.updateMany({
    where: {
      isDraft: true,
      cupperId: user.id,
      sessionSample: {
        sessionId,
        session: {
          status: { not: "closed" },
          OR: [{ closesAt: null }, { closesAt: { gte: now } }],
        },
      },
    },
    data: { isDraft: false, submittedAt: now },
  });

  if (res.count === 0) {
    // Zero rows is normal (double click, nothing left in draft). Only a session
    // that closed or expired meanwhile is an error.
    const fresh = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: { status: true, closesAt: true },
    });
    if (!fresh || isSessionExpired(fresh)) throw new Error("session_closed");
  } else if (auth.isGroup) {
    await touchOnResultsVisible(sessionId, hadSubmittedBefore);
  }

  await maybeAutoCloseSoloSession(sessionId, user.id);

  // Routes are locale-prefixed — the bare path matched nothing (found while
  // auditing the 2026-09-26 "results look stale" report).
  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// Group results become visible to participants when every participant row has
// a submitted cupper (canViewGroupResults.allSubmitted). Non-owners no longer
// receive peers' evaluation rows over Realtime (S8-01), so the session row is
// touched ONCE, on the submit that flips that rule, and the existing
// `cupping_sessions` UPDATE subscription tells the open results screens.
// One bump per visibility flip: no hot row, no refresh storm.
async function touchOnResultsVisible(sessionId: string, hadSubmittedBefore: boolean) {
  const [participantCount, submittedCuppers] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId } }),
    prisma.evaluation.groupBy({
      by: ["cupperId"],
      where: { isDraft: false, sessionSample: { sessionId } },
    }),
  ]);
  const after = submittedCuppers.length;
  const before = hadSubmittedBefore ? after : after - 1;
  if (participantCount > 0 && after >= participantCount && before < participantCount) {
    await prisma.cuppingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });
  }
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

// ─── Synced warm-up run (S6 warm-up v3 PR3) ───────────────────────────────────
// The master starts the configured exercise for the whole room: one UPDATE on
// cupping_sessions (already in the realtime publication) carries
// warmupStartedAt to every waiting room, which opens the player seeked to
// now − warmupStartedAt. Idempotent: a second click while a run is in
// progress returns the existing timestamp; a finished run can be restarted.
export async function startWarmup(
  sessionId: string,
): Promise<ActionResult<{ warmupStartedAt: string; serverNow: string }>> {
  return run(
    "startWarmup",
    async () => {
      const user = await requireUser();
      const session = await requireSessionOwner(sessionId, user.id);
      assertSessionWritable(session);
      const row = await prisma.cuppingSession.findUnique({
        where: { id: sessionId },
        select: { isGroup: true, isAsync: true, status: true, startedAt: true, warmupExerciseId: true, warmupStartedAt: true },
      });
      if (!row || !row.isGroup || row.isAsync || row.status !== "active" || row.startedAt || !row.warmupExerciseId) {
        throw new Error("invalid_input");
      }
      const runMs = runLengthMs(row.warmupExerciseId);
      const now = new Date();
      const res = await prisma.cuppingSession.updateMany({
        where: {
          id: sessionId,
          isGroup: true,
          isAsync: false,
          status: "active",
          startedAt: null,
          warmupExerciseId: { not: null },
          OR: [{ warmupStartedAt: null }, { warmupStartedAt: { lt: new Date(now.getTime() - runMs) } }],
        },
        data: { warmupStartedAt: now },
      });
      let startedAt = now;
      if (res.count === 0) {
        // A run is in progress (double click / second device): join it.
        const current = await prisma.cuppingSession.findUnique({
          where: { id: sessionId },
          select: { warmupStartedAt: true },
        });
        if (!current?.warmupStartedAt) throw new Error("invalid_input");
        startedAt = current.warmupStartedAt;
      }
      revalidatePath(`/es/app/sessions/${sessionId}/waiting`);
      revalidatePath(`/en/app/sessions/${sessionId}/waiting`);
      return { warmupStartedAt: startedAt.toISOString(), serverNow: new Date().toISOString() };
    },
    { sessionId },
  );
}

export async function stopWarmup(sessionId: string): Promise<ActionResult<{ stopped: boolean }>> {
  return run(
    "stopWarmup",
    async () => {
      const user = await requireUser();
      const session = await requireSessionOwner(sessionId, user.id);
      assertSessionWritable(session);
      const res = await prisma.cuppingSession.updateMany({
        where: { id: sessionId, startedAt: null, warmupStartedAt: { not: null } },
        data: { warmupStartedAt: null },
      });
      revalidatePath(`/es/app/sessions/${sessionId}/waiting`);
      revalidatePath(`/en/app/sessions/${sessionId}/waiting`);
      return { stopped: res.count > 0 };
    },
    { sessionId },
  );
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

// ─── Reveal a sample (show its already-linked coffee identity) ────────────────
// Never takes a coffee id: linking a coffee after the fact goes through
// updateSampleMetadata. Closed/expired sessions are read-only (F-sesiones-2).
export async function revealSample(sampleId: string): Promise<ActionResult> {
  return run("revealSample", async () => {
    const user = await requireUser();
    const auth = await requireSampleOwner(sampleId, user.id);
    assertSessionWritable(auth);

    await prisma.sessionSample.update({
      where: { id: sampleId },
      data: { revealed: true },
    });

    revalidatePath(`/app/sessions/${auth.sessionId}/results`);
  });
}

// ─── Complete onboarding for a guest (anonymous) user ────────────────────────
// Called right after supabase.auth.signInAnonymously() on the client, before
// joinViaToken. Upsert (not update) because the DB trigger normally creates
// the Profile row on signup, but we can't depend on its timing relative to
// this call — the upsert makes either ordering safe.
export async function completeGuestOnboarding(name: string) {
  const user = await requireUser({ skipProfileUpsert: true });
  const displayName = v.str(name, "name", { max: 80, required: false }) ?? "Catador";

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
        select: { startedAt: true, status: true, closesAt: true, createdBy: true, isAsync: true },
      },
    },
  });

  if (!invite) throw new Error("invalid_token");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error("token_expired");
  }

  const { sessionId, session } = invite;
  const base = `/${locale}/app/sessions/${sessionId}`;
  const closed = isSessionExpired(session, new Date());
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
  const user = await requireRegisteredUser();
  assertSessionWritable(await requireSessionOwner(sessionId, user.id));

  // 0 / negative would mint a dead-on-arrival token; a past date a pre-expired
  // one — both reject as invalid_input.
  const safeMaxUses =
    maxUses === undefined || maxUses === null ? null : v.int(maxUses, "maxUses", 1, 1000);
  const safeExpiresAt = expiresAt ? v.isoDate(expiresAt, "expiresAt", { future: true }) : null;

  const token = crypto.randomUUID();

  await prisma.sessionInvite.create({
    data: {
      sessionId,
      token,
      maxUses: safeMaxUses,
      expiresAt: safeExpiresAt,
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

  // S8-04: the refire itself lives in lib/aggregates.ts (shared with the close
  // routine); this action is only the owner-gated wrapper.
  await refireAggregates(sessionId);

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// NOTE: the old `syncCoffeeHistory` server action moved to
// lib/coffeeHistory.ts as syncCoffeeHistoryForSession(). It was a public HTTP
// endpoint with no ownership check; the lib function is called internally by
// closeSession after requireSessionOwner.

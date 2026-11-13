"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRegisteredUser, requireUserExpecting } from "@/lib/auth";
import { IDENTITY_CHANGED } from "@/lib/expectedUser";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleOwner,
  assertSessionWritable,
  assertSessionStarted,
  isSessionExpired,
} from "@/lib/sessionAuth";
import { evaluateJoin } from "@/lib/joinRules";
import { regenerateSessionInvite, resolveOrCreateSessionInvite } from "@/lib/invites";
import { sessionHref } from "@/lib/sessionRouting";
import { closeSessionInternal } from "@/lib/closeSession";
import * as v from "@/lib/validate";
import { runLengthMs } from "@/lib/warmup/syncedRun";
import { noticeOutcome, shouldNotifyAtStart } from "@/lib/groupNotify";
import { notifyGroupOfSession } from "@/app/actions/groups";
import { run } from "@/lib/safeAction";
import { logWarn } from "@/lib/log";
import { syncCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import { EXCLUSION_REASONS, exclusionData } from "@/lib/exclusionReasons";
import type { ActionResult } from "@/lib/actionResult";
import { refireAggregates } from "@/lib/aggregates";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { countUnsentComplete, isEvaluationComplete, planFinish } from "@/lib/closeRules";
import { removeSamplesInTx } from "@/lib/sampleRemoval";

// ─── Submit all draft evaluations for a session ───────────────────────────────
// S8-10 T11 (F-solo-6): interactive, so ActionResult. A second submit after the
// solo auto-close used to throw `session_closed`; now a cupper who already has
// submitted work gets `{ closed: true, submitted: 0 }` — the final state — and
// only someone with nothing submitted sees the error.
export async function submitAllEvaluations(
  sessionId: string,
  // S10 WP8 (shared device): the user the cup page was RENDERED for. Optional;
  // absent = today's behaviour. A different (or missing) signed-in user writes
  // nothing and returns the ActionResult error `identity_changed`.
  expectedUserId?: string,
): Promise<ActionResult<{ closed: boolean; submitted: number }>> {
  return run("submitAllEvaluations", () => submitAllEvaluationsBody(sessionId, expectedUserId), { sessionId });
}

async function submitAllEvaluationsBody(
  sessionId: string,
  expectedUserId?: string,
): Promise<{ closed: boolean; submitted: number }> {
  const user = await requireUserExpecting(expectedUserId);
  // Member gate + closed/expired guard (a closed session's results are final)
  // + not-started guard (a participant cannot write before the master starts).
  const auth = await requireSessionMember(sessionId, user.id);

  // F-solo-1 (S8-05): a solo close that threw after the flip leaves the session
  // closed but not finalized. Resubmitting must repair it (phase 2 of the
  // close), not fail with session_closed. A finalized session falls through.
  if (auth.status === "closed" && !auth.isGroup && auth.createdBy === user.id) {
    const repair = await closeSessionInternal(sessionId, {
      reason: "solo_auto",
      emails: "skip",
      repairGraceMs: 0,
    });
    if (repair.repaired) {
      revalidatePath(`/es/app/sessions/${sessionId}/results`);
      revalidatePath(`/en/app/sessions/${sessionId}/results`);
      return { closed: true, submitted: 0 };
    }
  }

  if (isSessionExpired(auth)) {
    // S8-10: double submit after the (solo) auto-close: already final for a
    // cupper who has submitted work. Someone with nothing submitted still errors.
    const done = await prisma.evaluation.count({
      where: { cupperId: user.id, isDraft: false, sessionSample: { sessionId } },
    });
    if (done > 0) return { closed: true, submitted: 0 };
  }

  assertSessionWritable(auth);
  assertSessionStarted({ ...auth, isOwner: auth.createdBy === user.id });

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
  }

  await maybeAutoCloseSoloSession(sessionId, user.id);

  // Routes are locale-prefixed — the bare path matched nothing (found while
  // auditing the 2026-09-26 "results look stale" report).
  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  const finalRow = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  return { closed: finalRow?.status === "closed", submitted: res.count };
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

// ─── Manual finish for solo / express sessions (F-express-1, F-solo-3) ────────
// The one bend of "solo has no manual close": a quick session with fewer cupped
// samples than created otherwise never closes (auto-close needs EVERY sample
// submitted). Submits the owner's COMPLETE drafts, removes only samples that
// have no evaluation at all, keeps partial drafts unscored (Kim C2 default a;
// no editing after closing), then closes through the single close routine.
// Group sessions never use this (they close via closeSession / the cron).
export async function finishSoloSession(
  sessionId: string,
  /** S10 WP8: see submitAllEvaluations. Absent = today's behaviour. */
  expectedUserId?: string,
): Promise<ActionResult<{ closed: boolean; scored: number; removed: number; kept: number }>> {
  return run(
    "finishSoloSession",
    async () => {
      const user = await requireUserExpecting(expectedUserId);
      const auth = await requireSessionOwner(sessionId, user.id);
      assertSessionWritable(auth);
      if (auth.isGroup) throw new Error("invalid_input");

      const session = await prisma.cuppingSession.findUnique({
        where: { id: sessionId },
        select: {
          format: true,
          samples: {
            select: {
              id: true,
              referenceRank: true,
              physical: { select: { id: true } },
              extrinsic: { select: { id: true } },
              evaluations: {
                where: { cupperId: user.id },
                select: {
                  isDraft: true,
                  descriptiveData: true,
                  affectiveData: true,
                  combinedData: true,
                  cupperId: true,
                },
              },
            },
          },
        },
      });
      if (!session) throw new Error("not_found_or_forbidden");

      const plan = planFinish(
        session.samples.map((s) => {
          const ev = s.evaluations[0];
          return {
            id: s.id,
            hasOtherData: s.physical !== null || s.extrinsic !== null,
            isReference: s.referenceRank !== null,
            evaluation: ev ? { isDraft: ev.isDraft, complete: isEvaluationComplete(ev, session.format) } : null,
          };
        }),
      );
      // Nothing scored would leave an empty session: the owner keeps cupping.
      if (!plan.canFinish) throw new Error("invalid_input");

      const now = new Date();
      if (plan.submitIds.length > 0) {
        await prisma.evaluation.updateMany({
          where: {
            isDraft: true,
            cupperId: user.id,
            sessionSampleId: { in: plan.submitIds },
            sessionSample: { sessionId, session: { status: { not: "closed" } } },
          },
          data: { isDraft: false, submittedAt: now },
        });
      }

      // Only samples that STILL have no evaluation are removed (a concurrent
      // save between the read above and here keeps its sample).
      let removed = 0;
      if (plan.removeIds.length > 0) {
        removed = await prisma.$transaction(async (tx) => {
          const safe = await tx.sessionSample.findMany({
            where: {
              id: { in: plan.removeIds },
              sessionId,
              evaluations: { none: {} },
              // physical / extrinsic cascade on delete: never prune them.
              physical: null,
              extrinsic: null,
            },
            select: { id: true },
          });
          await removeSamplesInTx(tx, sessionId, safe.map((x) => x.id), { onReactivate: "ignore" });
          return safe.length;
        });
      }

      const result = await closeSessionInternal(sessionId, {
        reason: "solo_finish",
        emails: "skip",
        repairGraceMs: 0,
      });

      revalidatePath(`/es/app/sessions/${sessionId}/results`);
      revalidatePath(`/en/app/sessions/${sessionId}/results`);
      revalidatePath(`/es/app/sessions/${sessionId}/cup`);
      revalidatePath(`/en/app/sessions/${sessionId}/cup`);
      return {
        closed: result.closed || result.repaired === true,
        scored: plan.scoredCount,
        removed,
        kept: plan.keptPartialIds.length,
      };
    },
    { sessionId },
  );
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

  // S8-17 (C8): the group "new session" email goes out HERE for live sessions,
  // only when THIS call flipped the row (count === 1), so a double click or the
  // second entry point never sends twice. A failed/limited send never blocks
  // the start: it is reported as `groupNotice` for a non-blocking owner notice.
  const groupNotice = await notifyGroupAtStart(sessionId, res.count === 1);

  revalidatePath(`/es/app/sessions/${sessionId}/cup`);
  revalidatePath(`/en/app/sessions/${sessionId}/cup`);
  return { ok: true as const, started: res.count > 0, groupNotice };
}

async function notifyGroupAtStart(
  sessionId: string,
  startFlipped: boolean,
): Promise<"sent" | "partial" | "rate_limited" | "failed" | undefined> {
  try {
    const s = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: {
        isGroup: true,
        isAsync: true,
        groupId: true,
        notifyGroupAtStart: true,
        groupNotifiedAt: true,
      },
    });
    if (
      !s ||
      !s.groupId ||
      !shouldNotifyAtStart({
        isGroup: s.isGroup,
        isAsync: s.isAsync,
        hasGroup: true,
        notifyGroupAtStart: s.notifyGroupAtStart,
        alreadyNotified: s.groupNotifiedAt !== null,
        startFlipped,
      })
    ) {
      return undefined;
    }
    // notifyGroupOfSession claims the stamp atomically (two concurrent starts
    // cannot both send; the loser gets invalid_input) and releases it itself
    // when nothing went out (S8-28 D-09).
    const res = await notifyGroupOfSession({ groupId: s.groupId, sessionId });
    if (res.ok) {
      // `ok` is true even when every recipient failed: the summary decides.
      return noticeOutcome(res.data);
    }
    // invalid_input = another start already claimed the stamp: nothing to say.
    if (res.error === "invalid_input") return undefined;
    return res.error === "rate_limited" ? "rate_limited" : "failed";
  } catch (err) {
    logWarn({
      where: "startSession",
      message: "notify_group_at_start_threw",
      sessionId,
      code: (err as { code?: string })?.code ?? "unknown",
    });
    return "failed";
  }
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

// ─── What closing now would leave out (F-grupal-2) ────────────────────────────
// Owner-only read for the close dialog: how many cuppers hold COMPLETE drafts
// that were never sent. Under the default draft policy (lib/closeRules.ts
// DRAFT_AT_CLOSE = "exclude") those do not count once the session closes.
// Counts only; no names, no evaluation content.
export async function getCloseImpact(
  sessionId: string,
): Promise<{ unsentCuppers: number; unsentEvaluations: number }> {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { format: true },
  });
  if (!session) return { unsentCuppers: 0, unsentEvaluations: 0 };
  const drafts = await prisma.evaluation.findMany({
    where: { sessionSample: { sessionId }, isDraft: true },
    select: {
      cupperId: true,
      isDraft: true,
      descriptiveData: true,
      affectiveData: true,
      combinedData: true,
    },
  });
  const c = countUnsentComplete(drafts, session.format);
  return { unsentCuppers: c.cuppers, unsentEvaluations: c.evaluations };
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
  return {
    ok: true as const,
    closed: result.closed,
    emailsQueued: result.emailsQueued,
    // false: a post-close step failed and the repair pass will retry it.
    finalized: result.finalized !== false,
  };
}

// ─── Re-send close emails to participants who did not get theirs ─────────────
// Owner only, closed group sessions only. sendCloseEmails skips every
// recipient already marked "sent", so this only retries failed/skipped rows.
export async function resendCloseEmails(sessionId: string) {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);
  if (!session.isGroup) return { ok: false as const, error: "not_group" };
  if (session.status !== "closed") return { ok: false as const, error: "not_closed" };

  // Nothing claimable (everyone sent, or held by a fresh "sending" lease):
  // return before spending a resend from the budget.
  const { hasClaimableCloseRecipients } = await import("@/lib/closeEmail");
  if (!(await hasClaimableCloseRecipients(sessionId))) {
    return { ok: true as const, nothingToSend: true as const };
  }

  // S9-01 (A-09): bounded per session (CLOSE_RESEND_PER_SESSION in
  // lib/emailLimits.ts). Reserved before the work, like every sender.
  const budget = await reserveEmailBudget({ kind: "close_resend", sessionId });
  if (!budget.allowed) return { ok: false as const, error: "rate_limited" };

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

  return { ok: true as const, nothingToSend: false as const };
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
//
// S10 WP8 (fourth review): the join form passes the id `signInAnonymously`
// returned (or the anonymous user it reuses) as `expectedUserId`. If the cookie
// meanwhile holds a DIFFERENT user (another tab signed someone else in), nothing
// is written and the answer is `{ ok: false, error: "identity_changed" }`;
// nobody signed in / auth unreachable stay `not_authenticated`, as before.
export async function completeGuestOnboarding(
  name: string,
  expectedUserId?: string,
): Promise<{ ok: true } | { ok: false; error: "identity_changed" }> {
  let user;
  try {
    user = await requireUserExpecting(expectedUserId, { skipProfileUpsert: true });
  } catch (e) {
    if (expectedUserId !== undefined && e instanceof Error && e.message === IDENTITY_CHANGED) {
      return { ok: false, error: IDENTITY_CHANGED };
    }
    throw e;
  }
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
      active: true,
      session: {
        select: {
          id: true,
          startedAt: true,
          status: true,
          closesAt: true,
          createdBy: true,
          isAsync: true,
          isGroup: true,
          entriesLocked: true,
        },
      },
    },
  });

  if (!invite) throw new Error("invalid_token");
  const { sessionId, session } = invite;
  // Only group sessions have a join flow (a solo link must not mint members).
  if (!session.isGroup) throw new Error("invalid_input");

  const existing = await prisma.sessionParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    select: { userId: true },
  });

  // The same pure rule the /join page renders (lib/joinRules.ts): owner and
  // members go straight in even with a dead link; newcomers are refused by
  // closed > entries closed > revoked/expired > exhausted.
  const decision = evaluateJoin(
    { invite, session, viewer: { userId: user.id, isMember: !!existing } },
    locale,
  );
  switch (decision.kind) {
    case "redirect":
      redirect(decision.href);
    case "closed":
      throw new Error("session_closed");
    case "expired":
      throw new Error("token_expired");
    case "exhausted":
      throw new Error("token_exhausted");
    case "entries_closed":
      throw new Error("entries_closed");
    case "invalid":
      throw new Error("invalid_token");
    case "ok":
      break;
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.sessionInvite.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
      select: {
        useCount: true,
        maxUses: true,
        active: true,
        session: { select: { entriesLocked: true } },
      },
    });
    // Re-check on the locked row: a concurrent redemption may have taken the
    // last seat, the owner may have regenerated the link or closed entries
    // between the read above and this increment. Throwing rolls the
    // increment back. (Only newcomers reach here; members/owner redirected.)
    if (!fresh.active) throw new Error("token_expired");
    if (fresh.session.entriesLocked) throw new Error("entries_closed");
    if (fresh.maxUses !== null && fresh.useCount > fresh.maxUses) {
      throw new Error("token_exhausted");
    }
    await tx.sessionParticipant.create({
      data: { sessionId, userId: user.id, status: "joined" },
    });
  });

  // A latecomer joins a started session: same destination as everyone else.
  redirect(sessionHref(session, { locale, isOwner: false }));
}

// ─── Create an invite token ───────────────────────────────────────────────────
// Idempotent (S8-11 T5): opening "Invitar" twice shows ONE link — the newest
// active, unexpired invite with seats left, minted only when none exists.
// `regenerate: true` revokes every earlier token (`active = false`, they read
// as expired on /join) and mints a new one in one transaction. Explicit
// `maxUses` / `expiresAt` are a deliberate new link, so they mint as before.
export async function createInviteToken(
  sessionId: string,
  maxUses?: number,
  expiresAt?: string,
  regenerate?: boolean,
): Promise<ActionResult<{ token: string }>> {
  return run(
    "createInviteToken",
    async () => {
      const user = await requireRegisteredUser();
      assertSessionWritable(await requireSessionOwner(sessionId, user.id));

      // 0 / negative would mint a dead-on-arrival token; a past date a
      // pre-expired one — both reject as invalid_input.
      const safeMaxUses =
        maxUses === undefined || maxUses === null ? null : v.int(maxUses, "maxUses", 1, 1000);
      const safeExpiresAt = expiresAt ? v.isoDate(expiresAt, "expiresAt", { future: true }) : null;

      if (regenerate === true) {
        const token = await regenerateSessionInvite(sessionId, user.id, {
          maxUses: safeMaxUses,
          expiresAt: safeExpiresAt,
        });
        return { token };
      }
      if (safeMaxUses === null && safeExpiresAt === null) {
        return { token: await resolveOrCreateSessionInvite(sessionId, user.id) };
      }
      const token = crypto.randomUUID();
      await prisma.sessionInvite.create({
        data: { sessionId, token, maxUses: safeMaxUses, expiresAt: safeExpiresAt, createdBy: user.id },
      });
      return { token };
    },
    { sessionId },
  );
}

// ─── Close / reopen new entries (owner only, S8-11 T6 / C4 default a) ────────
// `entriesLocked` only gates NEWCOMERS in joinViaToken (`entries_closed`);
// members re-enter. Display/gating state: never read by scoring, the
// aggregate trigger or AggregateScore.
export async function setEntriesLocked(
  sessionId: string,
  locked: boolean,
): Promise<ActionResult<{ entriesLocked: boolean }>> {
  return run(
    "setEntriesLocked",
    async () => {
      if (typeof locked !== "boolean") throw new Error("invalid_input");
      const user = await requireRegisteredUser();
      assertSessionWritable(await requireSessionOwner(sessionId, user.id));
      // Only group sessions have entries to close.
      const { count } = await prisma.cuppingSession.updateMany({
        where: { id: sessionId, isGroup: true },
        data: { entriesLocked: locked },
      });
      if (count === 0) throw new Error("invalid_input");
      return { entriesLocked: locked };
    },
    { sessionId },
  );
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
  reason?: string,
): Promise<ActionResult<{ excluded: boolean }>> {
  return run(
    "setParticipantExclusion",
    async () => {
      const user = await requireUser();
      // Owner only. Deliberately NOT behind assertSessionWritable: excluding (or
      // restoring) a cupper after the close is a sanctioned post-close write
      // (S8-12, F-resultados-5). It is stamped with author/time/reason so the
      // change is traceable, and the results page says "actualizados el".
      const auth = await requireSessionOwner(sessionId, user.id);
      const nextExcluded = excluded === true;
      const nextReason = nextExcluded ? v.oneOf(reason, "reason", EXCLUSION_REASONS) : null;
      const target = v.str(participantUserId, "participantUserId", { max: 64 }) as string;

      await prisma.sessionParticipant.update({
        where: { sessionId_userId: { sessionId, userId: target } },
        data: exclusionData({
          excluded: nextExcluded,
          reason: nextReason,
          userId: user.id,
          now: new Date(),
        }),
      });

      // Re-fire trg_recompute_aggregate for the whole session (lib/aggregates.ts).
      await refireAggregates(sessionId);

      // A closed session already wrote each cupper's coffee history with the
      // community score of the day; refresh it so the profile does not keep the
      // pre-exclusion number. Best effort: the exclusion itself is committed.
      if (auth.status === "closed") {
        try {
          await syncCoffeeHistoryForSession(sessionId);
        } catch (err) {
          logWarn({
            where: "setParticipantExclusion.history_sync_failed",
            sessionId,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      revalidatePath(`/es/app/sessions/${sessionId}/results`);
      revalidatePath(`/en/app/sessions/${sessionId}/results`);
      return { excluded: nextExcluded };
    },
    { sessionId },
  );
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

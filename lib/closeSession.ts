import "server-only";

// THE single close routine. Owner close (app/actions/community.ts), solo
// auto-close / manual finish, and the daily deadline cron
// (app/api/cron/close-expired-sessions) all call this, so the paths can never
// drift. It runs in two phases (S8-05):
//
//   phase 1  the idempotent guarded flip: status -> closed, closedAt
//   phase 2  finalizeClosedSession: reveal coffee-linked samples -> refire the
//            aggregate trigger -> coffee history -> close emails (group only)
//            -> stamp closeFinalizedAt
//
// Phase 2 is retryable on its own: a failed step is logged at error level, the
// stamp is NOT written, and the next closeSessionInternal call (solo resubmit,
// owner close) or the cron repair pass runs phase 2 again. Every step is
// idempotent and the email ledger skips recipients already sent, so a repair
// never duplicates rows or mail. A session whose phase 2 completed is a no-op.
//
// Callers MUST authorize first (requireSessionOwner, or the cron's secret) --
// this is a plain library function, not a server action. Nothing else may
// write status "closed".

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import { refireAggregates } from "@/lib/aggregates";
import { FINALIZE_GRACE_MS, needsFinalize } from "@/lib/closeRules";
import { errorMessage, logError, logInfo } from "@/lib/log";

/** `owner_deleted`: deleteAccount closes the live group sessions it keeps for
 *  the other cuppers, so none stays open with nobody able to close it (S8-19). */
export type CloseReason = "owner" | "solo_auto" | "solo_finish" | "cron" | "idle" | "repair" | "owner_deleted";

export type CloseResult = {
  /** false when the session was already closed (no-op, nothing re-sent). */
  closed: boolean;
  isGroup: boolean;
  /** Group sessions: participants whose close email was queued this call. */
  emailsQueued: number;
  /** true when this call re-ran phase 2 of a session closed earlier. */
  repaired?: boolean;
  /** false when a phase 2 step failed; the repair pass will retry it. */
  finalized?: boolean;
};

type EmailMode = "after" | "await" | "skip";

async function stampFinalized(sessionId: string): Promise<void> {
  await prisma.cuppingSession.updateMany({
    where: { id: sessionId, closeFinalizedAt: null },
    data: { closeFinalizedAt: new Date() },
  });
}

/**
 * Phase 2. Safe to call any number of times on a closed session. Never throws
 * for a failed step: it logs `closeSession.finalize` at error level (search the
 * Vercel logs for it) and leaves closeFinalizedAt null so a repair is owed.
 * Returns whether every step succeeded and how many emails were queued.
 */
export async function finalizeClosedSession(
  sessionId: string,
  opts: { reason: CloseReason; emails: EmailMode },
): Promise<{ finalized: boolean; emailsQueued: number }> {
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, _count: { select: { participants: true } } },
  });
  if (!session) return { finalized: false, emailsQueued: 0 };

  let ok = true;
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      ok = false;
      logError({
        where: "closeSession.finalize",
        step: name,
        reason: opts.reason,
        sessionId,
        message: errorMessage(err),
      });
    }
  };

  // Blind ends at close: reveal every coffee-linked sample so the history
  // sync below (revealed-only) actually writes rows.
  await step("reveal", () =>
    prisma.sessionSample.updateMany({
      where: { sessionId, coffeeId: { not: null }, revealed: false },
      data: { revealed: true },
    }),
  );

  // S8-04 (F-solo-2): history copies the STORED aggregate, so make sure it is
  // current before reading it.
  await step("refireAggregates", () => refireAggregates(sessionId));

  await step("coffeeHistory", () => syncCoffeeHistoryForSession(sessionId));

  if (!session.isGroup || opts.emails === "skip") {
    if (ok) await stampFinalized(sessionId);
    return { finalized: ok, emailsQueued: 0 };
  }

  // Group: the stamp is written only after the email pass ran without a
  // thrown error (per-recipient failures are ledgered, not thrown), so a pass
  // that died halfway is repaired by the cron.
  const stepsOk = ok;
  const runEmails = async () => {
    let emailsOk = true;
    try {
      const { sendCloseEmails } = await import("@/lib/closeEmail");
      const summary = await sendCloseEmails(sessionId);
      logInfo({ where: "closeSession.emails", reason: opts.reason, sessionId, ...summary });
    } catch (err) {
      emailsOk = false;
      logError({
        where: "closeSession.finalize",
        step: "emails",
        reason: opts.reason,
        sessionId,
        message: errorMessage(err),
      });
    }
    if (stepsOk && emailsOk) {
      try {
        await stampFinalized(sessionId);
      } catch (err) {
        logError({ where: "closeSession.finalize", step: "stamp", sessionId, message: errorMessage(err) });
      }
    }
  };

  if (opts.emails === "after") after(runEmails);
  else await runEmails();

  return { finalized: stepsOk, emailsQueued: session._count.participants };
}

export async function closeSessionInternal(
  sessionId: string,
  opts: {
    reason: CloseReason;
    /** "after": queue emails with next/server `after()` so the response is
     *  not blocked by N PDF renders (server actions). "await": run inline
     *  (cron route, where there is no user waiting). "skip": tests / solo. */
    emails: EmailMode;
    /** How long a closed-but-unfinalized session must have been closed before
     *  THIS call repairs it (default 5 min, so a double click never races the
     *  call that is still finishing). Solo callers pass 0: no emails, and the
     *  owner is waiting on the retry. */
    repairGraceMs?: number;
  },
): Promise<CloseResult> {
  // Phase 1. Idempotent: only an active session flips. A second click, a
  // concurrent call or a cron retry sees count === 0 here.
  const flipped = await prisma.cuppingSession.updateMany({
    where: { id: sessionId, status: { not: "closed" } },
    data: { status: "closed", closedAt: new Date() },
  });
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, status: true, closedAt: true, closeFinalizedAt: true },
  });
  if (!session) return { closed: false, isGroup: false, emailsQueued: 0 };

  if (flipped.count === 0) {
    // Already closed. Repair phase 2 only if it never finished and the
    // original close is old enough not to be still in flight.
    const grace = opts.repairGraceMs ?? FINALIZE_GRACE_MS;
    const owed = needsFinalize(session, Date.now(), grace);
    if (!owed) return { closed: false, isGroup: session.isGroup, emailsQueued: 0 };
    const r = await finalizeClosedSession(sessionId, { reason: opts.reason, emails: opts.emails });
    return {
      closed: false,
      isGroup: session.isGroup,
      emailsQueued: r.emailsQueued,
      repaired: true,
      finalized: r.finalized,
    };
  }

  const r = await finalizeClosedSession(sessionId, { reason: opts.reason, emails: opts.emails });
  return {
    closed: true,
    isGroup: session.isGroup,
    emailsQueued: r.emailsQueued,
    finalized: r.finalized,
  };
}

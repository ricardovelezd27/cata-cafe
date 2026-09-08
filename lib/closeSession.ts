import "server-only";

// THE single close routine. Owner close (app/actions/community.ts), solo
// auto-close (submitAllEvaluations) and the daily deadline cron
// (app/api/cron/close-expired-sessions) all call this, so the three paths can
// never drift: idempotent status flip → reveal coffee-linked samples → coffee
// history → close emails (group only).
//
// Callers MUST authorize first (requireSessionOwner, or the cron's secret) —
// this is a plain library function, not a server action.

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCoffeeHistoryForSession } from "@/lib/coffeeHistory";

export type CloseReason = "owner" | "solo_auto" | "cron";

export type CloseResult = {
  /** false when the session was already closed (no-op, nothing re-sent). */
  closed: boolean;
  isGroup: boolean;
  /** Group sessions: participants whose close email was queued this call. */
  emailsQueued: number;
};

export async function closeSessionInternal(
  sessionId: string,
  opts: {
    reason: CloseReason;
    /** "after": queue emails with next/server `after()` so the response is
     *  not blocked by N PDF renders (server actions). "await": run inline
     *  (cron route, where there is no user waiting). "skip": tests / solo. */
    emails: "after" | "await" | "skip";
  },
): Promise<CloseResult> {
  // Idempotent: only an active session flips. A second click, a concurrent
  // call or a cron retry sees count === 0 and stops here — no second history
  // sync, no second email blast.
  const flipped = await prisma.cuppingSession.updateMany({
    where: { id: sessionId, status: { not: "closed" } },
    data: { status: "closed", closedAt: new Date() },
  });
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, _count: { select: { participants: true } } },
  });
  if (!session) return { closed: false, isGroup: false, emailsQueued: 0 };
  if (flipped.count === 0) {
    return { closed: false, isGroup: session.isGroup, emailsQueued: 0 };
  }

  // Blind ends at close: reveal every coffee-linked sample so the history
  // sync below (revealed-only) actually writes rows. Before this lived here,
  // a group close with unrevealed samples wrote ZERO UserCoffeeHistory rows.
  await prisma.sessionSample.updateMany({
    where: { sessionId, coffeeId: { not: null }, revealed: false },
    data: { revealed: true },
  });

  await syncCoffeeHistoryForSession(sessionId);

  if (!session.isGroup || opts.emails === "skip") {
    return { closed: true, isGroup: session.isGroup, emailsQueued: 0 };
  }

  const run = async () => {
    try {
      const { sendCloseEmails } = await import("@/lib/closeEmail");
      const summary = await sendCloseEmails(sessionId);
      console.info(
        JSON.stringify({
          level: "info",
          where: "closeSession",
          reason: opts.reason,
          sessionId,
          ...summary,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          where: "closeSession.emails",
          reason: opts.reason,
          sessionId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  if (opts.emails === "after") after(run);
  else await run();

  return {
    closed: true,
    isGroup: true,
    emailsQueued: session._count.participants,
  };
}

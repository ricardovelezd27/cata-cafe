// Cron pass: close live group sessions nobody has touched for LIVE_AUTO_CLOSE_MS
// (S10 WP4a, Kim C3; TODO(kim-validar:C3)). Called by
// app/api/cron/close-expired-sessions. The close itself is the ONE close routine
// (closeSessionInternal, reason "idle"); this file only picks the candidates.
// Bounded (batch, oldest first), a failure on one session is logged and does not
// stop the others, and it never touches solo, async, dated or never-started
// sessions (the same shape as isLiveIdle / the live_idle reminder).

import { prisma } from "@/lib/prisma";
import { closeSessionInternal } from "@/lib/closeSession";
import { idleCloseEmailMode, isLiveAbandoned, liveIdleMs, LIVE_AUTO_CLOSE_MS } from "@/lib/closeRules";
import { errorMessage, logError, logWarn } from "@/lib/log";

export type IdleCloseSummary = {
  /** Candidates examined this run. */
  examined: number;
  /** Sessions closed by this run (with or without emails). */
  idleClosed: number;
  /** Of those, closed silently: idle 30 days or more, no close email sent (review H2). */
  idleClosedSilently: number;
  /** The batch was full: more may be waiting for the next run. */
  idleTruncated: boolean;
  /** The time budget ran out before the batch was done (review M1). */
  idleBudgetTruncated: boolean;
  results: { id: string; closed: boolean; emailsQueued: number; silent?: boolean; error?: string }[];
};

export function emptyIdleCloseSummary(): IdleCloseSummary {
  return {
    examined: 0,
    idleClosed: 0,
    idleClosedSilently: 0,
    idleTruncated: false,
    idleBudgetTruncated: false,
    results: [],
  };
}

export async function closeIdleLiveSessions(
  batch: number,
  now: number = Date.now(),
  opts: { mayStart?: () => boolean | Promise<boolean> } = {},
): Promise<IdleCloseSummary> {
  const cutoff = new Date(now - LIVE_AUTO_CLOSE_MS);
  // The evaluation filter keeps sessions that are busy out of the batch (they
  // would otherwise fill it forever); isLiveAbandoned below is the rule itself.
  const candidates = await prisma.cuppingSession.findMany({
    where: {
      isGroup: true,
      isAsync: false,
      closesAt: null,
      status: "active",
      startedAt: { not: null, lte: cutoff },
      samples: { none: { evaluations: { some: { updatedAt: { gt: cutoff } } } } },
    },
    select: { id: true },
    orderBy: { startedAt: "asc" },
    take: batch,
  });
  const summary = emptyIdleCloseSummary();
  summary.examined = candidates.length;
  summary.idleTruncated = candidates.length === batch;
  if (candidates.length === 0) return summary;

  for (const c of candidates) {
    if (opts.mayStart && !(await opts.mayStart())) {
      summary.idleBudgetTruncated = true;
      logWarn({ where: "cron.closeIdle", message: "time budget spent, rest left for the next run" });
      break;
    }
    // Re-check right before closing (review, race): the owner may have closed
    // it, or someone may have saved an evaluation since the batch was read.
    const s = await prisma.cuppingSession.findUnique({
      where: { id: c.id },
      select: { id: true, isGroup: true, isAsync: true, closesAt: true, status: true, startedAt: true },
    });
    if (!s) continue;
    // "Activity" is an evaluation being saved (Evaluation.sessionId is nullable,
    // so go through the sample relation).
    const last = await prisma.evaluation.aggregate({
      where: { sessionSample: { sessionId: s.id } },
      _max: { updatedAt: true },
    });
    const lastAt = last._max.updatedAt ?? null;
    if (!isLiveAbandoned(s, lastAt, now)) continue;
    const idleMs = liveIdleMs(s, lastAt, now) ?? 0;
    const mode = idleCloseEmailMode(idleMs);
    try {
      const r = await closeSessionInternal(s.id, { reason: "idle", emails: mode });
      summary.results.push({
        id: s.id,
        closed: r.closed,
        emailsQueued: r.emailsQueued,
        ...(mode === "skip" ? { silent: true } : {}),
      });
      if (r.closed) {
        summary.idleClosed += 1;
        if (mode === "skip") summary.idleClosedSilently += 1;
      }
    } catch (err) {
      const message = errorMessage(err);
      logError({ where: "cron.closeIdle", sessionId: s.id, message });
      summary.results.push({ id: s.id, closed: false, emailsQueued: 0, error: message });
    }
  }
  if (summary.idleTruncated) {
    logWarn({ where: "cron.closeIdle", message: "batch full, more idle sessions may be waiting", batch });
  }
  return summary;
}

// Cron pass: close live group sessions nobody has touched for LIVE_AUTO_CLOSE_MS
// (S10 WP4a, Kim C3; TODO(kim-validar:C3)). Called by
// app/api/cron/close-expired-sessions. The close itself is the ONE close routine
// (closeSessionInternal, reason "idle"); this file only picks the candidates.
// Bounded (batch, oldest first), a failure on one session is logged and does not
// stop the others, and it never touches solo, async, dated or never-started
// sessions (the same shape as isLiveIdle / the live_idle reminder).

import { prisma } from "@/lib/prisma";
import { closeSessionInternal } from "@/lib/closeSession";
import { isLiveAbandoned, LIVE_AUTO_CLOSE_MS } from "@/lib/closeRules";
import { errorMessage, logError, logWarn } from "@/lib/log";

export type IdleCloseSummary = {
  /** Candidates examined this run. */
  examined: number;
  /** Sessions closed by this run. */
  idleClosed: number;
  /** The batch was full: more may be waiting for the next run. */
  idleTruncated: boolean;
  results: { id: string; closed: boolean; emailsQueued: number; error?: string }[];
};

export async function closeIdleLiveSessions(
  batch: number,
  now: number = Date.now(),
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
    select: { id: true, isGroup: true, isAsync: true, closesAt: true, status: true, startedAt: true },
    orderBy: { startedAt: "asc" },
    take: batch,
  });
  const summary: IdleCloseSummary = {
    examined: candidates.length,
    idleClosed: 0,
    idleTruncated: candidates.length === batch,
    results: [],
  };
  if (candidates.length === 0) return summary;

  // Last activity through the sample relation (Evaluation.sessionId is nullable).
  const samples = await prisma.sessionSample.findMany({
    where: { sessionId: { in: candidates.map((c) => c.id) } },
    select: {
      sessionId: true,
      evaluations: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  });
  const lastBySession = new Map<string, Date>();
  for (const smp of samples) {
    const u = smp.evaluations[0]?.updatedAt;
    const cur = lastBySession.get(smp.sessionId);
    if (u && (!cur || u > cur)) lastBySession.set(smp.sessionId, u);
  }

  for (const s of candidates) {
    if (!isLiveAbandoned(s, lastBySession.get(s.id) ?? null, now)) continue;
    try {
      const r = await closeSessionInternal(s.id, { reason: "idle", emails: "await" });
      summary.results.push({ id: s.id, closed: r.closed, emailsQueued: r.emailsQueued });
      if (r.closed) summary.idleClosed += 1;
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

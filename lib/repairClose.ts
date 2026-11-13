import "server-only";

// The cron REPAIR pass for one closed-but-unfinalized session (S10 WP4a second
// review M-A). It only decides the email mode, through the pure `repairEmailMode`
// (lib/closeRules.ts), and then calls the ONE close routine. A silent idle close
// (live group, idle 30+ days at close, no close-email ledger row) whose finalize
// failed halfway is repaired WITHOUT mailing the old backlog, and so is a session
// whose creator is a deleted-account placeholder (L3); everything else keeps "await".

import { prisma } from "@/lib/prisma";
import { closeSessionInternal, type CloseResult } from "@/lib/closeSession";
import { closedSilently, idleAtCloseMs, repairEmailMode } from "@/lib/closeRules";
import { isDeletedProfileId } from "@/lib/accountDeletion/deletedProfile";

export type CloseSilenceFacts = {
  isLiveGroup: boolean;
  startedAt: Date | null;
  idleAtCloseMs: number | null;
  closeEmailLedgerRows: number;
  ownerDeleted: boolean;
};

/** The inputs of the silent-close / repair rules for one session (read only). */
export async function loadCloseSilenceFacts(sessionId: string): Promise<CloseSilenceFacts | null> {
  const s = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, isAsync: true, closesAt: true, startedAt: true, closedAt: true, createdBy: true },
  });
  if (!s) return null;
  const isLiveGroup = s.isGroup && !s.isAsync && s.closesAt === null;
  const [last, rows] = await Promise.all([
    s.closedAt
      ? prisma.evaluation.aggregate({
          where: { sessionSample: { sessionId }, updatedAt: { lte: s.closedAt } },
          _max: { updatedAt: true },
        })
      : Promise.resolve(null),
    prisma.closeEmailDelivery.count({ where: { sessionId } }),
  ]);
  return {
    isLiveGroup,
    startedAt: s.startedAt,
    idleAtCloseMs: idleAtCloseMs(s, last?._max.updatedAt ?? null),
    closeEmailLedgerRows: rows,
    ownerDeleted: isDeletedProfileId(s.createdBy),
  };
}

/** Whether the close of this session was silent (owner's results page). */
export async function wasClosedSilently(sessionId: string): Promise<boolean> {
  const facts = await loadCloseSilenceFacts(sessionId);
  return facts ? closedSilently(facts) : false;
}

/** Exactly what the cron route does for each owed repair. */
export async function repairClosedSession(sessionId: string): Promise<CloseResult> {
  const facts = await loadCloseSilenceFacts(sessionId);
  const emails = facts ? repairEmailMode(facts) : "await";
  return closeSessionInternal(sessionId, { reason: "repair", emails });
}

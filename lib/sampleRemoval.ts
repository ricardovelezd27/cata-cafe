import "server-only";

// Removing samples from a session, shared by the owner's "remove sample" action
// (app/actions/sessions.ts removeSessionSample) and the solo "Terminar cata"
// finish (finishSoloSession). A plain library function: callers authorize first
// (requireSampleOwner / requireSessionOwner) and decide which samples are safe
// to delete (never one that holds an evaluation: the delete would cascade it).

import type { Prisma } from "@/app/generated/prisma/client";
import { activeReferenceId, compactReferenceRanks } from "@/lib/referenceRules";

/** Deletes `sampleIds` (all must belong to `sessionId`), then repairs what the
 *  deletion leaves behind, inside the caller's transaction:
 *   - reference ranks are renumbered 1..n and the session pointer re-aimed at
 *     the highest rank (a removed reference leaves a gap / a cleared pointer);
 *   - positions are re-packed ascending so the (sessionId, position) unique key
 *     stays dense. */
export async function removeSamplesInTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  sampleIds: string[],
): Promise<void> {
  if (sampleIds.length === 0) return;
  await tx.sessionSample.deleteMany({ where: { id: { in: sampleIds }, sessionId } });
  const refRows = await tx.sessionSample.findMany({
    where: { sessionId, referenceRank: { not: null } },
    select: { id: true, referenceRank: true },
  });
  for (const { id, rank } of compactReferenceRanks(refRows)) {
    await tx.sessionSample.update({ where: { id }, data: { referenceRank: rank } });
  }
  await tx.cuppingSession.update({
    where: { id: sessionId },
    data: { referenceSampleId: activeReferenceId(refRows) },
  });
  // Each shifted row lands on a slot vacated one step earlier.
  const rest = await tx.sessionSample.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].position !== i) {
      await tx.sessionSample.update({ where: { id: rest[i].id }, data: { position: i } });
    }
  }
}

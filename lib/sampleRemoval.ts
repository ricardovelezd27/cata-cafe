import "server-only";

// Removing samples from a session, shared by the owner's "remove sample" action
// (app/actions/sessions.ts removeSessionSample) and the solo "Terminar cata"
// finish (finishSoloSession). A plain library function: callers authorize first
// (requireSampleOwner / requireSessionOwner) and decide which samples are safe
// to delete (never one that holds an evaluation: the delete would cascade it).

import type { Prisma } from "@/app/generated/prisma/client";
import { moduleKeyForFormat } from "@/lib/evaluation";
import {
  activeReferenceId,
  compactReferenceRanks,
  countRepinOverwrites,
  pinWouldTouchRevealed,
  shouldPinReference,
} from "@/lib/referenceRules";

/** Thrown (rolling the transaction back) when removing samples would
 *  re-activate an earlier reference whose ratings must be overwritten. */
export const REFERENCE_REPIN_REQUIRED = "reference_repin_required";

/** Thrown (rolling the transaction back) when the earlier reference that would be
 *  re-activated (and so pinned again) belongs to an already REVEALED sample (S10 WP3a review H1). */
export const REFERENCE_REVEALED = "reference_revealed";

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
  opts: { onReactivate: "refuse" | "ignore" },
): Promise<void> {
  if (sampleIds.length === 0) return;
  const refsBefore = await tx.sessionSample.findMany({
    where: { sessionId, referenceRank: { not: null } },
    select: { id: true, referenceRank: true },
  });
  const activeBefore = activeReferenceId(refsBefore);
  await tx.sessionSample.deleteMany({ where: { id: { in: sampleIds }, sessionId } });
  const refRows = await tx.sessionSample.findMany({
    where: { sessionId, referenceRank: { not: null } },
    select: { id: true, referenceRank: true },
  });
  for (const { id, rank } of compactReferenceRanks(refRows)) {
    await tx.sessionSample.update({ where: { id }, data: { referenceRank: rank } });
  }
  const activeAfter = activeReferenceId(refRows);
  const session = await tx.cuppingSession.update({
    where: { id: sessionId },
    data: { referenceSampleId: activeAfter },
    select: { format: true, cupsPerSample: true, referenceMode: true },
  });
  // S8-27: removing the active reference's sample re-activates an EARLIER
  // reference, which is pinned again. If its stored ratings drifted off the
  // 79.00 anchor, pinning it would silently overwrite cuppers' work: refuse
  // (the whole transaction rolls back) and let the owner change the reference
  // first, which asks for confirmation. Anchor mode only (B1): a "free"
  // reference is never pinned, so there is nothing to overwrite.
  if (
    opts.onReactivate === "refuse" &&
    activeAfter &&
    activeAfter !== activeBefore &&
    shouldPinReference({
      mode: session.referenceMode,
      moduleKey: moduleKeyForFormat(session.format),
      isActiveReference: true,
    })
  ) {
    const reactivated = await tx.sessionSample.findUniqueOrThrow({
      where: { id: activeAfter },
      select: { revealed: true },
    });
    if (
      pinWouldTouchRevealed({
        mode: session.referenceMode,
        moduleKey: moduleKeyForFormat(session.format),
        targetRevealed: reactivated.revealed,
      })
    ) {
      throw new Error(REFERENCE_REVEALED);
    }
    const evs = await tx.evaluation.findMany({
      where: { sessionSampleId: activeAfter },
      select: { id: true, isDraft: true, affectiveData: true, combinedData: true },
    });
    if (countRepinOverwrites(evs, moduleKeyForFormat(session.format), session.cupsPerSample) > 0) {
      throw new Error(REFERENCE_REPIN_REQUIRED);
    }
  }
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

import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RefireMode =
  /** An explicit owner change (exclusion, "Actualizar" on an open session):
   *  every submitted evaluation of the session fires the trigger. */
  | "full"
  /** The close routine's repair/finalize pass: nobody chose to change a score,
   *  so a sample made ENTIRELY of pre-deploy data is left exactly as stored.
   *  See `refireAggregates`. */
  | "keep-old-rule";

/**
 * Re-fire trg_recompute_aggregate for the submitted evaluations of a session.
 * Touching "isDraft" (even to its current value) satisfies
 * `AFTER UPDATE OF "isDraft"`; the trigger's WHEN (NEW."isDraft" = false) keeps
 * it to submitted rows. The DB trigger stays the single source of truth for
 * communityScore, penalties and attrAverages (it applies the exclusion and
 * completeness filters), so nothing is recomputed in TypeScript here.
 *
 * Modes (S10 WP1a, second review H1 -- the owner's rule is "no past score ever
 * changes", and the data, not a date, says which rule produced a score):
 *  - "full" (default): every submitted evaluation fires the trigger. Used by
 *    deliberate owner actions: `setParticipantExclusion` and
 *    `refreshAggregateScores` (the latter only on a session still open). A
 *    guest claim re-fires through its own statement in lib/guestClaim.ts.
 *  - "keep-old-rule": used by `finalizeClosedSession` (first close, the cron's
 *    repair pass, the solo repair on view). Nobody chose to change a score, so a
 *    sample is SKIPPED (not re-fired) when it has no new-rule data at all:
 *      NOT EXISTS (aggregate row with "ruleVersion" <> 1)
 *      AND NOT EXISTS (submitted evaluation with cups IS NOT NULL)
 *    i.e. no aggregate row or a v1 row, and every submitted evaluation stored
 *    before the deploy. Re-firing it would write a first (or a rewritten) score
 *    under the new rule that nobody asked for. Truth table (per sample):
 *
 *      aggregate row | submitted evaluations          | fires?
 *      --------------+--------------------------------+-------
 *      absent        | all cups NULL                  | no   (stays without a row: the page keeps showing the old-rule number)
 *      absent        | some with cups                 | yes  (new data, first score)
 *      v1            | all cups NULL                  | no   (the old-rule score stays)
 *      v1            | some with cups                 | yes  (new data)
 *      v2            | all cups NULL                  | yes  (the row is already new-rule; keep it consistent)
 *      v2            | some with cups                 | yes
 *      any           | none submitted                 | nothing to fire (only submitted rows are touched)
 *
 *    The decision is part of the one UPDATE statement below.
 *
 * Plain library function: callers authorize first (requireSessionOwner, the
 * close routine, the cron). Cost is roughly evaluations x evaluations trigger
 * work per sample, fine at the group sizes the product targets (< 50 cuppers).
 */
export async function refireAggregates(
  sessionId: string,
  opts: { mode?: RefireMode } = {},
): Promise<void> {
  const skipOldRule =
    opts.mode === "keep-old-rule"
      ? Prisma.sql`
      AND (
        EXISTS (
          SELECT 1 FROM aggregate_scores a
          WHERE a."sessionSampleId" = e."sessionSampleId" AND a."ruleVersion" <> 1
        )
        OR EXISTS (
          SELECT 1 FROM evaluations x
          WHERE x."sessionSampleId" = e."sessionSampleId"
            AND x."isDraft" = false
            AND x.cups IS NOT NULL
        )
      )`
      : Prisma.empty;
  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false${skipOldRule}
  `;
}

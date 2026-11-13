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
 *    repair pass, the solo repair on view). A sample is SKIPPED when its stored
 *    aggregate row has "ruleVersion" = 1 AND every submitted evaluation of that
 *    sample has cups IS NULL: a sample made only of data stored before the
 *    deploy has nothing new to compute, and recomputing it would rewrite a past
 *    score under the new rule with nobody choosing that. A sample with no
 *    aggregate row, with "ruleVersion" = 2, or with at least one submitted
 *    evaluation that has cups set (written by the new code) is re-fired as
 *    always. The decision is part of the one UPDATE statement below.
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
      AND NOT (
        EXISTS (
          SELECT 1 FROM aggregate_scores a
          WHERE a."sessionSampleId" = e."sessionSampleId" AND a."ruleVersion" = 1
        )
        AND NOT EXISTS (
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

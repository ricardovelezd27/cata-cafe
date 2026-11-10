import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Re-fire trg_recompute_aggregate for every submitted evaluation of a session.
 * Touching "isDraft" (even to its current value) satisfies
 * `AFTER UPDATE OF "isDraft"`; the trigger's WHEN (NEW."isDraft" = false) keeps
 * it to submitted rows. The DB trigger stays the single source of truth for
 * communityScore, penalties and attrAverages (it applies the exclusion and
 * completeness filters), so nothing is recomputed in TypeScript here.
 *
 * Plain library function: callers authorize first (requireSessionOwner, the
 * close routine, the cron). Cost is roughly evaluations x evaluations trigger
 * work per sample, fine at the group sizes the product targets (< 50 cuppers).
 */
export async function refireAggregates(sessionId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false
  `;
}

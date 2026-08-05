// Post-close coffee-history sync, shared by closeSession and the solo
// auto-close path. Plain library function — NOT a server action. The old
// exported `syncCoffeeHistory` action was a public HTTP endpoint that never
// checked session ownership; callers must authorize (requireSessionOwner or
// equivalent) BEFORE calling this.

import { prisma } from "@/lib/prisma";

/** Upserts UserCoffeeHistory for every revealed, coffee-linked sample with
 *  submitted evaluations in the session. Idempotent — safe to re-run. */
export async function syncCoffeeHistoryForSession(sessionId: string) {
  const samples = await prisma.sessionSample.findMany({
    where: { sessionId, revealed: true, coffeeId: { not: null } },
    include: {
      evaluations: {
        where: { isDraft: false },
        select: {
          id: true,
          cupperId: true,
          individualScore: true,
          sessionSampleId: true,
        },
      },
      aggregateScore: {
        select: { communityScore: true },
      },
    },
  });

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });

  const tastedAt = session?.date ?? new Date();
  const upserts = [];

  for (const sample of samples) {
    if (!sample.coffeeId) continue;
    const coffeeId = sample.coffeeId;
    const communityScore = sample.aggregateScore?.communityScore ?? null;

    for (const evaluation of sample.evaluations) {
      upserts.push(
        prisma.userCoffeeHistory.upsert({
          where: {
            userId_coffeeId_sessionId: {
              userId: evaluation.cupperId,
              coffeeId,
              sessionId,
            },
          },
          create: {
            userId: evaluation.cupperId,
            coffeeId,
            evaluationId: evaluation.id,
            sessionId,
            individualScore: evaluation.individualScore,
            communityScore,
            tastedAt,
          },
          update: {
            individualScore: evaluation.individualScore,
            communityScore,
          },
        }),
      );
    }
  }

  // One transaction instead of one round-trip per evaluation. At 100 samples ×
  // dozens of cuppers this collapses thousands of sequential upserts into a
  // single batched call, keeping closeSession well under the action timeout.
  if (upserts.length > 0) await prisma.$transaction(upserts);

  return { ok: true };
}

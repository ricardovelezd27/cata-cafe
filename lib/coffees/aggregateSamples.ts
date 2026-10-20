import "server-only";

// The session-sample rows (with anonymous aggregate + submitted evaluations)
// that computeCoffeeAggregate merges for a coffee. Shared by the coffee profile
// page and the coffee "ficha" PDF route. NO AUTHORIZATION HERE: the caller must
// have resolved access to the coffee (usableCoffeeWhere) and decide whether the
// results may be shown (owner / resultsPublished / super-admin).

import { prisma } from "@/lib/prisma";

export function loadCoffeeAggregateSamples(coffeeId: string) {
  return prisma.sessionSample.findMany({
    where: { coffeeId },
    select: {
      id: true,
      sessionId: true,
      session: { select: { id: true, name: true, date: true } },
      aggregateScore: {
        select: { communityScore: true, participantCount: true, attrAverages: true },
      },
      evaluations: {
        where: { isDraft: false },
        select: {
          descriptiveData: true,
          combinedData: true,
          individualScore: true,
          submittedAt: true,
        },
      },
    },
  });
}

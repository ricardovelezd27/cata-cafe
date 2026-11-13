import "server-only";

// The session-sample rows (with anonymous aggregate + submitted evaluations)
// that computeCoffeeAggregate merges for a coffee. Shared by the coffee profile
// page and the coffee "ficha" PDF route.
//
// Access to the coffee itself (usableCoffeeWhere) and whether results may be
// shown at all (owner / resultsPublished / super-admin) remain the CALLER's
// job. What this loader decides is WHICH rows count and what each viewer may
// see of them: closed sessions only, excluded cuppers removed, session
// names/dates only for sessions the viewer owns or joined (S8-02, via the pure
// filterCoffeeSamples).

import { prisma } from "@/lib/prisma";
import { filterCoffeeSamples, type CoffeeViewer } from "@/lib/coffees/filterCoffeeSamples";

export type { CoffeeViewer };

export async function loadCoffeeAggregateSamples(coffeeId: string, viewer: CoffeeViewer) {
  const rows = await prisma.sessionSample.findMany({
    // Pre-filter is an optimisation only; filterCoffeeSamples stays authoritative.
    where: { coffeeId, session: { status: "closed" } },
    select: {
      id: true,
      sessionId: true,
      revealed: true,
      referenceRank: true,
      session: {
        select: {
          id: true,
          name: true,
          date: true,
          status: true,
          format: true,
          cupsPerSample: true,
          referenceMode: true,
          createdBy: true,
          participants: { select: { userId: true, excludedFromResults: true } },
        },
      },
      aggregateScore: {
        select: { communityScore: true, participantCount: true, attrAverages: true },
      },
      evaluations: {
        where: { isDraft: false },
        select: {
          cupperId: true,
          descriptiveData: true,
          affectiveData: true,
          combinedData: true,
          nonUniformCups: true,
          defectiveCups: true,
          cups: true,
          individualScore: true,
          submittedAt: true,
        },
      },
    },
  });
  return filterCoffeeSamples(rows, viewer);
}

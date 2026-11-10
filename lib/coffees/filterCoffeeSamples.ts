// Pure, viewer-aware filter over the raw session-sample rows of one coffee
// (S8-02: F-cafes-1, F-cafes-2, F-informes-2; decision D6 = closed sessions
// only, excluded cuppers removed). No Prisma, no server-only import, so vitest
// can load it. The Prisma query lives in aggregateSamples.ts.
//
// Rules, per sample:
//  1. only sessions with status "closed" (closing reveals every coffee-linked
//     sample, so an open session can never leak a blind score);
//  2. only samples that are `revealed` (legacy rows closed before the
//     reveal-on-close rule);
//  3. evaluations of participants flagged `excludedFromResults` are dropped;
//  4. a sample left with no evaluation is dropped;
//  5. session name/date survive only for viewers who own or joined the session
//     (or the super-admin lens); everyone else gets null, but the row still
//     feeds the anonymous totals;
//  6. `visibleIndividually` marks evaluations whose individual score may be
//     listed: the viewer's own, or any evaluation of a session the viewer owns
//     (or admin). The cupper id itself is never passed on.
// `aggregateScore` passes through untouched (trigger row). No scoring maths.

import type { CoffeeAggregateSampleInput } from "@/lib/coffeeAggregate";

export interface CoffeeViewer {
  userId: string;
  isAdmin: boolean;
}

export interface RawCoffeeSample {
  id: string;
  sessionId: string;
  revealed: boolean;
  session: {
    id: string;
    name: string;
    date: Date;
    status: string;
    createdBy: string;
    participants: { userId: string; excludedFromResults: boolean }[];
  };
  aggregateScore: {
    communityScore: number | null;
    participantCount: number;
    attrAverages: unknown;
  } | null;
  evaluations: {
    cupperId: string;
    descriptiveData: unknown;
    combinedData: unknown;
    individualScore: number | null;
    submittedAt: Date | null;
  }[];
}

export function filterCoffeeSamples(
  raw: RawCoffeeSample[],
  viewer: CoffeeViewer,
): CoffeeAggregateSampleInput[] {
  const out: CoffeeAggregateSampleInput[] = [];
  for (const sample of raw) {
    if (sample.session.status !== "closed") continue;
    if (!sample.revealed) continue;

    const excluded = new Set(
      sample.session.participants.filter((p) => p.excludedFromResults).map((p) => p.userId),
    );
    const evaluations = sample.evaluations.filter((ev) => !excluded.has(ev.cupperId));
    if (evaluations.length === 0) continue;

    const isOwner = sample.session.createdBy === viewer.userId;
    const knowsSession =
      viewer.isAdmin ||
      isOwner ||
      sample.session.participants.some((p) => p.userId === viewer.userId);
    const listAll = viewer.isAdmin || isOwner;

    out.push({
      id: sample.id,
      sessionId: sample.sessionId,
      session: {
        id: sample.session.id,
        name: knowsSession ? sample.session.name : null,
        date: knowsSession ? sample.session.date : null,
      },
      aggregateScore: sample.aggregateScore,
      evaluations: evaluations.map((ev) => ({
        descriptiveData: ev.descriptiveData,
        combinedData: ev.combinedData,
        individualScore: ev.individualScore,
        submittedAt: ev.submittedAt,
        visibleIndividually: listAll || ev.cupperId === viewer.userId,
      })),
    });
  }
  return out;
}

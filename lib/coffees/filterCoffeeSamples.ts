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
//  7. (S10 WP1c) each sample also carries `lifetime`, the slice that
//     computeCoffeeLifetimeScore needs, over the SAME surviving evaluations.
//     Cuppers are replaced by an opaque index (per call, first appearance
//     order) so "found by N people" can be counted without any id leaving here.
// `aggregateScore` passes through untouched (trigger row). No scoring maths.

import type { CoffeeAggregateSampleInput } from "@/lib/coffeeAggregate";
import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";
import type { LifetimeSample } from "@/lib/coffeeLifetimeScore";

export interface CoffeeViewer {
  userId: string;
  isAdmin: boolean;
}

export interface RawCoffeeSample {
  id: string;
  sessionId: string;
  revealed: boolean;
  /** SessionSample.referenceRank (S10 WP1c: anchor references are out of the lifetime score). */
  referenceRank: number | null;
  session: {
    id: string;
    name: string;
    date: Date;
    closedAt?: Date | null;
    status: string;
    format: string;
    cupsPerSample: number;
    referenceMode: string;
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
    affectiveData: unknown;
    combinedData: unknown;
    nonUniformCups: boolean[];
    defectiveCups: boolean[];
    cups: number | null;
    individualScore: number | null;
    submittedAt: Date | null;
  }[];
}

/** What filterCoffeeSamples returns: the aggregate input plus the lifetime slice. */
export type FilteredCoffeeSample = CoffeeAggregateSampleInput & { lifetime: LifetimeSample };

export function filterCoffeeSamples(
  raw: RawCoffeeSample[],
  viewer: CoffeeViewer,
): FilteredCoffeeSample[] {
  const out: FilteredCoffeeSample[] = [];
  // Opaque per-call cupper index; the id itself never leaves this function.
  const cupperKeys = new Map<string, number>();
  const keyOf = (id: string) => {
    let k = cupperKeys.get(id);
    if (k === undefined) {
      k = cupperKeys.size;
      cupperKeys.set(id, k);
    }
    return k;
  };
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
        closedAt: knowsSession ? (sample.session.closedAt ?? null) : null,
      },
      aggregateScore: sample.aggregateScore,
      // S10 WP3b: a count only (weight of the sample in the coffee attribute merge).
      partialCount: evaluations.filter((ev) =>
        isAffectiveDeclaredPartial(
          (sample.session.format === "combined" ? ev.combinedData : ev.affectiveData) as Record<string, unknown> | null,
        ),
      ).length,
      evaluations: evaluations.map((ev) => ({
        descriptiveData: ev.descriptiveData,
        combinedData: ev.combinedData,
        individualScore: ev.individualScore,
        submittedAt: ev.submittedAt,
        visibleIndividually: listAll || ev.cupperId === viewer.userId,
      })),
      lifetime: {
        sessionId: sample.sessionId,
        referenceRank: sample.referenceRank,
        session: {
          format: sample.session.format,
          cupsPerSample: sample.session.cupsPerSample,
          referenceMode: sample.session.referenceMode,
        },
        evaluations: evaluations.map((ev) => ({
          cupperKey: keyOf(ev.cupperId),
          affectiveData: ev.affectiveData,
          combinedData: ev.combinedData,
          nonUniformCups: ev.nonUniformCups,
          defectiveCups: ev.defectiveCups,
          cups: ev.cups,
        })),
      },
    });
  }
  return out;
}

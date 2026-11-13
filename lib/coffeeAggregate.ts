/**
 * Coffee-level results aggregation (Phase 3 — coffee profile "community
 * results" section). Merges the per-SAMPLE aggregate scores/attribute
 * averages that already exist on `AggregateScore` (trigger-authoritative,
 * see prisma/sql/rls_and_triggers.sql) across every session that has cupped
 * this coffee, plus a flat list of descriptor blobs for FlavorCloud.
 *
 * Pure/dependency-free (besides AFFECTIVE_ATTRIBUTES) so it's safely
 * importable from the server component page.
 */
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface CoffeeAggregateEvaluationInput {
  descriptiveData: unknown;
  combinedData: unknown;
  individualScore: number | null;
  submittedAt?: Date | null;
  /** Individual score may be listed to this viewer (own evaluation, or a session they own). Absent = not listable. */
  visibleIndividually?: boolean;
}

export interface CoffeeAggregateSampleInput {
  id: string;
  sessionId: string;
  /** name/date are null when the viewer neither owns nor joined the session: the row still feeds the anonymous totals but is never listed. */
  session: { id: string; name: string | null; date: Date | null; closedAt?: Date | null };
  aggregateScore: {
    communityScore: number | null;
    participantCount: number;
    attrAverages: unknown;
  } | null;
  evaluations: CoffeeAggregateEvaluationInput[];
  /** S10 WP3b: how many of its evaluations are declared partials ("no evaluado"). A number only, no cupper id. Absent = 0. */
  partialCount?: number;
}

export interface CoffeeSessionRow {
  sessionId: string;
  sessionName: string;
  sessionDate: Date;
  /** When the session closed (only for sessions the viewer owns or joined); drives the "origin data edited" note. */
  sessionClosedAt: Date | null;
  communityScore: number | null;
}

/** Anonymous — never carries cupper name/id. See coffees/[id]/page.tsx "recent tastings" card. */
export interface CoffeeRecentEvaluation {
  sessionId: string;
  sessionName: string;
  submittedAt: Date;
  individualScore: number | null;
}

export interface CoffeeAggregate {
  sessionsCount: number;
  evaluationsCount: number;
  communityAvg: number | null;
  individualAvg: number | null;
  /** Keyed by AFFECTIVE_ATTRIBUTES label (e.g. "Fragancia"); only attrs with data. */
  attrAverages: Record<string, number>;
  allDescriptive: Record<string, unknown>[];
  sessionRows: CoffeeSessionRow[];
  /** Most recent 8 submitted evaluations across all sessions, newest first. Anonymous. */
  recentEvaluations: CoffeeRecentEvaluation[];
}

/**
 * Rounds to 2 decimals — matches the display convention used elsewhere
 * (lib/scoring.ts computeGroupAggregate, UserCoffeeHistory scores).
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCoffeeAggregate(
  samples: CoffeeAggregateSampleInput[],
): CoffeeAggregate {
  const sessionIds = new Set(samples.map((s) => s.sessionId));

  let evaluationsCount = 0;
  let individualSum = 0;
  let individualCount = 0;
  const allDescriptive: Record<string, unknown>[] = [];
  const recentEvaluations: CoffeeRecentEvaluation[] = [];

  for (const sample of samples) {
    for (const ev of sample.evaluations) {
      evaluationsCount += 1;
      if (typeof ev.individualScore === "number") {
        individualSum += ev.individualScore;
        individualCount += 1;
      }
      // combinedData carries descriptors for combined-format sessions;
      // descriptiveData carries them for descriptive-format ones.
      const blob = isRecord(ev.descriptiveData) && Object.keys(ev.descriptiveData).length > 0
        ? ev.descriptiveData
        : isRecord(ev.combinedData)
          ? ev.combinedData
          : null;
      if (blob) allDescriptive.push(blob);
      if (ev.submittedAt && ev.visibleIndividually && sample.session.name !== null) {
        recentEvaluations.push({
          sessionId: sample.sessionId,
          sessionName: sample.session.name,
          submittedAt: ev.submittedAt,
          individualScore: ev.individualScore,
        });
      }
    }
  }
  recentEvaluations.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  // Community score: average of samples with a non-null communityScore,
  // weighted by participantCount; falls back to an unweighted average when
  // every contributing sample has participantCount === 0.
  const scoredSamples = samples.filter(
    (s) => typeof s.aggregateScore?.communityScore === "number",
  );
  let communityAvg: number | null = null;
  if (scoredSamples.length > 0) {
    const totalWeight = scoredSamples.reduce(
      (acc, s) => acc + (s.aggregateScore?.participantCount ?? 0),
      0,
    );
    if (totalWeight > 0) {
      communityAvg = round2(
        scoredSamples.reduce(
          (acc, s) =>
            acc +
            (s.aggregateScore!.communityScore as number) *
              (s.aggregateScore!.participantCount ?? 0),
          0,
        ) / totalWeight,
      );
    } else {
      communityAvg = round2(
        scoredSamples.reduce(
          (acc, s) => acc + (s.aggregateScore!.communityScore as number),
          0,
        ) / scoredSamples.length,
      );
    }
  }

  const individualAvg =
    individualCount > 0 ? round2(individualSum / individualCount) : null;

  // Attribute averages: weighted merge (by participantCount) of each sample's
  // attrAverages JSON, keyed by AFFECTIVE_ATTRIBUTES label (the key shape the
  // recompute_aggregate_score() trigger writes — see rls_and_triggers.sql).
  const attrAverages: Record<string, number> = {};
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    let weightedSum = 0;
    let weight = 0;
    let unweightedSum = 0;
    let unweightedCount = 0;
    for (const s of samples) {
      const agg = s.aggregateScore;
      if (!agg || !isRecord(agg.attrAverages)) continue;
      const raw = agg.attrAverages[attr.label];
      if (typeof raw !== "number") continue;
      // S10 WP3b: the attribute weight counts the partial evaluations too (they feed the sample's
      // per-attribute averages); with no partials this is exactly participantCount, as before.
      const w = (agg.participantCount ?? 0) + (s.partialCount ?? 0);
      weightedSum += raw * w;
      weight += w;
      unweightedSum += raw;
      unweightedCount += 1;
    }
    if (unweightedCount === 0) continue;
    attrAverages[attr.label] = round2(
      weight > 0 ? weightedSum / weight : unweightedSum / unweightedCount,
    );
  }

  const sessionRows: CoffeeSessionRow[] = samples
    .flatMap((s) =>
      s.session.name === null || s.session.date === null
        ? []
        : [
            {
              sessionId: s.sessionId,
              sessionName: s.session.name,
              sessionDate: s.session.date,
              sessionClosedAt: s.session.closedAt ?? null,
              communityScore: s.aggregateScore?.communityScore ?? null,
            },
          ],
    )
    .sort((a, b) => b.sessionDate.getTime() - a.sessionDate.getTime());

  return {
    sessionsCount: sessionIds.size,
    evaluationsCount,
    communityAvg,
    individualAvg,
    attrAverages,
    allDescriptive,
    sessionRows,
    recentEvaluations: recentEvaluations.slice(0, 8),
  };
}

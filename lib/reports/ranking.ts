// Pure ranking / session-stat rules for results surfaces. Extracted verbatim
// from ResumenTab so the results page, the participant-summary PDF and the
// ficha técnica can never disagree about which number is "the score" of a
// sample. No Prisma, no React, no i18n framework.

import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import { canShowMyScore, type MyEvaluation } from "@/lib/evaluationState";
import { deltasVsReference, type ScoreBasis } from "@/lib/referenceDelta";
import type { SessionFormat } from "@/lib/constants";

/** The structural slice of a sample that ranking needs. `SampleResult` in the
 *  results route satisfies it. */
export type RankableSample = {
  id: string;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  aggregateScore: { communityScore: number | null; scoreSd: number | null } | null;
  myEvaluation: MyEvaluation;
};

export type RankContext = {
  format: SessionFormat;
  isGroup: boolean;
  canViewGroup: boolean;
  cupsPerSample: number;
};

export type RankValue = {
  score: number | null;
  sd: number | null;
  basis: ScoreBasis | null;
};

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function hasAnyEvalData(sample: {
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
}): boolean {
  return (
    Object.keys(sample.descriptive).length > 0 ||
    Object.keys(sample.affective).length > 0 ||
    Object.keys(sample.combined).length > 0
  );
}

/** The viewer's own CVA score for a sample (display-only, never stored).
 *  Descriptive sessions carry no scores; an unfinished draft is never ranked
 *  (lib/evaluationState.ts). */
export function myScoreFor(
  sample: RankableSample,
  format: SessionFormat,
  cupsPerSample: number,
): number | null {
  if (format === "descriptive") return null;
  const data = format === "combined" ? sample.combined : sample.affective;
  if (!hasAffectiveData(data) || !canShowMyScore(sample.myEvaluation)) return null;
  const score = calcIndividualScore(data, cupsPerSample);
  return typeof score === "number" ? score : null;
}

/** The score a surface displays for a sample: community first (when the group
 *  view is unlocked and one exists), else the viewer's own. `sd` is only ever
 *  attached when the displayed score IS the community score. */
export function rankFor(sample: RankableSample, ctx: RankContext): RankValue {
  if (ctx.format === "descriptive") return { score: null, sd: null, basis: null };
  if (ctx.isGroup && ctx.canViewGroup) {
    const community = sample.aggregateScore?.communityScore ?? null;
    if (community !== null) {
      return {
        score: community,
        sd: sample.aggregateScore?.scoreSd ?? null,
        basis: "community",
      };
    }
  }
  const mine = myScoreFor(sample, ctx.format, ctx.cupsPerSample);
  return { score: mine, sd: null, basis: mine === null ? null : "mine" };
}

export type RankedEntry<S> = {
  sample: S;
  position: number;
  score: number | null;
  sd: number | null;
  basis: ScoreBasis | null;
};

export type RankingResult<S> = {
  referenceSample: S | null;
  referenceRank: RankValue | null;
  ranked: RankedEntry<S>[];
  /** Δ vs the reference keyed by sample id (null when not applicable). */
  refDeltas: Map<string, number | null>;
};

/** The reference is the ANCHOR: kept outside the ranking, the session average
 *  and the best sample (lib/referenceRules.ts) but still feeds Δ. Everyone
 *  else sorts by score desc (unscored last), ties by original position. */
export function rankSamples<S extends RankableSample>(
  samples: S[],
  referenceId: string | null,
  ctx: RankContext,
): RankingResult<S> {
  const referenceSample = referenceId ? (samples.find((s) => s.id === referenceId) ?? null) : null;
  const referenceRank = referenceSample ? rankFor(referenceSample, ctx) : null;
  const ranked = samples
    .filter((sample) => sample.id !== referenceId)
    .map((sample, position) => {
      const { score, sd, basis } = rankFor(sample, ctx);
      return { sample, position, score, sd, basis };
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.position - b.position;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.position - b.position;
    });

  const refDeltas = deltasVsReference(
    [
      ...ranked.map((r) => ({ id: r.sample.id, score: r.score, basis: r.basis })),
      ...(referenceSample && referenceRank
        ? [{ id: referenceSample.id, score: referenceRank.score, basis: referenceRank.basis }]
        : []),
    ],
    referenceId,
  );

  return { referenceSample, referenceRank, ranked, refDeltas };
}

export type SessionStats = {
  evaluatedCount: number;
  avgScore: number | null;
  bestSampleId: string | null;
  bestScore: number | null;
  myAvg: number | null;
  communityAvg: number | null;
  delta: number | null;
};

/** Stat row + performance card numbers (reference excluded from every average). */
export function sessionStats<S extends RankableSample>(
  samples: S[],
  ranked: RankedEntry<S>[],
  referenceId: string | null,
  ctx: RankContext,
): SessionStats {
  const evaluatedCount = samples.filter(hasAnyEvalData).length;
  const rankScores = ranked.map((r) => r.score).filter((v): v is number => v !== null);
  const avgScore = average(rankScores);
  const bestEntry = ranked.find((r) => r.score !== null) ?? null;

  const scoredSamples = samples.filter((s) => s.id !== referenceId);
  const myScores = scoredSamples
    .map((s) => myScoreFor(s, ctx.format, ctx.cupsPerSample))
    .filter((v): v is number => v !== null);
  const myAvg = average(myScores);
  const communityScores = scoredSamples
    .map((s) => s.aggregateScore?.communityScore ?? null)
    .filter((v): v is number => v !== null);
  const communityAvg = average(communityScores);
  const delta = myAvg !== null && communityAvg !== null ? myAvg - communityAvg : null;

  return {
    evaluatedCount,
    avgScore,
    bestSampleId: bestEntry ? bestEntry.sample.id : null,
    bestScore: bestEntry ? bestEntry.score : null,
    myAvg,
    communityAvg,
    delta,
  };
}

// Priority order for picking the single consensus sentence to show per
// sample — mirrors the perceptual-block order used throughout the Descriptores
// tab. "general" is deliberately excluded: it is only the fallback.
export const SUMMARY_PRIORITY = ["nariz", "boca", "gusto", "acidez", "dulzura", "sensacion"];

/** Structural slice of `SampleBlockFreq` that `consensusLine` reads. */
export type ConsensusSource = {
  blocks: Record<string, { label: string }[]>;
  summary: Record<string, string | null>;
};

/** First non-null summary sentence in perceptual-block priority order, or the
 *  top-3 "general" descriptor labels when every block sentence is null. `null`
 *  when there is genuinely nothing to show (row should be skipped). */
export function consensusLine(
  sample: ConsensusSource,
  isSolo: boolean,
  labels: { soloTopDescriptors: string },
): string | null {
  const generalTop3 = (sample.blocks.general ?? []).slice(0, 3).map((d) => d.label);

  if (isSolo) {
    if (generalTop3.length === 0) return null;
    return `${labels.soloTopDescriptors}: ${generalTop3.join(", ")}`;
  }

  for (const blockId of SUMMARY_PRIORITY) {
    const sentence = sample.summary[blockId];
    if (sentence) return sentence;
  }
  if (generalTop3.length === 0) return null;
  return generalTop3.join(", ");
}

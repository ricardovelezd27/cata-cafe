import { AFFECTIVE_ATTRIBUTES } from "./constants";

/* ============================================================
   NEW: SCA CVA scoring — design system API

   Formula: S = 0.65625 · Σhᵢ + 52.75 − 2u − 4d
   Rounded to nearest 0.25.
   ============================================================ */

export interface CVABreakdown {
  sectionScores: number[]    // 8 values, each 1–9
  nonUniformCups: number     // 0–5
  defectiveCups: number      // 0–5
  affectiveSum: number       // Σhᵢ
  affectiveTerm: number      // 0.65625 · Σhᵢ
  uniformityPenalty: number  // 2u
  defectPenalty: number      // 4d
  raw: number                // pre-rounding
  score: number              // rounded to 0.25
}

export type ScoreCategory =
  | 'exceptional' | 'excellent' | 'vgood' | 'good' | 'average' | 'low'

export function calculateCVAScore(
  sectionScores: number[],
  nonUniformCups: number,
  defectiveCups: number,
): number {
  const sum = sectionScores.reduce((acc, h) => acc + (Number.isFinite(h) ? h : 0), 0)
  const raw = 0.65625 * sum + 52.75 - 2 * nonUniformCups - 4 * defectiveCups
  return Math.round(raw * 4) / 4
}

export function calculateCVABreakdown(
  sectionScores: number[],
  nonUniformCups: number,
  defectiveCups: number,
): CVABreakdown {
  const affectiveSum = sectionScores.reduce(
    (acc, h) => acc + (Number.isFinite(h) ? h : 0),
    0,
  )
  const affectiveTerm     = 0.65625 * affectiveSum
  const uniformityPenalty = 2 * nonUniformCups
  const defectPenalty     = 4 * defectiveCups
  const raw   = affectiveTerm + 52.75 - uniformityPenalty - defectPenalty
  const score = Math.round(raw * 4) / 4
  return { sectionScores, nonUniformCups, defectiveCups, affectiveSum, affectiveTerm, uniformityPenalty, defectPenalty, raw, score }
}

export function scoreToCategory(score: number): ScoreCategory {
  if (score >= 90) return 'exceptional'
  if (score >= 85) return 'excellent'
  if (score >= 80) return 'vgood'
  if (score >= 79) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

export const SCORE_CATEGORY_LABELS: Record<ScoreCategory, string> = {
  exceptional: 'Excepcional',
  excellent:   'Excelente',
  vgood:       'Muy bueno',
  good:        'Bueno',
  average:     'Promedio',
  low:         'Bajo',
}

export function scoreBand(score: number): 'green' | 'amber' | 'red' {
  if (score >= 85) return 'green'
  if (score >= 75) return 'amber'
  return 'red'
}

/* ============================================================
   EXISTING: Legacy scoring functions

   Used by server actions and existing page components.
   Official SCA CVA formula:
     S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
   hᵢ = the FINAL value (1-9) for each of the 8 affective attributes.
   u = non-uniform cups, d = defective cups (penalties applied only if ≥5 cups).
   Verification: Σ=8 → 58.00; Σ=40 → 79.00; Σ=72 → 100.00.
   ============================================================ */

export type EvalData = Record<string, unknown>;

export function calcAffectiveSum(data: EvalData): {
  sum: number;
  filled: number;
} {
  let sum = 0;
  let filled = 0;
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const rawVal = Number(data[`${attr.id}_final`] ?? data[attr.id] ?? 0);
    const finalVal = rawVal > 0 ? rawVal : 5;
    sum += finalVal;
    filled += 1;
  }
  return { sum, filled };
}

export function calcRawScore(data: EvalData): number {
  const { sum } = calcAffectiveSum(data);
  return 0.65625 * sum + 52.75;
}

// An evaluation counts toward the group average only when it is COMPLETE:
// every one of the 8 affective attributes has a real value (> 0). Because
// calcAffectiveSum() substitutes a neutral 5 for missing/zero attributes, a
// submitted-but-empty (or partially filled) evaluation otherwise gets a real
// rawScore that would skew the community average. This is the single definition
// of "complete" — referenced by the group aggregate and its verification trace.
export function isAffectiveComplete(data: EvalData): boolean {
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const v = Number(data[`${attr.id}_final`] ?? data[attr.id] ?? 0);
    if (!Number.isFinite(v) || v <= 0) return false;
  }
  return true;
}

// True when an evaluation carries at least ONE real affective rating. Guards
// every on-screen score/chart: a sample the cupper never opened arrives as an
// empty object (never null, see the `?? {}` in the results page loader), and
// because calcAffectiveSum() substitutes a neutral 5 for each unset attribute,
// an unguarded `{}` renders a fully plausible 79.00 and a perfectly symmetric
// radar octagon instead of an empty state.
export function hasAffectiveData(data: EvalData | null | undefined): boolean {
  if (!data) return false;
  return AFFECTIVE_ATTRIBUTES.some((attr) => {
    const v = Number(data[`${attr.id}_final`] ?? data[attr.id] ?? 0);
    return Number.isFinite(v) && v > 0;
  });
}

export interface GroupEvalInput {
  data: EvalData;
  nonUniformCups?: boolean[];
  defectiveCups?: boolean[];
}

export interface GroupAggregate {
  submitted: number;
  included: number;
  avgRawScore: number | null;
  communityScore: number | null;
  totalNonUniform: number;
  totalDefective: number;
  totalCups: number;
  attrAverages: Record<string, number>;
}

// Recompute a sample's group/community aggregate from the raw submitted
// evaluations, INCLUDING ONLY complete ones (see isAffectiveComplete). Returns
// both the included count (denominator of the average) and the submitted count
// so the UI can show "X of Y participants included in average". Callers must
// pre-filter master-excluded cuppers before passing evals in.
export function computeGroupAggregate(
  evals: GroupEvalInput[],
  cupsPerSample: number,
): GroupAggregate {
  const submitted = evals.length;
  const complete = evals.filter((e) => isAffectiveComplete(e.data));
  const included = complete.length;

  if (included === 0) {
    return {
      submitted,
      included: 0,
      avgRawScore: null,
      communityScore: null,
      totalNonUniform: 0,
      totalDefective: 0,
      totalCups: 0,
      attrAverages: {},
    };
  }

  const avgRawScore =
    complete.reduce((acc, e) => acc + calcRawScore(e.data), 0) / included;

  let totalNonUniform = 0;
  let totalDefective = 0;
  if (cupsPerSample >= 5) {
    for (const e of complete) {
      totalNonUniform += (e.nonUniformCups ?? []).filter(Boolean).length;
      totalDefective += (e.defectiveCups ?? []).filter(Boolean).length;
    }
  }
  const totalCups = cupsPerSample * included;

  const communityScore = calcCommunityScore({
    avgRawScore,
    totalNonUniform,
    totalDefective,
    totalCups,
  });

  const attrAverages: Record<string, number> = {};
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    let sum = 0;
    for (const e of complete) {
      sum += Number(e.data[`${attr.id}_final`] ?? e.data[attr.id] ?? 0);
    }
    attrAverages[attr.label] = Math.round((sum / included) * 100) / 100;
  }

  return {
    submitted,
    included,
    avgRawScore: Math.round(avgRawScore * 100) / 100,
    communityScore,
    totalNonUniform,
    totalDefective,
    totalCups,
    attrAverages,
  };
}

// Full, transparent breakdown of an individual CVA score. This is the single
// source of truth for the live individual path: `calcIndividualScore` returns
// `.score` from here, and the N5 score-transparency panel renders the same
// intermediates, so the explainer can never drift from the displayed number.
//
// NOTE: distinct from `calculateCVABreakdown` above (the design-system API),
// which always applies cup penalties. This one honors the protocol gate —
// penalties apply ONLY when cupsPerSample >= 5 — exactly like the live score.
export interface IndividualBreakdown {
  affectiveSum: number; // Σhᵢ
  affectiveTerm: number; // 0.65625 × Σhᵢ
  base: number; // affectiveTerm + 52.75
  u: number; // non-uniform cups counted
  d: number; // defective cups counted
  uniformityTracked: boolean; // cupsPerSample >= 5
  uniformityPenalty: number; // 2u (0 when not tracked)
  defectPenalty: number; // 4d (0 when not tracked)
  raw: number; // base − penalties, pre-rounding/clamp
  score: number; // final, clamped [0,100], rounded to 0.25
  cupsPerSample: number;
}

export function calcIndividualBreakdown(
  data: EvalData,
  cupsPerSample: number,
): IndividualBreakdown {
  const { sum: affectiveSum } = calcAffectiveSum(data);
  const affectiveTerm = 0.65625 * affectiveSum;
  const base = affectiveTerm + 52.75;

  const uniformityTracked = cupsPerSample >= 5;
  let u = 0;
  let d = 0;
  if (uniformityTracked) {
    const nonUniform = (data.tazas_no_uniformes as boolean[] | undefined) ?? [];
    const defective = (data.tazas_defectuosas as boolean[] | undefined) ?? [];
    u = nonUniform.filter(Boolean).length;
    d = defective.filter(Boolean).length;
  }
  const uniformityPenalty = 2 * u;
  const defectPenalty = 4 * d;

  const raw = base - uniformityPenalty - defectPenalty;
  // CVA scores fall on quarter-point steps — round ONCE, as the final step,
  // to the nearest 0.25 (not 2 decimals). Applied after the cup penalties.
  const score = Math.max(0, Math.min(100, Math.round(raw * 4) / 4));

  return {
    affectiveSum,
    affectiveTerm,
    base,
    u,
    d,
    uniformityTracked,
    uniformityPenalty,
    defectPenalty,
    raw,
    score,
    cupsPerSample,
  };
}

export function calcIndividualScore(
  data: EvalData,
  cupsPerSample: number,
): number | "—" {
  return calcIndividualBreakdown(data, cupsPerSample).score;
}

// Community formula: normalized penalties across all participants
// totalNonUniform = ALL cups marked non-uniform (including defective) — defective implies non-uniform
// totalDefective  = ALL cups marked defective
// A defective cup contributes to both → penalty = 10/cup + 30/cup = 40/cup
// totalCups       = cupsPerSample × participantCount
// uniformityPenalty = totalNonUniform × (10 / totalCups)
// defectPenalty     = totalDefective  × (30 / totalCups)
// This is display-only — the authoritative value is computed by the DB trigger.
export function calcCommunityScore(params: {
  avgRawScore: number;
  totalNonUniform: number;
  totalDefective: number;
  totalCups: number;
}): number {
  const { avgRawScore, totalNonUniform, totalDefective, totalCups } = params;
  if (!avgRawScore || totalCups === 0) return 0;
  const up = totalNonUniform * (10 / totalCups);
  const dp = totalDefective * (30 / totalCups);
  // Round the final community score to the nearest 0.25, matching the DB trigger.
  return Math.max(0, Math.min(100, Math.round((avgRawScore - up - dp) * 4) / 4));
}

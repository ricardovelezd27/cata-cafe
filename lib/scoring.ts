import { AFFECTIVE_ATTRIBUTES } from "./constants";
import type { ScoreRule } from "./scoreRule";

/* ============================================================
   NEW: SCA CVA scoring — design system API

   Formula: S = 0.65625 · Σhᵢ + 52.75 − 2u − 4d
   Rounded to nearest 0.25.
   ============================================================ */

/* ============================================================
   EXISTING: Legacy scoring functions

   Used by server actions and existing page components.
   Official SCA CVA formula:
     S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
   hᵢ = the FINAL value (1-9) for each of the 8 affective attributes.
   u = non-uniform cups, d = defective cups (deducted at any cup count, see cupDeduction).
   Verification: Σ=8 → 58.00; Σ=40 → 79.00; Σ=72 → 100.00.
   ============================================================ */

export type EvalData = Record<string, unknown>;

/* ------------------------------------------------------------
   The ONE deduction rule (S10 WP1a; spec docs/product/cata-descentralizada-puntaje.md).

   Flagged cups cost points at ANY cup count, as in the CVA form: 2 per
   non-uniform cup, 4 per defective cup. A defective cup is also flagged
   non-uniform by the form, so it sits in both arrays and costs 6 (4 when the
   evaluation has a single cup, where uniformity does not exist). Everyone's
   cups share the deduction: up to five cups (one cupper's whole sample, or a
   small group) it is the flat CVA amount; beyond five pooled cups it is
   diluted by 5 / cups.

       factor            = 5 / max(5, cups)
       uniformityPenalty = 2 * nonUniform * factor
       defectPenalty     = 4 * defective  * factor

   Individual scope: cups = that evaluation's cups. Session scope: cups = the
   SUM over the included evaluations. The SQL trigger (PHASE 26) does the same
   arithmetic in the same operation order; tests/scoringConsistency.test.ts
   keeps the two equal.
   TODO(kim-validar:A1): the answers behind this rule are simulated; Kim must
   validate them. Nothing here is a new scoring system: it is the pre-S8 score
   with its three bugs fixed.
   ------------------------------------------------------------ */

/** Flag counts of ONE evaluation, clamped to its cups. Non-uniformity exists
 *  only with 2+ cups (with one cup it is neither counted nor deducted). */
export function evaluationCupCounts(
  nonUniform: readonly boolean[] | undefined | null,
  defective: readonly boolean[] | undefined | null,
  cups: number,
): { u: number; d: number } {
  if (!Number.isFinite(cups) || cups <= 0) return { u: 0, d: 0 };
  const n = Math.floor(cups);
  const count = (flags: readonly boolean[] | undefined | null) =>
    Array.isArray(flags) ? flags.filter((v) => v === true).length : 0;
  const d = Math.min(count(defective), n);
  const u = n >= 2 ? Math.min(count(nonUniform), n) : 0;
  return { u, d };
}

/* ------------------------------------------------------------
   RULE BEFORE 2026-11 ("v1"), kept only so past results render unchanged.
   A closed session is the record of that day: a score stored under v1 is shown
   with v1 arithmetic (lib/scoreRule.ts says which rule the data was scored
   under). Deductions existed only from five cups per sample; the individual
   score deducted 2 per non-uniform and 4 per defective cup (arrays counted
   independently, unclamped); the group deducted
   totalNonUniform x 10 / totalCups + totalDefective x 30 / totalCups with
   totalCups = cupsPerSample x included evaluations. Nothing new may call this.
   ------------------------------------------------------------ */
const V1_MIN_CUPS = 5;
const v1Applies = (cupsPerSample: number) =>
  Number.isFinite(cupsPerSample) && cupsPerSample >= V1_MIN_CUPS;

export interface CupDeduction {
  cups: number;
  nonUniform: number;
  defective: number;
  factor: number;
  uniformityPenalty: number;
  defectPenalty: number;
  total: number;
}

/** The deduction for `cups` cups holding `nonUniform` / `defective` flagged
 *  ones. Callers pass counts from `evaluationCupCounts` (this function does not
 *  apply the "2 cups" rule). Negatives and non-finite values count as 0. */
export function cupDeduction(input: {
  cups: number;
  nonUniform: number;
  defective: number;
}): CupDeduction {
  const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const cups = clean(input.cups);
  const nonUniform = clean(input.nonUniform);
  const defective = clean(input.defective);
  const factor = 5 / Math.max(5, cups);
  const uniformityPenalty = 2 * nonUniform * factor;
  const defectPenalty = 4 * defective * factor;
  return {
    cups,
    nonUniform,
    defective,
    factor,
    uniformityPenalty,
    defectPenalty,
    total: uniformityPenalty + defectPenalty,
  };
}

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
  /** Cups this evaluation covers (Evaluation.cups). Falls back to the
   *  `cupsPerSample` argument of computeGroupAggregate. */
  cups?: number;
  /** Rule THIS evaluation was scored under (callers derive it from `cups == null`
   *  on a stored row via evaluationScoreRule). Used only for the SD, so the
   *  "± SD" chip agrees with the owner matrix's per-cupper scores. Defaults to
   *  the aggregate's rule. */
  rule?: ScoreRule;
}

export interface GroupAggregate {
  submitted: number;
  included: number;
  avgRawScore: number | null;
  communityScore: number | null;
  // Population standard deviation (÷n) of each included cupper's individual
  // CVA total, over the same included/complete population that feeds
  // avgRawScore/communityScore. null when fewer than 2 included evaluations.
  // Mirrors OwnerParticipantSection's rowStats math — see that component for
  // the client-side twin of this calculation.
  scoreSd: number | null;
  totalNonUniform: number;
  totalDefective: number;
  totalCups: number;
  // Session-scope deduction (pooled cups of the included evaluations).
  uniformityPenalty: number;
  defectPenalty: number;
  deductionFactor: number;
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
  opts?: { rule?: ScoreRule },
): GroupAggregate {
  const rule: ScoreRule = opts?.rule ?? "v2";
  const submitted = evals.length;
  const complete = evals.filter((e) => isAffectiveComplete(e.data));
  const included = complete.length;

  if (included === 0) {
    return {
      submitted,
      included: 0,
      avgRawScore: null,
      communityScore: null,
      scoreSd: null,
      totalNonUniform: 0,
      totalDefective: 0,
      totalCups: 0,
      uniformityPenalty: 0,
      defectPenalty: 0,
      deductionFactor: 1,
      attrAverages: {},
    };
  }

  const avgRawScore =
    complete.reduce((acc, e) => acc + calcRawScore(e.data), 0) / included;

  // scoreSd: population SD (÷n) of each included cupper's individual CVA
  // total. Same population as avgRawScore/communityScore — `complete` already
  // excludes master-excluded cuppers (filtered by the caller) and incomplete
  // evaluations (filtered above).
  const cupsOf = (e: GroupEvalInput) => e.cups ?? cupsPerSample;
  const individualScores = complete
    .map((e) => {
      const er: ScoreRule = e.rule ?? rule;
      return calcIndividualScore(e.data, er === "v1" ? cupsPerSample : cupsOf(e), { rule: er });
    })
    .filter((v): v is number => typeof v === "number");
  let scoreSd: number | null = null;
  if (individualScores.length >= 2) {
    const iMean =
      individualScores.reduce((a, b) => a + b, 0) / individualScores.length;
    const iVariance =
      individualScores.reduce((a, b) => a + (b - iMean) ** 2, 0) /
      individualScores.length;
    scoreSd = Math.round(Math.sqrt(iVariance) * 100) / 100;
  }

  if (rule === "v1") {
    // Rule before 2026-11 (see the v1 note above): gated by the session's cups.
    let nu = 0;
    let df = 0;
    if (v1Applies(cupsPerSample)) {
      for (const e of complete) {
        nu += (e.nonUniformCups ?? []).filter(Boolean).length;
        df += (e.defectiveCups ?? []).filter(Boolean).length;
      }
    }
    const cupsV1 = cupsPerSample * included;
    const gated = v1Applies(cupsPerSample);
    const up = gated && cupsV1 > 0 ? nu * (10 / cupsV1) : 0;
    const dp = gated && cupsV1 > 0 ? df * (30 / cupsV1) : 0;
    const communityV1 =
      !avgRawScore || cupsV1 === 0
        ? 0
        : Math.max(0, Math.min(100, roundToQuarter(avgRawScore - up - dp)));
    const attrV1: Record<string, number> = {};
    for (const attr of AFFECTIVE_ATTRIBUTES) {
      let sum = 0;
      for (const e of complete) sum += Number(e.data[`${attr.id}_final`] ?? e.data[attr.id] ?? 0);
      attrV1[attr.label] = Math.round((sum / included) * 100) / 100;
    }
    return {
      submitted,
      included,
      avgRawScore: Math.round(avgRawScore * 100) / 100,
      communityScore: communityV1,
      scoreSd,
      totalNonUniform: nu,
      totalDefective: df,
      totalCups: cupsV1,
      uniformityPenalty: up,
      defectPenalty: dp,
      deductionFactor: 1,
      attrAverages: attrV1,
    };
  }

  // Pooled over the included evaluations; flags are always counted (no gate),
  // each evaluation clamped to its own cups (evaluationCupCounts).
  let totalNonUniform = 0;
  let totalDefective = 0;
  let totalCups = 0;
  for (const e of complete) {
    const cups = cupsOf(e);
    const { u, d } = evaluationCupCounts(e.nonUniformCups, e.defectiveCups, cups);
    totalNonUniform += u;
    totalDefective += d;
    totalCups += Number.isFinite(cups) && cups > 0 ? cups : 0;
  }

  const deduction = cupDeduction({ cups: totalCups, nonUniform: totalNonUniform, defective: totalDefective });
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
    scoreSd,
    totalNonUniform,
    totalDefective,
    totalCups,
    uniformityPenalty: deduction.uniformityPenalty,
    defectPenalty: deduction.defectPenalty,
    deductionFactor: deduction.factor,
    attrAverages,
  };
}

// Full, transparent breakdown of an individual CVA score. This is the single
// source of truth for the live individual path: `calcIndividualScore` returns
// `.score` from here, and the N5 score-transparency panel renders the same
// intermediates, so the explainer can never drift from the displayed number.
//
// The counts are clamped to the evaluation's cups by the shared rule
// (evaluationCupCounts + cupDeduction), exactly like the stored score.
export interface IndividualBreakdown {
  affectiveSum: number; // Σhᵢ
  affectiveTerm: number; // 0.65625 × Σhᵢ
  base: number; // affectiveTerm + 52.75
  u: number; // non-uniform cups counted
  d: number; // defective cups counted
  uniformityTracked: boolean; // the evaluation has 2+ cups (with one cup uniformity does not exist)
  factor: number; // 5 / max(5, cups): always 1 for one cupper (never more than five cups)
  uniformityPenalty: number; // 2u × factor
  defectPenalty: number; // 4d × factor
  raw: number; // base − penalties, pre-rounding/clamp
  score: number; // final, clamped [0,100], rounded to 0.25
  cupsPerSample: number;
  rule: ScoreRule; // which rule produced the numbers ("v1" = before 2026-11, past results only)
}

export function calcIndividualBreakdown(
  data: EvalData,
  cupsPerSample: number,
  opts?: { rule?: ScoreRule },
): IndividualBreakdown {
  const { sum: affectiveSum } = calcAffectiveSum(data);
  const affectiveTerm = 0.65625 * affectiveSum;
  const base = affectiveTerm + 52.75;

  if (opts?.rule === "v1") {
    // Rule before 2026-11 (see the v1 note above), exactly as it was computed.
    const tracked = v1Applies(cupsPerSample);
    let u1 = 0;
    let d1 = 0;
    if (tracked) {
      u1 = ((data.tazas_no_uniformes as boolean[] | undefined) ?? []).filter(Boolean).length;
      d1 = ((data.tazas_defectuosas as boolean[] | undefined) ?? []).filter(Boolean).length;
    }
    const up = 2 * u1;
    const dp = 4 * d1;
    const raw1 = base - up - dp;
    return {
      affectiveSum,
      affectiveTerm,
      base,
      u: u1,
      d: d1,
      uniformityTracked: tracked,
      factor: 1,
      uniformityPenalty: up,
      defectPenalty: dp,
      raw: raw1,
      score: Math.max(0, Math.min(100, Math.round(raw1 * 4) / 4)),
      cupsPerSample,
      rule: "v1",
    };
  }

  const uniformityTracked = Number.isFinite(cupsPerSample) && cupsPerSample >= 2;
  const { u, d } = evaluationCupCounts(
    data.tazas_no_uniformes as boolean[] | undefined,
    data.tazas_defectuosas as boolean[] | undefined,
    cupsPerSample,
  );
  const { factor, uniformityPenalty, defectPenalty } = cupDeduction({
    cups: cupsPerSample,
    nonUniform: u,
    defective: d,
  });

  const raw = base - uniformityPenalty - defectPenalty;
  // CVA scores fall on quarter-point steps — round ONCE, as the final step,
  // to the nearest 0.25 (same tie handling as the trigger), after the deduction.
  const score = Math.max(0, Math.min(100, roundToQuarter(raw)));

  return {
    affectiveSum,
    affectiveTerm,
    base,
    u,
    d,
    uniformityTracked,
    factor,
    uniformityPenalty,
    defectPenalty,
    raw,
    score,
    cupsPerSample,
    rule: "v2",
  };
}

export function calcIndividualScore(
  data: EvalData,
  cupsPerSample: number,
  opts?: { rule?: ScoreRule },
): number | "—" {
  return calcIndividualBreakdown(data, cupsPerSample, opts).score;
}

// Session (group) score: the average of the included cuppers' bases minus the
// deduction of their POOLED cups (cupDeduction): flat up to five cups, diluted
// by 5 / cups beyond. totalNonUniform / totalDefective are the per-evaluation
// clamped sums (evaluationCupCounts); a defective cup is also in the
// non-uniform total, so it costs 4 + 2.
// This is display-only — the authoritative value is computed by the DB trigger.
export function calcCommunityScore(params: {
  avgRawScore: number;
  totalNonUniform: number;
  totalDefective: number;
  totalCups: number;
}): number {
  const { avgRawScore, totalCups } = params;
  // No pooled cups: nothing to deduct, the score is the rounded average (the
  // trigger does the same: its IF v_total_cups > 0 skips the deduction).
  if (!avgRawScore) return 0;
  const { uniformityPenalty, defectPenalty } =
    totalCups > 0
      ? cupDeduction({
          cups: totalCups,
          nonUniform: params.totalNonUniform,
          defective: params.totalDefective,
        })
      : { uniformityPenalty: 0, defectPenalty: 0 };
  // Round the final community score to the nearest 0.25, matching the DB trigger.
  return Math.max(0, Math.min(100, roundToQuarter(avgRawScore - uniformityPenalty - defectPenalty)));
}

/**
 * Nearest 0.25, the way the SQL trigger does it: `ROUND((x)::numeric * 4) / 4`.
 * Postgres casts float8 → numeric with 15 significant digits BEFORE rounding and
 * rounds halves away from zero; JS rounds the full double. On a tie that the
 * double misses by one bit the two differ by 0.25 (audit B-04: 7 cuppers, 5 cups,
 * Σ=20, 1 non-uniform + 2 defective → exact 63.875, TS 63.75, trigger 64).
 */
export function roundToQuarter(x: number): number {
  // Same 15 significant digits Postgres keeps, so a tie stored one bit short
  // (63.87499999999999) becomes the tie again (63.875) before rounding.
  return Math.round(Number(x.toPrecision(15)) * 4) / 4;
}

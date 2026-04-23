import { AFFECTIVE_ATTRIBUTES } from "./constants";

// Official SCA CVA formula:
//   S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
// hᵢ = the FINAL value (1-9) for each of the 8 affective attributes.
// u = non-uniform cups, d = defective cups (penalties applied only if ≥5 cups).
// Verification: Σ=8 → 58.00; Σ=40 → 79.00; Σ=72 → 100.00.

export type EvalData = Record<string, unknown>;

export function calcAffectiveSum(data: EvalData): {
  sum: number;
  filled: number;
} {
  let sum = 0;
  let filled = 0;
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const finalVal = Number(data[`${attr.id}_final`] ?? data[attr.id] ?? 0);
    sum += finalVal;
    if (finalVal > 0) filled += 1;
  }
  return { sum, filled };
}

export function calcRawScore(data: EvalData): number {
  const { sum } = calcAffectiveSum(data);
  return 0.65625 * sum + 52.75;
}

export function calcIndividualScore(
  data: EvalData,
  cupsPerSample: number,
): number | "—" {
  const { sum, filled } = calcAffectiveSum(data);
  if (filled === 0) return "—";

  let score = 0.65625 * sum + 52.75;

  if (cupsPerSample >= 5) {
    const nonUniform = (data.tazas_no_uniformes as boolean[] | undefined) ?? [];
    const defective = (data.tazas_defectuosas as boolean[] | undefined) ?? [];
    const u = nonUniform.filter(Boolean).length;
    const d = defective.filter(Boolean).length;
    score -= 2 * u;
    score -= 4 * d;
  }

  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

// Community formula: normalized penalties across all participants
// totalNonUniform = non-uniform but NOT defective cups, summed over all participants
// totalDefective  = defective cups only, summed over all participants
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
  return Math.max(0, Math.min(100, Math.round((avgRawScore - up - dp) * 100) / 100));
}

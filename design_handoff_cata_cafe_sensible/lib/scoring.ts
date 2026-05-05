/**
 * SCA CVA scoring
 *
 * Official formula:
 *   S = 0.65625 · Σhᵢ + 52.75 − 2u − 4d
 *
 *   hᵢ : 9-point affective score for each of 8 sections
 *        (fragrance, aroma, flavor, aftertaste, acidity,
 *         sweetness, mouthfeel, overall)
 *   u  : number of non-uniform cups (0–5)
 *   d  : number of defective cups   (0–5)
 *
 * Result is rounded to the nearest 0.25.
 */

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

/* ------------------------------------------------------------
   Pure calculator
   ------------------------------------------------------------ */
export function calculateCVAScore(
  sectionScores: number[],
  nonUniformCups: number,
  defectiveCups: number,
): number {
  const sum = sectionScores.reduce((acc, h) => acc + (Number.isFinite(h) ? h : 0), 0)
  const raw = 0.65625 * sum + 52.75 - 2 * nonUniformCups - 4 * defectiveCups
  return Math.round(raw * 4) / 4
}

/* ------------------------------------------------------------
   Full breakdown (for the Score Display card)
   ------------------------------------------------------------ */
export function calculateCVABreakdown(
  sectionScores: number[],
  nonUniformCups: number,
  defectiveCups: number,
): CVABreakdown {
  const affectiveSum = sectionScores.reduce(
    (acc, h) => acc + (Number.isFinite(h) ? h : 0),
    0,
  )
  const affectiveTerm = 0.65625 * affectiveSum
  const uniformityPenalty = 2 * nonUniformCups
  const defectPenalty    = 4 * defectiveCups
  const raw = affectiveTerm + 52.75 - uniformityPenalty - defectPenalty
  const score = Math.round(raw * 4) / 4
  return {
    sectionScores,
    nonUniformCups,
    defectiveCups,
    affectiveSum,
    affectiveTerm,
    uniformityPenalty,
    defectPenalty,
    raw,
    score,
  }
}

/* ------------------------------------------------------------
   Score → SCA descriptive band
   ------------------------------------------------------------ */
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

/* Convenience: green / amber / red band for color usage */
export function scoreBand(score: number): 'green' | 'amber' | 'red' {
  if (score >= 85) return 'green'
  if (score >= 75) return 'amber'
  return 'red'
}

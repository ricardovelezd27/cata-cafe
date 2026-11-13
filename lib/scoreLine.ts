import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import { defectTally } from "@/lib/cupDefects";
import { roundToQuarter, type IndividualBreakdown } from "@/lib/scoring";

/**
 * The one-line arithmetic under a cupper's own total (S10 WP1b, results
 * drill-down). Pure: it only RE-PRESENTS the numbers `calcIndividualBreakdown`
 * already computed (the same function the stored/displayed score comes from), so
 * the last number of the line is always the score shown beside it.
 *
 *   "82.25 − 4 (1 phenolic cup) − 2 (1 non-uniform cup) = 76.25"
 *
 * Number format: the app prints scores with `toFixed(2)` in both languages
 * (ScorePill, ScoreBreakdownPanel), so this does too; whole deductions print
 * without decimals. TODO(kim-validar:A1) TODO(kim-validar:A3)
 */

/** Singular / plural noun phrases, one pair per kind of cup (messages `results.breakdown.line.*`).
 *  Whole phrases, not ICU plurals: the line is rendered client-side. */
export type ScoreLineLabels = {
  nonUniformOne: string;
  nonUniformOther: string;
  unspecifiedOne: string;
  unspecifiedOther: string;
  moldyOne: string;
  moldyOther: string;
  phenolicOne: string;
  phenolicOther: string;
  potatoOne: string;
  potatoOther: string;
};

const TYPE_KEYS: Record<SensoryDefect, [keyof ScoreLineLabels, keyof ScoreLineLabels]> = {
  moldy: ["moldyOne", "moldyOther"],
  phenolic: ["phenolicOne", "phenolicOther"],
  potato: ["potatoOne", "potatoOther"],
};

const MINUS = "−";

function amount(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

function phrase(n: number, one: string, other: string): string {
  return `${n} ${n === 1 ? one : other}`;
}

const isQuarter = (x: number) => Math.abs(x * 4 - Math.round(x * 4)) < 1e-9;

/** The line, or null when nothing was deducted (then the total stands alone). */
export function buildScoreLine(
  b: IndividualBreakdown,
  data: Record<string, unknown>,
  labels: ScoreLineLabels,
): string | null {
  const terms: string[] = [];
  const factorText = b.factor < 1 ? ` × 5/${amount(b.cupsPerSample)}` : "";

  if (b.defectPenalty > 0 && b.d > 0) {
    // The rule before 2026-11 counted the whole stored array, unclamped.
    const arrLen = Array.isArray(data.tazas_defectuosas) ? data.tazas_defectuosas.length : 0;
    const tally = defectTally(data, b.rule === "v1" ? Math.max(b.cupsPerSample, arrLen) : b.cupsPerSample);
    const typedSum = SENSORY_DEFECTS.reduce((a, d) => a + tally.byType[d], 0);
    const parts: string[] = [];
    if (typedSum <= b.d) {
      for (const d of SENSORY_DEFECTS) {
        const n = tally.byType[d];
        if (n > 0) parts.push(phrase(n, labels[TYPE_KEYS[d][0]], labels[TYPE_KEYS[d][1]]));
      }
      const unspecified = b.d - typedSum;
      if (unspecified > 0) parts.push(phrase(unspecified, labels.unspecifiedOne, labels.unspecifiedOther));
    } else {
      parts.push(phrase(b.d, labels.unspecifiedOne, labels.unspecifiedOther));
    }
    terms.push(`${MINUS} ${amount(b.defectPenalty)} (${parts.join(", ")}${factorText})`);
  }
  if (b.uniformityPenalty > 0 && b.u > 0) {
    terms.push(
      `${MINUS} ${amount(b.uniformityPenalty)} (${phrase(b.u, labels.nonUniformOne, labels.nonUniformOther)}${factorText})`,
    );
  }
  if (terms.length === 0) return null;

  // Scores are rounded ONCE, to 0.25, after the deduction. When the deduction is
  // itself a multiple of 0.25 (always up to five cups) the base can be shown
  // rounded to 0.25 and the line adds up exactly; otherwise (or when the score
  // was clamped) the exact base and the unrounded result are shown, then the
  // rounded score after an arrow.
  const deduction = b.uniformityPenalty + b.defectPenalty;
  const baseQ = roundToQuarter(b.base);
  const exact = isQuarter(deduction) && roundToQuarter(baseQ - deduction) === b.score;
  if (exact) return `${baseQ.toFixed(2)} ${terms.join(" ")} = ${b.score.toFixed(2)}`;
  return `${b.base.toFixed(2)} ${terms.join(" ")} = ${b.raw.toFixed(2)} → ${b.score.toFixed(2)}`;
}

/** "Entre todos se cataron {cups} tazas…": only for a session score of the
 *  current rule whose pooled cups exceed five (that is when the deduction is
 *  diluted); otherwise null. `template` carries a `{cups}` placeholder. */
export function groupScopeLine(
  totalCups: number,
  rule: "v1" | "v2" | undefined,
  template: string,
): string | null {
  if (rule === "v1") return null;
  if (!Number.isFinite(totalCups) || totalCups <= 5) return null;
  return template.replace("{cups}", String(totalCups));
}

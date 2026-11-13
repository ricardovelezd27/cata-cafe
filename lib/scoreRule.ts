/**
 * Which cup-deduction rule a stored score was computed under (S10 WP1a).
 *
 * "v2" is the current rule (docs/product/cata-descentralizada-puntaje.md): flat
 * CVA deductions at any cup count, shared across pooled cups, diluted beyond
 * five. "v1" is the rule in force before 2026-11 (deductions only from five
 * cups per sample; the group formula 10 / 30 over total cups). It is kept ONLY
 * so past results render unchanged: a closed session is the record of that
 * day, so the screen applies the rule the stored number was computed with.
 *
 * The data says which rule: an Evaluation with `cups IS NULL` was scored under
 * v1 (the column is not backfilled); a sample's AggregateScore carries
 * `ruleVersion` (1 until the PHASE 26 trigger recomputes it, then 2).
 * No cut-over date exists anywhere.
 */
export type ScoreRule = "v1" | "v2";

/** v1 only for a STORED row whose cups is null. Local / unsaved form data is
 *  always v2 (it will be saved with `cups`). */
export function evaluationScoreRule(
  cups: number | null | undefined,
  isStoredRow: boolean,
): ScoreRule {
  return isStoredRow && (cups === null || cups === undefined) ? "v1" : "v2";
}

/** Which rule a sample's score was computed under.
 *  - A stored aggregate row says so itself: ruleVersion 1 = v1, anything else v2.
 *  - With NO aggregate row (the trigger has not run for the sample), the
 *    sample's stored evaluations say: v1 when there is at least one and EVERY
 *    one has `cups` NULL (all written before the 2026-11 rule); otherwise v2
 *    (no evaluations at all, or at least one written under the new rule).
 *  `evaluationCups` = the `cups` of every stored evaluation of the sample. */
export function sampleScoreRule(
  aggregate: { ruleVersion: number } | null | undefined,
  evaluationCups: ReadonlyArray<number | null | undefined> = [],
): ScoreRule {
  if (aggregate) return aggregate.ruleVersion === 1 ? "v1" : "v2";
  if (evaluationCups.length > 0 && evaluationCups.every((c) => c === null || c === undefined)) {
    return "v1";
  }
  return "v2";
}

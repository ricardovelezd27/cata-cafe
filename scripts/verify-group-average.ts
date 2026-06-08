/**
 * Verification trace for the group-average completeness fix.
 *
 * Confirms that computeGroupAggregate() includes a participant's score for a
 * sample ONLY when their evaluation is complete (all 8 affective attributes
 * non-zero), excludes all-zero and partially-filled evaluations, and reports the
 * real "X of Y" denominator.
 *
 * Run: npm run verify:group-average
 */
import { AFFECTIVE_ATTRIBUTES } from "../lib/constants";
import {
  computeGroupAggregate,
  isAffectiveComplete,
  calcRawScore,
  type GroupEvalInput,
} from "../lib/scoring";

const CUPS_PER_SAMPLE = 5;

// Build an affective data blob by assigning each of the 8 attributes a value.
function makeData(values: number[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  AFFECTIVE_ATTRIBUTES.forEach((attr, i) => {
    data[`${attr.id}_final`] = values[i] ?? 0;
  });
  return data;
}

const complete: GroupEvalInput = { data: makeData([7, 7, 7, 7, 7, 7, 7, 7]) };
const allZeros: GroupEvalInput = { data: makeData([0, 0, 0, 0, 0, 0, 0, 0]) };
const partial: GroupEvalInput = { data: makeData([7, 7, 7, 7, 0, 0, 0, 0]) };

const evals = [complete, allZeros, partial];
const labels = ["complete (all 7)", "all zeros", "partial (4×7, 4×0)"];

console.log("=== Per-evaluation trace ===");
evals.forEach((e, i) => {
  console.log(
    `  ${labels[i].padEnd(20)} included=${String(
      isAffectiveComplete(e.data),
    ).padEnd(5)} rawScore=${calcRawScore(e.data).toFixed(2)}`,
  );
});

const agg = computeGroupAggregate(evals, CUPS_PER_SAMPLE);
console.log("\n=== Group aggregate ===");
console.log(`  submitted        = ${agg.submitted}`);
console.log(`  included         = ${agg.included}`);
console.log(`  avgRawScore      = ${agg.avgRawScore}`);
console.log(`  communityScore   = ${agg.communityScore}`);
console.log(`  totalCups        = ${agg.totalCups}`);

// Expected: only the complete eval counts. raw = 0.65625*56 + 52.75 = 89.5,
// no cup penalties → communityScore = 89.5.
const expectedCommunity = calcRawScore(complete.data);

const checks: [string, boolean][] = [
  ["submitted === 3", agg.submitted === 3],
  ["included === 1", agg.included === 1],
  ["communityScore === lone complete eval", agg.communityScore === expectedCommunity],
  ["avgRawScore === lone complete eval", agg.avgRawScore === expectedCommunity],
];

console.log("\n=== Assertions ===");
let failed = false;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error("\n❌ Verification FAILED");
  process.exit(1);
}
console.log("\n✅ Verification passed");

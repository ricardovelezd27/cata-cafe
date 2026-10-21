// Pure per-row statistics for the owner's cupper x sample CVA matrix.
// Extracted verbatim from components/results/OwnerParticipantSection.tsx so
// the on-screen traffic light and the ficha tecnica appendix share thresholds.

export type RowStats = { mean: number; sd: number; count: number };
export type Band = "neutral" | "green" | "amber" | "red";

/** Mean + population SD (÷n) over the INCLUDED numeric values only — outlier
 *  detection reflects the same population the group score uses. `included[i]`
 *  false drops values[i]. Fewer than 2 numbers → `{0, 0, count}`. */
export function rowStats(values: (number | null)[], included: boolean[]): RowStats {
  const nums = values.filter((v, i): v is number => v !== null && (included[i] ?? true));
  if (nums.length < 2) return { mean: 0, sd: 0, count: nums.length };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return { mean, sd: Math.sqrt(variance), count: nums.length };
}

/** >= 2 SD from the mean red (possible outlier), >= 1 SD amber, else green.
 *  Neutral without a value, with fewer than 2 values, or a zero SD. */
export function bandFor(value: number | null, stats: RowStats): Band {
  if (value === null) return "neutral";
  const { sd, mean, count } = stats;
  if (count < 2 || sd === 0) return "neutral";
  const dev = Math.abs(value - mean);
  if (dev >= 2 * sd) return "red";
  if (dev >= sd) return "amber";
  return "green";
}

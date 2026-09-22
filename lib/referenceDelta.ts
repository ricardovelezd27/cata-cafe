// Display-only helpers for the "muestra de referencia" (reference / control
// sample). Pure — no Prisma, no server imports — so the results surfaces and
// the vitest suite share one implementation. Scoring never reads any of this:
// the reference is a point of comparison, not an input to the CVA formula.

export type ScoredRow = { id: string; score: number | null };

/** The score a results surface actually displays for a sample: the community
 *  score when the group view is unlocked AND one exists, otherwise the
 *  viewer's own score. Mirrors ResumenTab.rankFor so every Δ shares the same
 *  basis as the number it sits next to. */
export function pickDisplayedScore(
  myScore: number | null,
  communityScore: number | null,
  showCommunity: boolean,
): number | null {
  return showCommunity && communityScore !== null ? communityScore : myScore;
}

/** `score − referenceScore`; null when either side is unscored. */
export function referenceDelta(
  score: number | null,
  referenceScore: number | null,
): number | null {
  if (score === null || referenceScore === null) return null;
  return score - referenceScore;
}

/** id → Δ for every row. The reference row itself and unscored rows map to
 *  null; every entry is null when there is no reference or it is unscored. */
export function deltasVsReference(
  rows: ScoredRow[],
  referenceId: string | null,
): Map<string, number | null> {
  const refScore = referenceId
    ? (rows.find((r) => r.id === referenceId)?.score ?? null)
    : null;
  return new Map(
    rows.map((r) => [
      r.id,
      r.id === referenceId ? null : referenceDelta(r.score, refScore),
    ]),
  );
}

/** "+1.25" / "−0.50" / "0.00" — U+2212 minus sign, never "−0.00". */
export function formatSignedDelta(delta: number, digits = 2): string {
  const rounded = Number(delta.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return rounded > 0
    ? `+${rounded.toFixed(digits)}`
    : `\u2212${Math.abs(rounded).toFixed(digits)}`;
}

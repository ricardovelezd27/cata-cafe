// Display-only helpers for the "muestra de referencia" (reference / control
// sample). Pure — no Prisma, no server imports — so the results surfaces and
// the vitest suite share one implementation. Scoring never reads any of this:
// the reference is a point of comparison, not an input to the CVA formula.

/** Which number a surface is showing: the viewer's own CVA score or the
 *  group's community score. A Δ is only meaningful between two numbers of
 *  the SAME basis — comparing my score with the group's score of the
 *  reference would be a different measure, not a difference. */
export type ScoreBasis = "mine" | "community";

export type ScoredRow = { id: string; score: number | null; basis?: ScoreBasis | null };

/** The score a results surface actually displays for a sample: the community
 *  score when the group view is unlocked AND one exists, otherwise the
 *  viewer's own score. Mirrors ResumenTab.rankFor so every Δ shares the same
 *  basis as the number it sits next to. */
export function pickDisplayedScore(
  myScore: number | null,
  communityScore: number | null,
  showCommunity: boolean,
): number | null {
  return pickDisplayed(myScore, communityScore, showCommunity).score;
}

/** Same rule as pickDisplayedScore, but also says WHICH basis was picked so
 *  callers can refuse to compare across bases. */
export function pickDisplayed(
  myScore: number | null,
  communityScore: number | null,
  showCommunity: boolean,
): { score: number | null; basis: ScoreBasis | null } {
  if (showCommunity && communityScore !== null) {
    return { score: communityScore, basis: "community" };
  }
  return { score: myScore, basis: myScore === null ? null : "mine" };
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
 *  null; every entry is null when there is no reference or it is unscored.
 *  When rows carry a `basis`, a Δ is only produced between rows of the same
 *  basis as the reference row (mixed bases → null). */
export function deltasVsReference(
  rows: ScoredRow[],
  referenceId: string | null,
): Map<string, number | null> {
  const ref = referenceId ? (rows.find((r) => r.id === referenceId) ?? null) : null;
  const refScore = ref?.score ?? null;
  const refBasis = ref?.basis ?? null;
  return new Map(
    rows.map((r) => {
      if (r.id === referenceId) return [r.id, null];
      const rowBasis = r.basis ?? null;
      if (refBasis !== null && rowBasis !== null && rowBasis !== refBasis) {
        return [r.id, null];
      }
      return [r.id, referenceDelta(r.score, refScore)];
    }),
  );
}

/** "+1.25" / "−0.50" / "0.00" — U+2212 minus sign, never "−0.00". */
export function formatSignedDelta(delta: number, digits = 2): string {
  const rounded = Number(delta.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return rounded > 0
    ? `+${rounded.toFixed(digits)}`
    : `−${Math.abs(rounded).toFixed(digits)}`;
}

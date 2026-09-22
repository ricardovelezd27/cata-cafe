// Pure scroll→fold bracketing for the constellation field. Given the page-space
// centre of every `[data-fold]` section and the page-space focus point (viewport
// centre), returns the two adjacent folds the focus sits between and how far
// along it is. Continuous, adjacent-only, holds at both ends. DOM-free so it is
// unit-tested in tests/landingBracket.test.ts.

export type FoldAnchor = { i: number; c: number };

export type Bracket = { a: number; b: number; blend: number };

export function bracket(
  anchors: readonly FoldAnchor[],
  focus: number,
  foldCount: number,
): Bracket {
  const usable = anchors
    .filter((a) => a.i >= 0 && a.i < foldCount)
    .sort((p, q) => p.c - q.c);

  if (usable.length === 0) return { a: 0, b: 0, blend: 0 };

  const first = usable[0];
  if (focus <= first.c) return { a: first.i, b: first.i, blend: 0 };

  const last = usable[usable.length - 1];
  if (focus >= last.c) return { a: last.i, b: last.i, blend: 0 };

  for (let k = 0; k < usable.length - 1; k++) {
    const lo = usable[k];
    const hi = usable[k + 1];
    if (focus >= lo.c && focus < hi.c) {
      return {
        a: lo.i,
        b: hi.i,
        blend: (focus - lo.c) / (hi.c - lo.c || 1),
      };
    }
  }
  return { a: last.i, b: last.i, blend: 0 };
}

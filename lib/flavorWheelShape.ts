// WHAT one counted flavour wheel draws (package R1d: the owner chose "option C"
// and asked for the large wheel to be the mirror of the small one).
//
//   - a GROUND per family: its whole sector, "everyone", in a pale tint of the
//     family's tone. All nine are drawn, so a family nobody found is still seen;
//   - a PETAL per family somebody found, in the family's tone, as long as the
//     people who found it (the geometry of lib/flavorWheel.ts, unchanged);
//   - a TIP on every petal that stops short of the ring: the arc that closes it,
//     drawn in the colour of the paper. Where a petal ends is then a paper line
//     between the tone and its tint, never two shades of one colour to tell
//     apart (two of the nine tones are only 3.2 : 1 against white, so no visible
//     tint of them can sit 3 : 1 under the petal);
//   - the outer RING, and nothing inside it: no ring per person. A petal is read
//     against its own ground (the full sector is everyone) and by the count
//     printed beside it, which the caller must keep, with the panel's size.
//
// The small wheel and the large one, on the page and on paper, all draw exactly
// this list (components/results/FlavorWheel.tsx, lib/pdf/charts.tsx): the large
// one only adds the words around it. `wheelRings` (lib/flavorWheel.ts) is still
// the scale of the COMPARISON drawing, whose territories print no counts.
//
// Pure: no React, no DOM, no colour. Relative imports, so a script run with tsx
// can load it. Display-only: scoring, the trigger and AggregateScore never read it.

import {
  PETAL_HALF_DEG,
  WHEEL_FAMILY_ORDER,
  familyAngle,
  petalPath,
  wheelPoint,
  type WheelFamilyId,
  type WheelFrame,
  type WheelGeometry,
} from "./flavorWheel";

/**
 * How much of a family's tone is in its ground; the rest is paper. The page
 * paints the tone at this opacity (`.ground` in FlavorWheel.module.css) and the
 * PDF mixes the same share over white (`pdfPaleTint`, lib/pdf/palette.ts); a
 * test keeps the two equal. 0.18 is the tint the owner looked at and chose.
 */
export const WHEEL_GROUND_SHARE = 0.18;

export type WheelShapePart = { family: WheelFamilyId; d: string };

export type WheelShape = {
  /** Every family's whole sector, in the wheel's order. Empty when nobody cupped
   *  the coffee: with no panel there is no "everyone" to draw. */
  grounds: WheelShapePart[];
  /** The families somebody found, in the wheel's order. */
  petals: WheelShapePart[];
  /** The closing arc of each petal that stops short of the outer ring. */
  tips: WheelShapePart[];
  /** Radius of the outer ring: the only circle a wheel draws. */
  ring: number;
};

/** Every family's whole sector for a panel of `n`: the petal of "everyone". */
export function familyGrounds(frame: WheelFrame, n: number): WheelShapePart[] {
  return WHEEL_FAMILY_ORDER.flatMap((family, index) => {
    const d = petalPath(frame, index, n, n);
    return d === null ? [] : [{ family, d }];
  });
}

/** The arc a petal ends on: from one of its sides to the other, at `radius`.
 *  It lies exactly on the outer edge of `petalPath` for the same family. */
export function petalTipPath(frame: WheelFrame, index: number, radius: number): string {
  const a = familyAngle(index);
  const from = wheelPoint(frame, radius, a - PETAL_HALF_DEG);
  const to = wheelPoint(frame, radius, a + PETAL_HALF_DEG);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;
}

/** Everything a wheel draws inside its labels, from the geometry of one coffee. */
export function wheelShape(g: WheelGeometry): WheelShape {
  const found = g.petals.filter((p) => p.d !== null);
  return {
    grounds: familyGrounds(g.frame, g.n),
    petals: found.map((p) => ({ family: p.family, d: p.d as string })),
    tips: found
      .filter((p) => p.count < g.n)
      .map((p) => ({ family: p.family, d: petalTipPath(g.frame, p.index, p.radius) })),
    ring: g.rings.find((r) => r.outer)?.radius ?? g.frame.R,
  };
}

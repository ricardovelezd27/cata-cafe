// The landing's shapes, as numbers shared by the two places that draw them
// (audit K-03):
//   - the constellation (components/landing/journey/formations.ts), which
//     scatters hundreds of moving dots on these rings on the dark stage;
//   - the still formations of the paper empty states
//     (`stillFormation` below, drawn by components/ui/Formation.tsx).
// Change a ratio here and both change together. Pure, no DOM.

/** "Cátalo": three cupping bowls seen from above, each three rings (fraction of the bowl's radius). */
export const BOWL_RINGS = [0.34, 0.66, 1] as const;

/** "Descríbelo": the flavour wheel, three rings (fraction of the wheel's radius) and nine families. */
export const WHEEL_RINGS = [0.42, 0.7, 1] as const;
export const WHEEL_FAMILIES = 9;

/** "Gathering": people around one cupping table seen from above (the waiting room's drawing). */
export const GATHERING = { ring: 8, ringRadius: 0.38, arriving: 6 } as const;

export type FormationKind = "bowls" | "wheel" | "gathering";

/** A dot of a still formation. `tone`: the ink, a softer ink, or the accent. */
export type StillDot = { x: number; y: number; r: number; tone: "ink" | "soft" | "accent" };
export type StillFormation = { width: number; height: number; dots: StillDot[] };

const TAU = Math.PI * 2;
/** A stable fraction per index (golden ratio), standing in for the landing's random `idR`. */
const frac = (i: number) => (i * 0.6180339887) % 1;
const round = (v: number) => Math.round(v * 100) / 100;

function ring(cx: number, cy: number, r: number, count: number, offset: number, dot: (i: number, a: number) => Omit<StillDot, "x" | "y">): StillDot[] {
  return Array.from({ length: count }, (_, i) => {
    const a = offset + (i / count) * TAU;
    return { x: round(cx + Math.cos(a) * r), y: round(cy + Math.sin(a) * r), ...dot(i, a) };
  });
}

/**
 * A still formation, small enough to stand beside an empty state's title.
 * The same ratios as the landing's; even spacing instead of the landing's
 * scatter, because a still picture of random dots reads as noise.
 */
export function stillFormation(kind: FormationKind): StillFormation {
  if (kind === "bowls") {
    // three bowls, the middle one a little higher: a cupping table from above
    const R = 14;
    const centres: [number, number][] = [
      [22, 44],
      [60, 28],
      [98, 44],
    ];
    const counts = [6, 10, 14];
    const dots = centres.flatMap(([cx, cy], b) =>
      BOWL_RINGS.flatMap((share, k) =>
        ring(cx, cy, R * share, counts[k], b * 0.4 + k * 0.2, (i) => {
          // the landing's colour shares: about one dot in eight the accent, half the ink
          const f = frac(b * 31 + k * 7 + i);
          return { r: k === 2 ? 1.7 : 1.5, tone: f < 0.12 ? "accent" : f < 0.6 ? "ink" : "soft" };
        }),
      ),
    );
    return { width: 120, height: 72, dots };
  }
  if (kind === "wheel") {
    const R = 32;
    const counts = [18, 27, 36];
    const dots = WHEEL_RINGS.flatMap((share, k) =>
      ring(40, 40, R * share, counts[k], -Math.PI / 2, (_, a) => {
        // nine families; the first one in the accent, the others alternate ink and soft
        const family = Math.floor(((a + Math.PI / 2 + TAU) % TAU) / (TAU / WHEEL_FAMILIES)) % WHEEL_FAMILIES;
        return { r: 1.6, tone: family === 0 ? "accent" : family % 2 ? "ink" : "soft" };
      }),
    );
    return { width: 80, height: 80, dots };
  }
  // gathering: a ring of people at the table, and a few still arriving
  const R = 80 * GATHERING.ringRadius * 0.5;
  const table = ring(40, 40, R, GATHERING.ring, -Math.PI / 2, (i) => ({ r: 3, tone: i === 0 ? "accent" : "ink" }));
  const arriving = [
    { a: -0.35, d: 1.85 },
    { a: 0.55, d: 2.05 },
    { a: 1.6, d: 1.8 },
    { a: 2.45, d: 2.15 },
    { a: 3.5, d: 1.9 },
    { a: 4.6, d: 2.1 },
  ]
    .slice(0, GATHERING.arriving)
    .map(({ a, d }) => ({ x: round(40 + Math.cos(a) * R * d), y: round(40 + Math.sin(a) * R * d), r: 2, tone: "soft" as const }));
  return { width: 80, height: 80, dots: [...arriving, ...table] };
}

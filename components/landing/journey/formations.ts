// Constellation formations — one per fold of the landing page. The field is a
// single particle cloud that morphs as the visitor scrolls; every formation
// here MUST mean what its section's copy says (this is storytelling, never
// decoration). Pure math, no DOM: unit-tested in tests/landingFormations.test.ts.
//
//   0 Hero        DISPERSIÓN   many palates, scattered
//   1 Cátalo      PERCIBIR     three cupping bowls seen from above
//   2 Descríbelo  DESCRIBIR    the flavor wheel, nine families
//   3 Calibra     MEDIR        the 1–9 track: cohort tight around the reference
//   4 Fundadores  CONVERGER    the cohort becomes "100"
//   5 Cierre      CONSTELACIÓN a sparse net framing the closing line
//
// Coordinates are screen pixels for a given viewport (W,H). `idR[i]` is a
// stable per-particle random so a particle keeps its role while morphing.
//
// Two layout facts the formations must respect (both unit-tested):
//  - Desktop, folds 1–3: the app screens pile up in a box that stays put on
//    the LEFT (`deviceRect`) while the copy scrolls on the right. The shapes
//    are drawn as a halo AROUND that box, never mostly behind it.
//  - Phones, folds 0–3: every section leads with its text, so the upper band
//    of the screen (`NARROW_TEXT_BAND`) carries little ink.

export const FOLD_COUNT = 6;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Geometry of the sticky pile in "Cómo funciona". These numbers MIRROR the
 * `.steps-*` rules in app/globals.css (content width, column split, card
 * size, sticky offset); change both together.
 */
export const PILE = {
  contentMax: 1008, // max-w-6xl at the 14px root
  pad: 28, // sm:px-8 at the 14px root
  gap: 56,
  leftShare: 0.45,
  cardW: 320,
  cardH: 300,
  headroom: 80, // space above the front card for the two cards behind it
  footroom: 44, // the 1-2-3 rail under the card
  minTop: 76,
} as const;

/** Screen rectangle of the FRONT card of the pile; null where nothing is pinned (phones). */
export function deviceRect(W: number, H: number, narrow: boolean): Rect | null {
  if (narrow) return null;
  const content = Math.min(W, PILE.contentMax);
  const colW = (content - PILE.pad * 2 - PILE.gap) * PILE.leftShare;
  const cx = (W - content) / 2 + PILE.pad + colW / 2;
  const boxH = PILE.headroom + PILE.cardH + PILE.footroom;
  const y0 = Math.max(PILE.minTop, H / 2 - boxH / 2) + PILE.headroom;
  return { x0: cx - PILE.cardW / 2, x1: cx + PILE.cardW / 2, y0, y1: y0 + PILE.cardH };
}

/** Phones: the band (fractions of H) where a section's copy sits when its fold is centred. */
export const NARROW_TEXT_BAND = { y0: 0.08, y1: 0.5 } as const;

// Palette indices. The engine resolves them to live CSS tokens at mount
// (`--color-primary-fixed`, `--color-secondary-container`, `--color-surface`,
// `--color-flavor-*`); "DIM" variants are the same hue at lower alpha.
export const PALETTE = {
  MINT: 0,
  MINT_DIM: 1,
  TERRA: 2,
  TERRA_DIM: 3,
  CREAM: 4,
  CREAM_DIM: 5,
  FLAVOR0: 6, // + 0..8 → floral, fruity, sweet, sour, green, nutty, spice, roasted, other
  length: 15,
} as const;

export interface Formation {
  x: Float32Array;
  y: Float32Array;
  /** palette index per particle */
  c: Uint8Array;
  /** per-particle jitter amplitude, px */
  jitter: number;
  /** whole-formation opacity multiplier 0..1 */
  alpha: number;
  /** fold 5 only: flat pairs of particle indices to join with a faint line */
  segments?: Uint16Array;
  /** arrival only (./intro.ts): per-particle size multiplier, i.e. depth. Absent = 1. */
  scale?: Float32Array;
}

const TAU = Math.PI * 2;

// Deterministic RNG so formations are identical across rebuilds/resizes.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quasi-gaussian in roughly [-1, 1]. */
function gauss(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}

/** Stable per-particle identity randoms, shared by every formation. */
export function seedIdentity(N: number): Float32Array {
  const rng = mulberry32(0x9e3779b9);
  const idR = new Float32Array(N);
  for (let i = 0; i < N; i++) idR[i] = rng();
  return idR;
}

function alloc(N: number) {
  return { x: new Float32Array(N), y: new Float32Array(N), c: new Uint8Array(N) };
}

// ── 0 · HERO · DISPERSIÓN ────────────────────────────────────────────────────
// A whole room of palates before calibration: an even scatter, right-weighted
// on desktop so the copy column stays clean; on phones thinner over the top
// band, where the headline sits. Mostly mint; a terracotta minority is the
// cohort we will follow to the 1–9 track later.
function buildHero(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(1001);
  const x0 = narrow ? 0.02 : 0.5;
  for (let i = 0; i < N; i++) {
    a.x[i] = W * (x0 + rng() * (0.98 - x0));
    const v = rng();
    a.y[i] = narrow
      ? H * (idR[i] < 0.26 ? 0.04 + v * 0.46 : 0.5 + v * 0.46)
      : H * (0.04 + v * 0.92);
    const r = idR[i];
    a.c[i] = r < 0.2 ? (r < 0.12 ? PALETTE.TERRA : PALETTE.TERRA_DIM) : r < 0.6 ? PALETTE.MINT : PALETTE.MINT_DIM;
  }
  return { ...a, jitter: Math.min(W, H) * 0.012, alpha: narrow ? 0.55 : 0.9 };
}

// ── 1 · CÁTALO · PERCIBIR ────────────────────────────────────────────────────
// Three cupping bowls from above (concentric rings), made of the same palates
// that were scattered a moment ago. Desktop: they peek out around the corners
// of the pinned screen (upper left, below, upper right). Phones: low on the
// screen, under the step's text.
function buildBowls(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(2002);
  const R = Math.min(W, H) * (narrow ? 0.13 : 0.11);
  const d = deviceRect(W, H, narrow);
  const centres: [number, number][] = d
    ? [
        [Math.max(R + 12, d.x0 - R * 0.5), d.y0 + R * 0.35],
        [d.x0 + (d.x1 - d.x0) * 0.3, d.y1 + R * 0.55],
        [d.x1 - R * 0.1, d.y0 - R * 0.6],
      ]
    : [[W * 0.22, H * 0.62], [W * 0.8, H * 0.68], [W * 0.5, H * 0.88]];
  const rings = [0.34, 0.66, 1];
  for (let i = 0; i < N; i++) {
    const [cx, cy] = centres[i % 3];
    const ring = rings[Math.floor(idR[i] * 3) % 3];
    const th = rng() * TAU;
    const rr = R * ring + gauss(rng) * R * 0.045;
    a.x[i] = cx + Math.cos(th) * rr;
    a.y[i] = cy + Math.sin(th) * rr;
    a.c[i] = idR[i] < 0.12 ? PALETTE.CREAM : idR[i] < 0.6 ? PALETTE.MINT : PALETTE.MINT_DIM;
  }
  return { ...a, jitter: Math.min(W, H) * 0.007, alpha: narrow ? 0.5 : 0.85 };
}

// ── 2 · DESCRÍBELO · DESCRIBIR ───────────────────────────────────────────────
// The flavor wheel on Kim's table: three rings, nine angular families, each in
// its own family colour. Desktop: the rings are wide enough to circle the
// pinned screen, centred a little to its left so nothing reaches the copy.
// Phones: low on the screen.
function buildWheel(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(3003);
  const d = deviceRect(W, H, narrow);
  let cx = W * 0.5;
  let cy = H * 0.72;
  let R = W * 0.4;
  let rings = [0.42, 0.7, 1];
  if (d) {
    const w = d.x1 - d.x0;
    const h = d.y1 - d.y0;
    R = Math.hypot(w / 2, h / 2) * 1.1;
    rings = [0.78, 0.92, 1.06];
    cx = Math.max(R * 1.08 + 8, (d.x0 + d.x1) / 2 - w * 0.2);
    cy = (d.y0 + d.y1) / 2;
  }
  for (let i = 0; i < N; i++) {
    const th = rng() * TAU;
    const ring = rings[Math.floor(idR[i] * 3) % 3];
    const rr = R * ring + gauss(rng) * R * 0.035;
    a.x[i] = cx + Math.cos(th) * rr;
    a.y[i] = cy + Math.sin(th) * rr;
    const seg = Math.floor((th / TAU) * 9) % 9;
    a.c[i] = PALETTE.FLAVOR0 + seg;
  }
  return { ...a, jitter: Math.min(W, H) * 0.004, alpha: narrow ? 0.55 : 0.9 };
}

// ── 3 · CALIBRA · MEDIR ──────────────────────────────────────────────────────
// The 1–9 affective track from CalibrationWidget, drawn in particles: a mint
// vertical column at the instructor reference (7.5) and the terracotta cohort
// collapsed onto the line, tight around it with a few honest stragglers.
export const TRACK_REFERENCE = 7.5;

/** Where the track runs. Desktop: under the pinned screen, left of the copy. */
export function trackSpan(
  W: number,
  H: number,
  narrow: boolean,
): { x0: number; x1: number; y: number } {
  const d = deviceRect(W, H, narrow);
  if (!d) return { x0: W * 0.06, x1: W * 0.94, y: H * 0.64 };
  return {
    x0: Math.max(W * 0.03, d.x0 - W * 0.08),
    x1: Math.min(d.x1 + W * 0.02, W * 0.45),
    // Clear of the 1-2-3 rail that sits right under the card.
    y: d.y1 + PILE.footroom + H * 0.085,
  };
}

function buildTrack(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(4004);
  const { x0, x1, y } = trackSpan(W, H, narrow);
  const span = x1 - x0;
  const ref = x0 + ((TRACK_REFERENCE - 1) / 8) * span;
  const column = H * (narrow ? 0.1 : 0.07);
  for (let i = 0; i < N; i++) {
    const r = idR[i];
    if (r < 0.15) {
      // reference column
      a.x[i] = ref + gauss(rng) * 1.5;
      a.y[i] = y + gauss(rng) * column;
      a.c[i] = r < 0.1 ? PALETTE.MINT : PALETTE.MINT_DIM;
    } else if (r < 0.32) {
      // stragglers along the whole track
      a.x[i] = x0 + rng() * span;
      a.y[i] = y + gauss(rng) * H * 0.012;
      a.c[i] = PALETTE.TERRA_DIM;
    } else {
      // calibrated cohort
      a.x[i] = ref + gauss(rng) * span * 0.035;
      a.y[i] = y + gauss(rng) * H * 0.012;
      a.c[i] = PALETTE.TERRA;
    }
  }
  return { ...a, jitter: Math.min(W, H) * 0.0015, alpha: narrow ? 0.6 : 0.95 };
}

// ── 4 · FUNDADORES · CONVERGER ───────────────────────────────────────────────
// The calibrated cohort becomes the founding "100": a bar and two rings, built
// procedurally (no font sampling → pure, testable, no fonts.ready rebuild).
function buildHundred(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(5005);
  const h = H * (narrow ? 0.16 : 0.28);
  const barW = h * 0.12;
  const ringRx = h * 0.34;
  const ringRy = h * 0.5;
  const thick = h * 0.11;
  const gap = h * 0.22;
  const total = barW + gap + ringRx * 2 + gap + ringRx * 2;
  const left = W * 0.5 - total / 2;
  const cy = H * 0.5;
  const barCx = left + barW / 2;
  const ring1Cx = left + barW + gap + ringRx;
  const ring2Cx = ring1Cx + ringRx * 2 + gap;
  // Perimeter-weighted split: bar ≈ 18 %, each ring ≈ 41 %.
  for (let i = 0; i < N; i++) {
    const r = idR[i];
    if (r < 0.18) {
      a.x[i] = barCx + (rng() - 0.5) * barW;
      a.y[i] = cy + (rng() - 0.5) * h;
    } else {
      const cx = r < 0.59 ? ring1Cx : ring2Cx;
      const th = rng() * TAU;
      const rx = ringRx - thick / 2 + rng() * thick;
      const ry = ringRy - thick / 2 + rng() * thick;
      a.x[i] = cx + Math.cos(th) * rx;
      a.y[i] = cy + Math.sin(th) * ry;
    }
    a.c[i] = rng() < 0.7 ? PALETTE.CREAM : PALETTE.CREAM_DIM;
  }
  return { ...a, jitter: Math.min(W, H) * 0.0008, alpha: narrow ? 0.6 : 0.9 };
}

// ── 5 · CIERRE · CONSTELACIÓN ────────────────────────────────────────────────
// The page ends on the constellation itself: a sparse net of joined points
// that FRAMES the closing line (the section has no photo and no card). Anchors
// are in viewport fractions and keep out of the centre, where the headline
// and the button sit; the remaining dust thins out there too. Neighbour
// segments are precomputed here and drawn by the engine only once the fold
// has (almost) fully arrived.
export const NET_CLEAR = { u0: 0.16, u1: 0.84, v0: 0.3, v1: 0.72 } as const;

export const NET_ANCHORS: readonly [number, number][] = (() => {
  const rng = mulberry32(6060);
  const out: [number, number][] = [];
  const wobble = (amp: number) => (rng() - 0.5) * amp;
  // two rows above the line, two below
  const rows: [number, number, number][] = [
    [0.09, 11, 0.04],
    [0.2, 10, 0.09],
    [0.82, 10, 0.09],
    [0.92, 11, 0.04],
  ];
  for (const [v, count, inset] of rows) {
    for (let k = 0; k < count; k++) {
      const u = inset + ((1 - inset * 2) * k) / (count - 1);
      out.push([u + wobble(0.03), v + wobble(0.05)]);
    }
  }
  // the two flanks
  for (const v of [0.34, 0.46, 0.58, 0.7]) {
    out.push([0.05 + wobble(0.04), v + wobble(0.03)]);
    out.push([0.95 + wobble(0.04), v + wobble(0.03)]);
  }
  return out;
})();

function buildNet(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(6006);
  const M = NET_ANCHORS.length;
  for (let i = 0; i < N; i++) {
    if (i < M) {
      a.x[i] = W * NET_ANCHORS[i][0];
      a.y[i] = H * NET_ANCHORS[i][1];
      a.c[i] = PALETTE.MINT;
    } else {
      // Sparse dust, mostly above and below the closing line; idR keeps roles
      // stable while the rest of the cloud thins out.
      const u = rng();
      const v = rng();
      const band = idR[i];
      a.x[i] = W * u;
      a.y[i] = H * (band < 0.44 ? 0.02 + v * 0.26 : band < 0.88 ? 0.74 + v * 0.24 : v);
      a.c[i] = idR[i] < 0.3 ? PALETTE.CREAM_DIM : PALETTE.MINT_DIM;
    }
  }
  // Two nearest neighbours per anchor, deduped, capped by length.
  const maxLen = Math.min(W, H) * 0.22;
  const seen = new Set<number>();
  const segs: number[] = [];
  for (let p = 0; p < M; p++) {
    const dists: { q: number; d: number }[] = [];
    for (let q = 0; q < M; q++) {
      if (q === p) continue;
      dists.push({ q, d: Math.hypot(a.x[p] - a.x[q], a.y[p] - a.y[q]) });
    }
    dists.sort((u, v) => u.d - v.d);
    for (const { q, d } of dists.slice(0, 2)) {
      if (d > maxLen) continue;
      const key = p < q ? p * M + q : q * M + p;
      if (seen.has(key)) continue;
      seen.add(key);
      segs.push(p, q);
    }
  }
  return {
    ...a,
    jitter: Math.min(W, H) * 0.001,
    alpha: narrow ? 0.45 : 0.6,
    segments: Uint16Array.from(segs),
  };
}

const BUILDERS = [buildHero, buildBowls, buildWheel, buildTrack, buildHundred, buildNet];

export function buildFormation(
  fold: number,
  N: number,
  W: number,
  H: number,
  idR: Float32Array,
  narrow: boolean,
): Formation {
  const b = BUILDERS[fold] ?? BUILDERS[0];
  return b(N, W, H, idR, narrow);
}

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
//   5 Cierre      CONSTELACIÓN a sparse net over the closing photo
//
// Coordinates are screen pixels for a given viewport (W,H). `idR[i]` is a
// stable per-particle random so a particle keeps its role while morphing.

export const FOLD_COUNT = 6;

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
// on desktop so the copy column stays clean. Mostly mint; a terracotta
// minority is the cohort we will follow to the 1–9 track later.
function buildHero(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(1001);
  const x0 = narrow ? 0.02 : 0.5;
  for (let i = 0; i < N; i++) {
    a.x[i] = W * (x0 + rng() * (0.98 - x0));
    a.y[i] = H * (0.04 + rng() * 0.92);
    const r = idR[i];
    a.c[i] = r < 0.2 ? (r < 0.12 ? PALETTE.TERRA : PALETTE.TERRA_DIM) : r < 0.6 ? PALETTE.MINT : PALETTE.MINT_DIM;
  }
  return { ...a, jitter: Math.min(W, H) * 0.012, alpha: narrow ? 0.55 : 0.9 };
}

// ── 1 · CÁTALO · PERCIBIR ────────────────────────────────────────────────────
// Three cupping bowls from above (concentric rings), the way the old CSS hero
// décor drew them — now made of the same palates that were scattered a moment
// ago. Sits in the visual column (right on desktop).
function buildBowls(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(2002);
  const centres: [number, number][] = narrow
    ? [[0.28, 0.22], [0.74, 0.34], [0.5, 0.8]]
    : [[0.68, 0.34], [0.86, 0.6], [0.64, 0.74]];
  const R = Math.min(W, H) * (narrow ? 0.13 : 0.11);
  const rings = [0.34, 0.66, 1];
  for (let i = 0; i < N; i++) {
    const [cx, cy] = centres[i % 3];
    const ring = rings[Math.floor(idR[i] * 3) % 3];
    const th = rng() * TAU;
    const rr = R * ring + gauss(rng) * R * 0.045;
    a.x[i] = W * cx + Math.cos(th) * rr;
    a.y[i] = H * cy + Math.sin(th) * rr;
    a.c[i] = idR[i] < 0.12 ? PALETTE.CREAM : idR[i] < 0.6 ? PALETTE.MINT : PALETTE.MINT_DIM;
  }
  return { ...a, jitter: Math.min(W, H) * 0.007, alpha: narrow ? 0.5 : 0.85 };
}

// ── 2 · DESCRÍBELO · DESCRIBIR ───────────────────────────────────────────────
// The flavor wheel on Kim's table: three rings, nine angular families, each in
// its own family colour. The copy column is on the RIGHT for this step, so the
// wheel lives on the left.
function buildWheel(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(3003);
  const cx = W * (narrow ? 0.5 : 0.27);
  const cy = H * (narrow ? 0.42 : 0.5);
  const R = narrow ? W * 0.4 : Math.min(W, H) * 0.3;
  const rings = [0.42, 0.7, 1];
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

export function trackSpan(W: number, narrow: boolean): { x0: number; x1: number } {
  return narrow ? { x0: W * 0.06, x1: W * 0.94 } : { x0: W * 0.5, x1: W * 0.95 };
}

function buildTrack(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(4004);
  const { x0, x1 } = trackSpan(W, narrow);
  const span = x1 - x0;
  const ref = x0 + ((TRACK_REFERENCE - 1) / 8) * span;
  const y = H * (narrow ? 0.62 : 0.55);
  for (let i = 0; i < N; i++) {
    const r = idR[i];
    if (r < 0.15) {
      // reference column
      a.x[i] = ref + gauss(rng) * 1.5;
      a.y[i] = y + gauss(rng) * H * 0.11;
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
// A sparse net over the closing photo (05-slurp.jpg, three cuppers bent over
// white bowls). Anchors are in normalized 3:2 image coordinates and are mapped
// with the same cover-fit the photo uses (`object-cover`), so the points ride
// on faces and bowls at any viewport. Neighbour segments are precomputed here
// and drawn by the engine only once the fold has (almost) fully arrived.
export const NET_ANCHORS: readonly [number, number][] = [
  // heads / shoulders band
  [0.14, 0.4], [0.2, 0.34], [0.27, 0.42], [0.33, 0.36], [0.4, 0.3], [0.46, 0.35],
  [0.53, 0.28], [0.6, 0.33], [0.66, 0.4], [0.73, 0.36], [0.8, 0.42], [0.86, 0.38],
  [0.18, 0.5], [0.3, 0.52], [0.43, 0.48], [0.56, 0.46], [0.69, 0.5], [0.82, 0.52],
  // hands / spoons
  [0.24, 0.6], [0.36, 0.62], [0.5, 0.58], [0.63, 0.61], [0.76, 0.6],
  // bowls band
  [0.1, 0.78], [0.19, 0.82], [0.28, 0.76], [0.37, 0.83], [0.46, 0.78], [0.55, 0.84],
  [0.64, 0.79], [0.73, 0.83], [0.82, 0.77], [0.9, 0.82],
  // upper air
  [0.08, 0.14], [0.22, 0.1], [0.38, 0.16], [0.52, 0.09], [0.66, 0.15], [0.8, 0.1], [0.92, 0.18],
  [0.15, 0.24], [0.45, 0.22], [0.75, 0.24], [0.6, 0.7], [0.32, 0.7],
];

function coverFit(W: number, H: number, imgAspect = 3 / 2) {
  const scale = Math.max(W / imgAspect, H); // drawn height after object-cover
  const drawnW = scale * imgAspect;
  const drawnH = scale;
  return {
    x: (u: number) => (W - drawnW) / 2 + u * drawnW,
    y: (v: number) => (H - drawnH) / 2 + v * drawnH,
  };
}

function buildNet(N: number, W: number, H: number, idR: Float32Array, narrow: boolean): Formation {
  const a = alloc(N);
  const rng = mulberry32(6006);
  const fit = coverFit(W, H);
  const M = NET_ANCHORS.length;
  for (let i = 0; i < N; i++) {
    if (i < M) {
      a.x[i] = fit.x(NET_ANCHORS[i][0]);
      a.y[i] = fit.y(NET_ANCHORS[i][1]);
      a.c[i] = PALETTE.MINT;
    } else {
      // sparse dust; idR keeps roles stable while the rest of the cloud thins out
      a.x[i] = W * rng();
      a.y[i] = H * rng();
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

// The arrival of the constellation: "muchas voces, un paladar".
//
// A moment after the page shows, the dots appear scattered at every depth, in
// the nine flavour-family colours (many voices). They gather into ONE ring, a
// cupping bowl seen from a low angle (one palate): its near side is drawn
// larger than its far side, which is all the depth the engine needs. Then the
// ring lets go and the dots settle into the hero formation.
//
// It is an ARRIVAL, not a curtain: the canvas mounts after the page has
// loaded and gone idle (ConstellationMount), so the headline and the offer
// card are already on screen and never wait for this.
//
// Pure math, no DOM: unit-tested in tests/landingIntro.test.ts. The engine
// feeds these two formations through its ordinary (A, B, blend) step.

import { PALETTE, type Formation } from "./formations";

const TAU = Math.PI * 2;

/** Durations of the three phases, ms. */
export const INTRO = { gatherMs: 950, holdMs: 400, releaseMs: 750 } as const;
export const INTRO_TOTAL_MS = INTRO.gatherMs + INTRO.holdMs + INTRO.releaseMs;

export type IntroPhase = "gather" | "hold" | "release" | "done";

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Where the arrival is after `elapsedMs`. `t` runs 0..1 inside the phase and
 * is already eased for "gather" (fast at first, gentle landing on the ring).
 */
export function introProgress(elapsedMs: number): { phase: IntroPhase; t: number } {
  const e = Math.max(0, elapsedMs);
  if (e < INTRO.gatherMs) return { phase: "gather", t: easeOutQuart(e / INTRO.gatherMs) };
  if (e < INTRO.gatherMs + INTRO.holdMs) {
    return { phase: "hold", t: (e - INTRO.gatherMs) / INTRO.holdMs };
  }
  if (e < INTRO_TOTAL_MS) {
    return { phase: "release", t: (e - INTRO.gatherMs - INTRO.holdMs) / INTRO.releaseMs };
  }
  return { phase: "done", t: 1 };
}

/**
 * The arrival plays once per browser tab, and only for a visitor who is at
 * the top of the page, can see it, and has not asked for less motion or data.
 */
export function shouldPlayIntro(o: {
  reduced: boolean;
  saveData: boolean;
  seen: boolean;
  hidden: boolean;
  scrollY: number;
}): boolean {
  return !o.reduced && !o.saveData && !o.seen && !o.hidden && o.scrollY < 40;
}

// Hero layout (HeroSection.tsx): two equal columns in the max-w-6xl
// container, the offer card in the right one.
const HERO = { contentMax: 1008, pad: 28, gap: 49 } as const;

/**
 * The ring. Desktop: a wide, flat ellipse centred on the offer card and
 * wider than it, so its two ends reach out on either side of the card.
 * Phones: across the screen at the card's top edge.
 */
export function introRing(
  W: number,
  H: number,
  narrow: boolean,
): { cx: number; cy: number; rx: number; ry: number } {
  if (narrow) {
    const rx = W * 0.46;
    return { cx: W / 2, cy: H * 0.5, rx, ry: rx * 0.42 };
  }
  const content = Math.min(W, HERO.contentMax);
  const colW = (content - HERO.pad * 2 - HERO.gap) / 2;
  const cx = (W - content) / 2 + HERO.pad + colW + HERO.gap + colW / 2;
  const rx = Math.min(W * 0.3, 440, W - cx - 12);
  return { cx, cy: H * 0.53, rx, ry: rx * 0.36 };
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smallest and largest per-dot size multiplier (far and near). */
export const INTRO_SCALE = { min: 0.45, max: 1.75 } as const;

/**
 * `scatter` (where the dots first appear) and `ring` (where they gather).
 * A dot keeps its flavour family in both, so nothing changes colour on the
 * way in; `scale` is its apparent size from depth.
 */
export function buildIntro(
  N: number,
  W: number,
  H: number,
  idR: Float32Array,
  narrow: boolean,
): { scatter: Formation; ring: Formation } {
  const rng = mulberry32(7007);
  const { cx, cy, rx, ry } = introRing(W, H, narrow);
  const alpha = narrow ? 0.55 : 0.9;
  const unit = Math.min(W, H);

  const scatter = {
    x: new Float32Array(N),
    y: new Float32Array(N),
    c: new Uint8Array(N),
    scale: new Float32Array(N),
    jitter: unit * 0.012,
    alpha,
  };
  const ring = {
    x: new Float32Array(N),
    y: new Float32Array(N),
    c: new Uint8Array(N),
    scale: new Float32Array(N),
    jitter: unit * 0.003,
    alpha,
  };

  for (let i = 0; i < N; i++) {
    // idR gives each dot its place around the ring, hence its family.
    const th = idR[i] * TAU;
    const family = PALETTE.FLAVOR0 + (Math.floor(idR[i] * 9) % 9);
    const band = 1 + (rng() + rng() + rng() - 1.5) * 0.04; // thin ring

    ring.x[i] = cx + Math.cos(th) * rx * band;
    ring.y[i] = cy + Math.sin(th) * ry * band;
    ring.c[i] = family;
    // sin > 0 is the lower half of the ellipse: the side nearest the viewer.
    ring.scale[i] = 1 + Math.sin(th) * 0.55;

    scatter.x[i] = W * rng();
    scatter.y[i] = H * rng();
    scatter.c[i] = family;
    scatter.scale[i] = INTRO_SCALE.min + rng() * (INTRO_SCALE.max - INTRO_SCALE.min);
  }

  return { scatter, ring };
}

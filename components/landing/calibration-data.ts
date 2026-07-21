// Static demo data for the hero CalibrationWidget — a miniature of a real
// group cupping calibration round. Five students score the same sample on the
// CVA affective scale (1–9) and, over the round, converge toward the
// instructor's reference value. Numbers are illustrative, not from a live
// session, but the scale, step, and CVA conversion mirror the real app so the
// widget reads as a faithful preview of the product.

export const AFFECTIVE_MIN = 1;
export const AFFECTIVE_MAX = 9;
export const SCORE_STEP = 0.25;

// Instructor reference value on the 1–9 affective scale. The whole round is a
// convergence toward this target.
export const REFERENCE = 7.5;

// The visitor's own dot starts here; the self-demo sweeps it toward REFERENCE.
export const DEFAULT_USER_SCORE = 6.75;

// The self-demo drives the visitor's slider through three eased moves (from
// DEFAULT_USER_SCORE), dramatizing how much a single taster's rating can wander
// before settling on the instructor reference: undershoot → overshoot → settle.
// Clamped to the affective scale. The final move MUST land on REFERENCE.
export const DEMO_MOVES: number[] = [5.75, 8.5, REFERENCE].map((v) =>
  Math.min(AFFECTIVE_MAX, Math.max(AFFECTIVE_MIN, v)),
);

export type Cupper = {
  key: "c1" | "c2" | "c3" | "c4" | "c5";
  start: number; // scattered opening impression (pre-calibration)
  end: number; // converged value after the round
};

// Opening scores are deliberately scattered across ~5.5–8.75 (the "cost of
// guessing"); closing scores tighten around ~7.0–7.75 (calibrated agreement).
export const CUPPERS: Cupper[] = [
  { key: "c1", start: 5.5, end: 7.0 },
  { key: "c2", start: 8.75, end: 7.75 },
  { key: "c3", start: 6.5, end: 7.25 },
  { key: "c4", start: 8.0, end: 7.5 },
  { key: "c5", start: 6.0, end: 7.25 },
];

// Linear interpolation of a cupper's score for a given round progress (0→1).
export function cupperScore(c: Cupper, progress: number): number {
  return c.start + (c.end - c.start) * progress;
}

// Spread = disagreement across the group (max − min). Narrows as the round
// converges; the widget shows it as "±X.X pts".
export function groupSpread(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.max(...scores) - Math.min(...scores);
}

export function groupMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

// Projection of one affective value onto the 100-point CVA cup score, assuming
// all 8 affective attributes scored the same: S = 0.65625 × (8·h) + 52.75 =
// 5.25·h + 52.75 (see lib/scoring.ts for the full formula). Display only.
export function cvaScore(h: number): number {
  return Math.round((5.25 * h + 52.75) * 100) / 100;
}

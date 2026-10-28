// Easing for the warm-up timeline. Pure; vitest-covered.
//
// Slow legs use `softLinear`: a constant-speed core with short quadratic ramps
// at both ends (velocity profile = trapezoid). Pure linear pops at t = 0 and
// dead-stops at the turn; ease-in-out over 15 s would spend half the leg
// changing speed, which contradicts Kim's "constant slowness". The ramps add
// < 2 % position error and make the turn feel like an arrival.

/** Progress 0..1 → position 0..1 with ramps of `rampFrac` (0 < r ≤ 0.45). */
export function softLinear(u: number, rampFrac: number): number {
  const r = Math.min(0.45, Math.max(0.0001, rampFrac));
  const x = Math.min(1, Math.max(0, u));
  const v = 1 / (1 - r); // plateau velocity so the total displacement is 1
  if (x < r) return (v * x * x) / (2 * r);
  if (x <= 1 - r) return v * (x - r / 2);
  return 1 - (v * (1 - x) * (1 - x)) / (2 * r);
}

/** Ramp fraction for a leg of `durMs` with 600 ms ramps. */
export function rampFracFor(durMs: number, rampMs = 600): number {
  if (durMs <= 0) return 0.0001;
  return Math.min(0.45, rampMs / durMs);
}

/** Ease-in-out sine (cubic-bezier(0.37,0,0.63,1) equivalent). */
export function sineInOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

/** Fast arm rep: 0.9 s up, 0.3 s at the top, 0.9 s down (sine ease each). */
export function upDownWave(tMs: number, cycleMs: number): number {
  const up = cycleMs * (0.9 / 2.1);
  const top = cycleMs * (0.3 / 2.1);
  const t = ((tMs % cycleMs) + cycleMs) % cycleMs;
  if (t < up) return sineInOut(t / up);
  if (t < up + top) return 1;
  return 1 - sineInOut((t - up - top) / (cycleMs - up - top));
}

/** Fast head/trunk rep: centre → right → centre → left → centre, one sine. */
export function sineWave(tMs: number, cycleMs: number): number {
  return Math.sin((2 * Math.PI * tMs) / cycleMs);
}

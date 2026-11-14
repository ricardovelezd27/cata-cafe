/**
 * Pure rules of the "Cómo funciona" pile on wide screens. The scroll position
 * is the timeline: a step's screen comes onto the pile while that step's
 * TITLE travels from the bottom of the viewport to its middle, and it is in
 * place exactly when the title is in the middle.
 *
 * No DOM here; StepsActiveObserver measures and writes the result.
 */

export const STEPS_SCRUB = {
  /** Title centre at this share of the viewport height: the screen starts to appear. */
  start: 0.92,
  /** Title centre here (the middle of the viewport): the screen is in place. */
  end: 0.5,
  /** From this progress on, the step counts as reached (the rail dot lights). */
  settled: 0.985,
  /** Time constant of the smoothing that follows the scroll, in ms. */
  followMs: 90,
} as const;

/** Ease in and out: the screen starts gently and lands gently. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How far a step's screen has come onto the pile, 0..1, from where its title
 * is. `titleCenterY` is measured from the top of the viewport.
 */
export function stepProgress(titleCenterY: number, viewportH: number): number {
  if (!(viewportH > 0) || !Number.isFinite(titleCenterY)) return 0;
  const startY = viewportH * STEPS_SCRUB.start;
  const endY = viewportH * STEPS_SCRUB.end;
  const raw = (startY - titleCenterY) / (startY - endY);
  return smoothstep(Math.min(1, Math.max(0, raw)));
}

/**
 * Which step the pile has reached: 1, then one more for each later step whose
 * screen has settled, in order (step 3 never counts before step 2).
 */
export function reachedStep(progress: readonly number[]): number {
  let step = 1;
  for (const p of progress) {
    if (p < STEPS_SCRUB.settled) break;
    step++;
  }
  return step;
}

/**
 * One frame of following: moves `current` toward `target` by the share that
 * `dtMs` allows, and snaps when the rest would not be visible. Independent of
 * the frame rate.
 */
export function follow(current: number, target: number, dtMs: number): number {
  const rest = target - current;
  if (Math.abs(rest) < 0.002) return target;
  const share = 1 - Math.exp(-Math.max(0, dtMs) / STEPS_SCRUB.followMs);
  return current + rest * share;
}

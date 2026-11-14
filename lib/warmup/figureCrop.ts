// "Half body" framing of the warm-up figure on phones. Pure (no React, no DOM).
//
// The four mannequin figures are drawn full body (viewBox 0 0 240 320), which
// is right for a thumbnail (standing or seated tells the exercises apart) but
// wastes a phone screen: the legs never move in any exercise, and they take
// 40 % of the height. On a 390 px wide phone the head ends up about 40 px
// across while the exercise runs and about 20 px on the intro, and a head
// turn moves the face 11 px. So on phone-width screens the stage shows the
// figure from the hips up (from the chest up for the head exercise): the same
// drawing, closer.
//
// The crop is done in CSS (components/warmup/WarmupPlayer.module.css, phone
// media query), not by swapping the viewBox, so the server render and the
// client agree and nothing jumps when the page hydrates. This module only
// supplies the numbers, as CSS custom properties on the <svg>, and the tests
// (tests/warmup-figureCrop.test.ts) check that everything that moves stays
// inside the frame.

import type { WarmupFigureKind } from "./exercises";

/** The mannequin's own drawing space. */
export const FIGURE_VIEW = { w: 240, h: 320 } as const;

/** A close frame, in the mannequin's user units: the horizontal centre of
 *  what is shown, its top edge and its height. The width is whatever the
 *  stage gives (the frame is as wide as the phone). */
export interface CloseFrame {
  readonly cx: number;
  readonly top: number;
  readonly h: number;
}

/** The stage fades the figure out over the last part of the frame, so the
 *  cut at the hips is soft. Everything that must be read sits above this
 *  share of the frame's height. */
export const CLOSE_FADE_FROM = 0.9;

/** One frame per figure. "eyes" has none: it is already a head-and-shoulders
 *  bust in its own drawing space. */
export const CLOSE_FRAME: Readonly<Partial<Record<WarmupFigureKind, CloseFrame>>> = {
  // Hips up. The hand hangs to y 206 and reaches y 27 overhead; its dotted
  // arc swings out to the right, so the frame sits a little right of the body.
  "arm-raise": { cx: 126, top: 10, h: 222 },
  // Chest up: only the face moves (13 units each way), so this is the frame
  // that gains the most.
  "head-rotate": { cx: 120, top: 16, h: 150 },
  // Seat up, in profile: the trunk tips forward from the hips (y 206), so the
  // seat line must stay in view. The frame leans toward where the head goes.
  "trunk-forward-back": { cx: 128, top: 12, h: 222 },
  // Seat up, from the front: the whole upper body slides 22 units each way.
  "trunk-side": { cx: 120, top: 12, h: 222 },
};

export interface CloseFrameVars {
  /** Scale: how much closer than the full-body frame. */
  readonly k: number;
  /** Horizontal shift, as a fraction of the figure box HEIGHT. */
  readonly x: number;
  /** Vertical shift, as a fraction of the figure box height. */
  readonly y: number;
}

/** Four decimals; `+ 0` turns a negative zero into a plain 0. */
const r4 = (n: number) => Math.round(n * 10000) / 10000 + 0;

/**
 * The CSS numbers of a figure's close frame, or null when it has none.
 *
 * The <svg> fills a box of height H and its drawing is fitted to that height
 * (1 unit = H / 320 px), centred. Scaling it by k = 320 / h about its top
 * centre makes `h` units fill the box; shifting it up by top x k units puts
 * the frame's top edge on the box's top edge, and sideways by (cx - 120) x k
 * units puts the frame's centre on the box's centre. Both shifts are
 * proportional to H, hence fractions of the box height.
 */
export function closeFrameVars(kind: WarmupFigureKind): CloseFrameVars | null {
  const f = CLOSE_FRAME[kind];
  if (!f) return null;
  const k = FIGURE_VIEW.h / f.h;
  return { k: r4(k), x: r4((-(f.cx - FIGURE_VIEW.w / 2) / FIGURE_VIEW.h) * k), y: r4((-f.top / FIGURE_VIEW.h) * k) };
}

/** The same numbers as inline CSS custom properties for the <svg>. */
export function closeFrameStyle(kind: WarmupFigureKind): Record<string, number> | undefined {
  const v = closeFrameVars(kind);
  return v ? { "--close-k": v.k, "--close-x": v.x, "--close-y": v.y } : undefined;
}

/** Half of the width that is visible in a close frame, in user units, for a
 *  figure box of `boxW` x `boxH` px (the drawing is height-fitted). */
export function closeHalfWidth(frame: CloseFrame, boxW: number, boxH: number): number {
  return (boxW / 2 / (boxH / FIGURE_VIEW.h)) * (frame.h / FIGURE_VIEW.h);
}

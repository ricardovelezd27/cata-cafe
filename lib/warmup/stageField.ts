// What the dots of the warm-up's stage do at any moment of a run. Pure (no
// DOM, no React, no clock): the player derives its input from the ONE run
// clock and components/warmup/StageField.tsx only draws the result.
// Unit-tested in tests/warmup-stageField.test.ts against every real timeline.
//
// The field must MEAN the instruction, never decorate it:
//
//   arrive    a soft disc that widens as you breathe in and gathers as you
//             breathe out (lib/warmup/breath.ts)
//   a leg     the cloud travels WITH the body part: the same direction on
//             screen as the figure, arriving exactly when the figure does,
//             and a little longer along the line of the movement
//   a hold    the cloud gathers and goes still (0.9 s), where the leg ended
//   stillness a small, almost still cloud
//   closing   the dots settle into one ring and quieten
//   bridge    the ring tightens: a cup seen from above ("lleva esta atención
//             a la taza"), the same picture as the landing's cupping bowls
//
// The centre of the cloud is a plain function of the POSE the figure shows,
// so it needs no memory: pause, seek or join late and the dots are where they
// should be. Everything is in units of the stage radius (the canvas scales
// it): + x is the viewer's right, + y is down.

import type { WarmupFigureKind } from "./exercises";
import type { Pose, Segment } from "./timelineTypes";

export interface FieldState {
  /** Radius of the cloud, as a fraction of the stage radius. */
  spread: number;
  /** 0 = a filled disc, 1 = a ring. */
  ring: number;
  /** Centre of the cloud. */
  dx: number;
  dy: number;
  /** Unit vector of the movement under way ((0,0) when nothing moves). */
  axisX: number;
  axisY: number;
  /** 1 = round; above 1 the cloud is longer along the axis. */
  stretch: number;
  /** 0 = perfectly still, 1 = the idle drift of the landing's dots. */
  jitter: number;
  /** How present the dots are (multiplies their alpha). */
  presence: number;
  /** 0..1, the soft pool of light under the cloud. */
  glow: number;
}

export const blankField = (): FieldState => ({
  spread: FIELD.rest,
  ring: 0,
  dx: 0,
  dy: 0,
  axisX: 0,
  axisY: 0,
  stretch: 1,
  jitter: 1,
  presence: 1,
  glow: 0.25,
});

/** The numbers of the choreography. Sizes are fractions of the stage radius. */
export const FIELD = {
  /** Lungs empty: the disc of the arrival at rest (0.3 + 0.7 x 0.62). */
  rest: 0.734,
  /** The arrival under reduced motion: one size, only the light breathes. */
  restReduced: 0.82,
  /** Behind the figure, while a step is read or moved. */
  open: 0.56,
  /** A hold: gathered. */
  gathered: 0.38,
  /** Stillness steps and the stillness after fast repetitions. */
  quiet: 0.48,
  /** The closing ring, from its first size to its settled one. */
  ringFrom: 0.74,
  ringTo: 0.58,
  /** The bridge: the ring tightens to a cup. */
  cup: 0.3,
  /** How far the centre travels for a full pose (a = 1). */
  travel: 0.3,
  /** Longer along the line of the movement, by this factor. */
  stretch: 1.2,
  /** Nearer dots travel further (depth), within this range. */
  depthMin: 0.7,
  depthMax: 1.3,
  /** The figure stands in front of the dots: they recede to this. */
  behindFigure: 0.5,
  /** A hold gathers over this long; the closing ring forms over this long. */
  gatherMs: 900,
  ringMs: 2500,
} as const;

/** The drawing budget (the player's loop calls `draw`; the field decides). */
export const FIELD_BUDGET = {
  /** Never more than 30 frames a second, whatever the loop does. */
  frameMs: 33,
  /** Eyes closed with the controls hidden: nobody is watching. */
  unwatchedFrameMs: 100,
  /** Dots on a phone / on a wide screen; times `weakFactor` on a weak device. */
  phoneDots: 300,
  wideDots: 520,
  weakFactor: 0.6,
  /** Mean cost of one draw before the governor cuts the dots (ms). */
  drawBudgetMs: 4,
} as const;

export function fieldDotCount(o: { coarse: boolean; weak: boolean }): number {
  const base = o.coarse ? FIELD_BUDGET.phoneDots : FIELD_BUDGET.wideDots;
  return Math.floor(base * (o.weak ? FIELD_BUDGET.weakFactor : 1));
}

/** Smallest gap between two draws. */
export const fieldFrameGapMs = (unwatched: boolean): number => (unwatched ? FIELD_BUDGET.unwatchedFrameMs : FIELD_BUDGET.frameMs);

/** What one call from the player's loop does:
 *  "wait"  too soon after the last draw (the frame-rate limit),
 *  "same"  the picture would not change (dots at rest, no drift, same state),
 *  "draw"  draw. A forced call (first frame, resize) always draws. */
export type FieldDraw = "draw" | "wait" | "same";
export function fieldDrawDecision(o: {
  /** ms since the last draw. */
  sinceLastMs: number;
  unwatched: boolean;
  force: boolean;
  /** Every dot has reached its place. */
  settled: boolean;
  /** The state asked for now: its drift, and whether it equals the last drawn. */
  jitter: number;
  unchanged: boolean;
}): FieldDraw {
  if (o.force) return "draw";
  if (o.sinceLastMs < fieldFrameGapMs(o.unwatched) - 1) return "wait";
  if (o.settled && o.jitter === 0 && o.unchanged) return "same";
  return "draw";
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where the centre of the cloud sits for a pose: the same way on screen as
 *  the figure's moving part (lib/warmup/poses.ts). */
export function poseOffset(kind: WarmupFigureKind, pose: Pose): { dx: number; dy: number } {
  const a = pose.a;
  const b = pose.b ?? 0;
  const T = FIELD.travel;
  switch (kind) {
    case "arm-raise":
      return { dx: 0, dy: -T * a }; // the arm goes up
    case "eyes":
      return { dx: T * a, dy: T * b };
    case "head-rotate":
    case "trunk-side":
      return { dx: T * a, dy: 0 };
    case "trunk-forward-back":
      return { dx: T * a, dy: 0 }; // the side-view figure leans to the right
  }
}

export interface FieldInput {
  kind: WarmupFigureKind;
  seg: Segment;
  /** Progress of the segment, 0..1, and ms since it started. */
  u: number;
  localMs: number;
  /** The pose the FIGURE shows now (already frozen under reduced motion). */
  pose: Pose;
  /** The breath of the arrival, while there is one. */
  breath?: { scale: number; halo: number } | null;
  reduced: boolean;
}

const MOVES: ReadonlySet<Segment["kind"]> = new Set(["out", "back", "cross", "reps"]);

/** The state of the field at one moment, written into `out`. */
export function fieldStateAt(inp: FieldInput, out: FieldState = blankField()): FieldState {
  const { seg, u, localMs, reduced } = inp;
  out.ring = 0;
  out.dx = 0;
  out.dy = 0;
  out.axisX = 0;
  out.axisY = 0;
  out.stretch = 1;

  if (seg.kind === "arrive") {
    const scale = inp.breath ? inp.breath.scale : 0.62;
    out.glow = inp.breath ? inp.breath.halo : 0.25;
    out.jitter = reduced ? 0 : 1;
    if (reduced) {
      // No change of size: only the brightness follows the breath.
      out.spread = FIELD.restReduced;
      out.presence = 0.55 + 0.45 * clamp01((scale - 0.62) / 0.38);
    } else {
      out.spread = 0.3 + 0.7 * scale;
      out.presence = 1;
    }
    return out;
  }

  if (seg.kind === "closing" || seg.kind === "bridge") {
    out.presence = 1;
    out.glow = 0.3;
    if (seg.kind === "closing") {
      out.ring = reduced ? 1 : smooth(localMs / FIELD.ringMs);
      out.spread = reduced ? FIELD.ringTo : lerp(FIELD.ringFrom, FIELD.ringTo, smooth(u));
      out.jitter = reduced ? 0 : lerp(0.6, 0.05, clamp01(u));
    } else {
      out.ring = 1;
      out.spread = reduced ? FIELD.cup : lerp(FIELD.ringTo, FIELD.cup, smooth(u));
      out.jitter = reduced ? 0 : 0.05;
    }
    return out;
  }

  // A step: the figure is in front, the cloud is where the body part is.
  const at = poseOffset(inp.kind, inp.pose);
  out.dx = at.dx;
  out.dy = at.dy;
  out.presence = FIELD.behindFigure;
  out.glow = 0.2;

  if (seg.kind === "hold") {
    const g = reduced ? 1 : smooth(localMs / FIELD.gatherMs);
    out.spread = lerp(FIELD.open, FIELD.gathered, g);
    out.jitter = reduced ? 0 : lerp(0.5, 0, g);
    out.glow = lerp(0.2, 0.32, g);
    return out;
  }

  if (MOVES.has(seg.kind)) {
    const from = poseOffset(inp.kind, seg.from);
    const to = poseOffset(inp.kind, seg.to);
    let ax = to.dx - from.dx;
    let ay = to.dy - from.dy;
    if (seg.kind === "reps" && ax === 0 && ay === 0) {
      // Fast repetitions end where they start: the line is the pose's own.
      const one = poseOffset(inp.kind, { a: 1, b: 0 });
      ax = one.dx;
      ay = one.dy;
    }
    const len = Math.hypot(ax, ay);
    if (len > 1e-6) {
      out.axisX = ax / len;
      out.axisY = ay / len;
      out.stretch = FIELD.stretch;
    }
    out.spread = FIELD.open;
    out.jitter = reduced ? 0 : seg.kind === "reps" ? 1 : 0.5;
    return out;
  }

  if (seg.kind === "rest" || seg.kind === "still") {
    out.spread = FIELD.quiet;
    out.jitter = reduced ? 0 : 0.2;
    return out;
  }

  // read / lead-in: waiting at the start of the movement.
  out.spread = FIELD.open;
  out.jitter = reduced ? 0 : 0.7;
  return out;
}

/** True when two states would draw the same picture. */
export function sameField(a: FieldState, b: FieldState): boolean {
  return (
    a.spread === b.spread &&
    a.ring === b.ring &&
    a.dx === b.dx &&
    a.dy === b.dy &&
    a.axisX === b.axisX &&
    a.axisY === b.axisY &&
    a.stretch === b.stretch &&
    a.jitter === b.jitter &&
    a.presence === b.presence &&
    a.glow === b.glow
  );
}

export function copyField(from: FieldState, to: FieldState): void {
  to.spread = from.spread;
  to.ring = from.ring;
  to.dx = from.dx;
  to.dy = from.dy;
  to.axisX = from.axisX;
  to.axisY = from.axisY;
  to.stretch = from.stretch;
  to.jitter = from.jitter;
  to.presence = from.presence;
  to.glow = from.glow;
}

/** What never changes about a dot: where it sits in the cloud, how near it
 *  is, and its two drift phases. */
export interface FieldIdentity {
  readonly n: number;
  /** Unit direction from the centre. */
  readonly cos: Float32Array;
  readonly sin: Float32Array;
  /** 0..1, uniform over the disc. */
  readonly rad: Float32Array;
  /** FIELD.depthMin..depthMax. */
  readonly depth: Float32Array;
  readonly phaseA: Float32Array;
  readonly phaseB: Float32Array;
}

export function seedField(n: number, rng: () => number): FieldIdentity {
  const id = {
    n,
    cos: new Float32Array(n),
    sin: new Float32Array(n),
    rad: new Float32Array(n),
    depth: new Float32Array(n),
    phaseA: new Float32Array(n),
    phaseB: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2;
    id.cos[i] = Math.cos(ang);
    id.sin[i] = Math.sin(ang);
    id.rad[i] = Math.sqrt(rng());
    id.depth[i] = lerp(FIELD.depthMin, FIELD.depthMax, rng());
    id.phaseA[i] = rng() * Math.PI * 2;
    id.phaseB[i] = rng() * Math.PI * 2;
  }
  return id;
}

/** Where each of the first `live` dots should be, in units of the stage
 *  radius from the centre of the stage. Writes into `outX` / `outY`. */
export function fillTargets(st: FieldState, id: FieldIdentity, live: number, outX: Float32Array, outY: Float32Array): void {
  const stretched = st.stretch !== 1 && (st.axisX !== 0 || st.axisY !== 0);
  const extra = st.stretch - 1;
  for (let i = 0; i < live; i++) {
    const rad = id.rad[i];
    // Ring: every dot moves out to a thin band at the rim.
    const r = (rad + (0.9 + 0.1 * rad - rad) * st.ring) * st.spread;
    let x = id.cos[i] * r;
    let y = id.sin[i] * r;
    if (stretched) {
      const along = x * st.axisX + y * st.axisY;
      x += st.axisX * along * extra;
      y += st.axisY * along * extra;
    }
    outX[i] = x + st.dx * id.depth[i];
    outY[i] = y + st.dy * id.depth[i];
  }
}

/** The furthest a dot can be from the centre of the stage in this state. */
export function fieldReach(st: FieldState): number {
  return st.spread * st.stretch + Math.hypot(st.dx, st.dy) * FIELD.depthMax;
}

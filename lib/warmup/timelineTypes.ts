// Types shared by the warm-up timeline (lib/warmup/timeline.ts), the figures,
// the progress bar, the audio scheduler and the player. Pure — no React.
//
// One exercise run is ONE timeline measured in milliseconds from the start of
// "Llega" (arrive). Every consumer derives its state from `elapsedMs` through
// `segmentAt` / `poseAt`; nothing keeps a second clock.

import type { WarmupFigureKind, WarmupLead } from "./exercises";

/** Normalised pose of the moving part. Per kind:
 *  arm-raise          a in [0,1]    0 = hanging, 1 = top (-160 deg)
 *  head-rotate        a in [-1,1]   + = viewer's right (mirror semantics)
 *  eyes               a, b in [-1,1]  a = gaze x (+ right), b = gaze y (+ down)
 *  trunk-forward-back a in [0,1]    0 = upright, 1 = forward (16 deg)
 *  trunk-side         a in [-1,1]   + = viewer's right
 *  Amplitude ("un centímetro") is applied by the builder: small = +-0.18. */
export interface Pose {
  readonly a: number;
  readonly b?: number;
}

export type SegmentKind =
  | "arrive" // Llega: posture line / breath cycles / notice (see arrivePhase)
  | "read" // read beat before a step: figure still in the step's start pose
  | "lead-in" // 400 ms (or leadInSec) of stillness before a leg starts
  | "out" // first leg of a movement
  | "hold" // "Para tres segundos" — zero motion at the extreme
  | "back" // return leg (to centre, or to the opposite extreme)
  | "cross" // "Vuelve al centro" / silent continuity crosses
  | "rest" // stillness steps ("siente tus cuatro apoyos")
  | "reps" // fast "un par de veces" — a wave, ends where it started
  | "still" // stillness after the reps, for the rest of the step
  | "closing" // 30 s neutral hold
  | "bridge"; // session mode: "Lleva esta atención a la taza" (5 s)

export type ArrivePhase = "posture" | "breath" | "notice";

export type EaseId = "softLinear" | "sine" | "none";

/** Label vocabulary under the progress bar (keys into warmup.label.*). */
export type SegmentLabel =
  | "up"
  | "down"
  | "right"
  | "left"
  | "forward"
  | "back"
  | "center"
  | "hold"
  | "still"
  | "fast"
  | "upNext"
  | "arrive"
  | "closing"
  | "bridge";

/** The four sounds, each with ONE meaning (hooks/useWarmupAudio.ts). */
export type CueKind = "campana" | "tic" | "cuenco" | "doble";

/** Short chrome line shown under the step text while the segment runs. */
export type ChromeCue = "stop" | "return" | "otherSide";

export interface Segment {
  readonly kind: SegmentKind;
  /** Index into exercise.steps; -1 for arrive / closing / bridge. */
  readonly stepIdx: number;
  readonly t0Ms: number;
  readonly durMs: number;
  readonly from: Pose;
  readonly to: Pose;
  readonly ease: EaseId;
  readonly label: SegmentLabel;
  readonly cueAtStart?: CueKind;
  readonly chromeCue?: ChromeCue;
  readonly arrivePhase?: ArrivePhase;
  /** Fast reps: n full cycles of `cycleMs` each; the wave returns to `from`. */
  readonly reps?: { readonly n: number; readonly cycleMs: number; readonly wave: "upDown" | "sine" };
  /** Hold folded into the read beat ("Para arriba tres segundos"): the last
   *  `foldedHoldMs` of a read segment render as the three PARA dots. */
  readonly foldedHoldMs?: number;
}

export interface CuePoint {
  readonly atMs: number;
  readonly kind: CueKind;
  readonly segIdx: number;
}

/** A continuous hum (soft drone) window: from the step's first movement
 *  segment to the step end — "campana → hum → tic → instructions". */
export interface HumWindow {
  readonly fromMs: number;
  readonly toMs: number;
  readonly stepIdx: number;
}

export interface WhisperSlot {
  readonly observeIdx: number;
  readonly fromMs: number;
  readonly untilMs: number;
}

export interface SecondaryText {
  /** Step whose text is shown UNDER the current step's text (readDuringPrevAtSec). */
  readonly stepIdx: number;
  readonly fromMs: number;
  readonly untilMs: number;
}

export type TimelineMode = "library" | "session";

export interface ExerciseTimeline {
  readonly exerciseId: string;
  readonly kind: WarmupFigureKind;
  readonly mode: TimelineMode;
  readonly totalMs: number;
  readonly segments: readonly Segment[];
  /** Per step: ms where its read beat starts / where its last segment ends. */
  readonly stepStart: readonly number[];
  readonly stepEnd: readonly number[];
  readonly arriveMs: number;
  readonly closingAt: number;
  /** Session mode only. */
  readonly bridgeAt: number | null;
  readonly cues: readonly CuePoint[];
  readonly hums: readonly HumWindow[];
  readonly whispers: readonly WhisperSlot[];
  readonly secondaryTexts: readonly SecondaryText[];
  /** "Deja que la respiración vaya sola." shows during this step's read beat. */
  readonly breathHintStepIdx: number | null;
  /** Observe items shown on the done screen (slot "done"). */
  readonly doneObserveIdx: readonly number[];
}

/** What the figure needs for a static render (library tiles, dev gallery). */
export interface FigureStaticSpec {
  readonly kind: WarmupFigureKind;
  readonly pose: Pose;
  readonly eyes: "open" | "closed";
  readonly lead?: WarmupLead;
  /** Trajectory of the leg to draw (dots from->to), progress 0..1 filled. */
  readonly path?: { readonly from: Pose; readonly to: Pose; readonly progress?: number };
}

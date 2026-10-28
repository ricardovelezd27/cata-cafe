// The warm-up timeline: ONE pure description of an exercise run, in
// milliseconds from the start of "Llega". The player, the progress bar, the
// figure, the audio scheduler and the synced-run seek all derive from it
// through `segmentAt` / `poseAt` / `cuePoints`. No React, no DOM.
//
// Rules (design council 2026-10-28, see docs/notes/S6-B.md and the plan):
//  - A READ BEAT precedes every step: clamp(3 + 0.25 × words, 4, 12) s with
//    words = max(es, en), so a mixed-locale room shares one timeline. The
//    figure stands in the step's START pose, which is always the previous
//    step's END pose (continuity rule).
//  - `holdBeforeSec` folds into the read beat: read(readMs − hold) + hold.
//  - Right-left round trips without `returns` go extreme → extreme (Kim Q1);
//    `returns` and forward-back end at centre. "center" steps cross back.
//  - Fast steps: 400 ms lead-in, then `reps` cycles (1 for up-down, else 2),
//    then stillness for the rest of the step.
//  - Sounds: campana at the start of every movement (lead-in when present),
//    tic at the end of every movement, cuenco at closing start, doble at
//    closing end. Whispers/secondary texts/breath hint are timed here too.

import {
  READ_BEAT,
  WARMUP_ARRIVE_SEC,
  WARMUP_BRIDGE_SEC,
  WARMUP_CLOSING_HOLD_SEC,
  WARMUP_FAST_LEAD_IN_MS,
  WARMUP_HOLD_SEC,
  WARMUP_LEG_SEC,
  type WarmupExercise,
  type WarmupFigureKind,
  type WarmupStep,
} from "./exercises";
import { ARRIVE_PLAN } from "./breath";
import { rampFracFor, sineWave, softLinear, upDownWave } from "./easing";
import type {
  CuePoint,
  ExerciseTimeline,
  HumWindow,
  Pose,
  SecondaryText,
  Segment,
  SegmentLabel,
  TimelineMode,
  WhisperSlot,
} from "./timelineTypes";

export const SMALL_AMPLITUDE = 0.18;
export const WHISPER_MS = 8000;
/** Silent continuity cross when the amplitude changes between steps. */
export const AMPLITUDE_CROSS_MS = 3000;
const LEG_MS = WARMUP_LEG_SEC * 1000;
const HOLD_MS = WARMUP_HOLD_SEC * 1000;

export function neutralPose(kind: WarmupFigureKind): Pose {
  return kind === "eyes" ? { a: 0, b: 0 } : { a: 0 };
}

const isNeutral = (p: Pose) => p.a === 0 && (p.b ?? 0) === 0;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Read beat for a step (0 when its text is shown during the previous step). */
export function readBeatMs(step: WarmupStep): number {
  if (step.readDuringPrevAtSec != null) return 0;
  const words = Math.max(wordCount(step.text.es), wordCount(step.text.en));
  const sec = Math.min(READ_BEAT.maxSec, Math.max(READ_BEAT.minSec, READ_BEAT.baseSec + READ_BEAT.perWordSec * words));
  return Math.round(sec * 1000);
}

/** Pose at the far end of a one-way direction, for this kind and amplitude. */
function targetPose(kind: WarmupFigureKind, dir: string, amp: number): Pose {
  switch (kind) {
    case "arm-raise":
      return dir === "down" ? { a: 0 } : { a: amp };
    case "eyes":
      if (dir === "up") return { a: 0, b: -amp };
      if (dir === "down") return { a: 0, b: amp };
      if (dir === "left") return { a: -amp, b: 0 };
      return { a: amp, b: 0 };
    case "trunk-forward-back":
      return dir === "back" ? { a: 0 } : { a: amp };
    case "head-rotate":
    case "trunk-side":
      return dir === "left" ? { a: -amp } : { a: amp };
  }
}

function legLabel(kind: WarmupFigureKind, from: Pose, to: Pose): SegmentLabel {
  if (isNeutral(to)) return kind === "arm-raise" ? "down" : "center";
  switch (kind) {
    case "arm-raise":
      return to.a > from.a ? "up" : "down";
    case "eyes":
      if ((to.b ?? 0) < 0) return "up";
      if ((to.b ?? 0) > 0) return "down";
      return to.a > 0 ? "right" : "left";
    case "trunk-forward-back":
      return to.a > from.a ? "forward" : "center";
    case "head-rotate":
    case "trunk-side":
      return to.a > from.a ? "right" : "left";
  }
}

const repsSpec = (kind: WarmupFigureKind): { cycleMs: number; wave: "upDown" | "sine" } => {
  switch (kind) {
    case "arm-raise":
      return { cycleMs: 2100, wave: "upDown" };
    case "trunk-forward-back":
      return { cycleMs: 1800, wave: "sine" };
    default:
      return { cycleMs: 2400, wave: "sine" };
  }
};

type Draft = Omit<Segment, "t0Ms">;

export function buildExerciseTimeline(ex: WarmupExercise, opts: { mode: TimelineMode }): ExerciseTimeline {
  const kind = ex.figureKind;
  const neutral = neutralPose(kind);
  const segs: Segment[] = [];
  const stepStart: number[] = [];
  const stepEnd: number[] = [];
  const stepFirstMove: number[] = [];
  let t = 0;
  const push = (d: Draft) => {
    segs.push({ ...d, t0Ms: t });
    t += d.durMs;
  };

  // ── Llega ────────────────────────────────────────────────────────────
  push({ kind: "arrive", stepIdx: -1, durMs: ARRIVE_PLAN.postureMs, from: neutral, to: neutral, ease: "none", label: "arrive", arrivePhase: "posture" });
  push({ kind: "arrive", stepIdx: -1, durMs: ARRIVE_PLAN.cycles * (ARRIVE_PLAN.inMs + ARRIVE_PLAN.outMs), from: neutral, to: neutral, ease: "none", label: "arrive", arrivePhase: "breath" });
  push({ kind: "arrive", stepIdx: -1, durMs: ARRIVE_PLAN.noticeMs, from: neutral, to: neutral, ease: "none", label: "arrive", arrivePhase: "notice" });
  const arriveMs = t;
  if (arriveMs !== WARMUP_ARRIVE_SEC * 1000) throw new Error("ARRIVE_PLAN must total WARMUP_ARRIVE_SEC");

  // ── Steps ────────────────────────────────────────────────────────────
  let cur: Pose = neutral;
  let prevMoved = false; // the previous segment was a movement → tic at this start
  const ticIf = (): "tic" | undefined => (prevMoved ? "tic" : undefined);

  ex.steps.forEach((step, i) => {
    const fig = step.figure;
    const amp = fig.amplitude === "small" ? SMALL_AMPLITUDE : 1;
    const fast = fig.variant === "fast-open";
    const dir = fig.direction ?? "rest";
    const holdMs = (fig.holdBeforeSec ?? 0) * 1000;
    const leadInMs = step.leadInSec != null ? step.leadInSec * 1000 : fast ? WARMUP_FAST_LEAD_IN_MS : 0;
    const stepMs = step.durationSec * 1000 - holdMs;
    stepStart.push(t);

    // Read beat (+ folded hold). When the amplitude SHRINKS between steps
    // ("muy poco recorrido" after a full extreme) a silent 3 s cross inside
    // the read beat brings the body to the small extreme first, so the small
    // leg is not a 1.18 travel (interim until Kim Q1b). A growing amplitude
    // just starts the leg from where the body is.
    let readMs = Math.max(readBeatMs(step), holdMs);
    const needsAmpCross = !isNeutral(cur) && !fast && kind !== "eyes" && amp < Math.abs(cur.a);
    if (needsAmpCross) readMs += AMPLITUDE_CROSS_MS;
    const plainRead = readMs - holdMs - (needsAmpCross ? AMPLITUDE_CROSS_MS : 0);
    if (plainRead > 0) {
      push({ kind: "read", stepIdx: i, durMs: plainRead, from: cur, to: cur, ease: "none", label: "upNext", cueAtStart: ticIf() });
      prevMoved = false;
    }
    if (needsAmpCross) {
      const to: Pose = { a: Math.sign(cur.a) * amp };
      push({ kind: "cross", stepIdx: i, durMs: AMPLITUDE_CROSS_MS, from: cur, to, ease: "softLinear", label: "upNext" });
      cur = to;
      prevMoved = false;
    }
    if (holdMs > 0) {
      push({ kind: "hold", stepIdx: i, durMs: holdMs, from: cur, to: cur, ease: "none", label: "hold", cueAtStart: ticIf(), chromeCue: "stop" });
      prevMoved = false;
    }
    stepFirstMove.push(t);

    if (fast) {
      const n = step.reps ?? (dir === "up-down" ? 1 : 2);
      const spec = repsSpec(kind);
      push({ kind: "lead-in", stepIdx: i, durMs: leadInMs, from: cur, to: cur, ease: "none", label: "fast", cueAtStart: "campana" });
      const repsMs = n * spec.cycleMs;
      push({ kind: "reps", stepIdx: i, durMs: repsMs, from: cur, to: cur, ease: "sine", label: "fast", reps: { n, cycleMs: spec.cycleMs, wave: spec.wave } });
      const stillMs = Math.max(0, stepMs - leadInMs - repsMs);
      if (stillMs > 0) push({ kind: "still", stepIdx: i, durMs: stillMs, from: cur, to: cur, ease: "none", label: "still", cueAtStart: "tic" });
      prevMoved = stillMs === 0;
    } else if (dir === "rest") {
      push({ kind: "rest", stepIdx: i, durMs: stepMs, from: cur, to: cur, ease: "none", label: "still", cueAtStart: ticIf() });
      prevMoved = false;
    } else if (dir === "center") {
      push({ kind: "cross", stepIdx: i, durMs: stepMs, from: cur, to: neutral, ease: "softLinear", label: kind === "arm-raise" ? "down" : "center", cueAtStart: "campana" });
      cur = neutral;
      prevMoved = true;
    } else {
      const roundTrip = dir.includes("-") || !!fig.returns;
      // Target of the OUT leg: for round trips the positive extreme (right /
      // forward / up), for one-way legs the named direction.
      const outDir = dir === "right-left" ? "right" : dir === "forward-back" ? "forward" : dir === "up-down" ? "up" : dir;
      const outTarget = targetPose(kind, outDir, amp);
      if (roundTrip) {
        const legOut = LEG_MS - leadInMs;
        const legBack = stepMs - LEG_MS - HOLD_MS - leadInMs;
        if (legBack <= 0) throw new Error(`round trip too short: ${step.id}`);
        const endsAtCentre = !!fig.returns || dir === "forward-back";
        const backTarget: Pose = endsAtCentre ? neutral : targetPose(kind, dir === "right-left" ? "left" : "down", amp);
        if (leadInMs > 0) push({ kind: "lead-in", stepIdx: i, durMs: leadInMs, from: cur, to: cur, ease: "none", label: "still", cueAtStart: "campana" });
        push({ kind: "out", stepIdx: i, durMs: legOut, from: cur, to: outTarget, ease: "softLinear", label: legLabel(kind, cur, outTarget), cueAtStart: leadInMs > 0 ? undefined : "campana" });
        push({ kind: "hold", stepIdx: i, durMs: HOLD_MS, from: outTarget, to: outTarget, ease: "none", label: "hold", cueAtStart: "tic", chromeCue: "stop" });
        if (leadInMs > 0) push({ kind: "lead-in", stepIdx: i, durMs: leadInMs, from: outTarget, to: outTarget, ease: "none", label: "still", cueAtStart: "campana" });
        push({ kind: "back", stepIdx: i, durMs: legBack, from: outTarget, to: backTarget, ease: "softLinear", label: legLabel(kind, outTarget, backTarget), cueAtStart: leadInMs > 0 ? undefined : "campana", chromeCue: endsAtCentre ? "return" : "otherSide" });
        cur = backTarget;
        prevMoved = true;
      } else {
        // One-way leg: 15 s out, then a hold for whatever is left.
        const legOut = Math.min(LEG_MS, stepMs) - leadInMs;
        if (leadInMs > 0) push({ kind: "lead-in", stepIdx: i, durMs: leadInMs, from: cur, to: cur, ease: "none", label: "still", cueAtStart: "campana" });
        push({ kind: "out", stepIdx: i, durMs: legOut, from: cur, to: outTarget, ease: "softLinear", label: legLabel(kind, cur, outTarget), cueAtStart: leadInMs > 0 ? undefined : "campana" });
        cur = outTarget;
        const rem = stepMs - LEG_MS;
        if (rem > 0) {
          push({ kind: "hold", stepIdx: i, durMs: rem, from: cur, to: cur, ease: "none", label: "hold", cueAtStart: "tic", chromeCue: "stop" });
          prevMoved = false;
        } else {
          prevMoved = true;
        }
      }
    }
    stepEnd.push(t);
  });

  // ── Cierre ───────────────────────────────────────────────────────────
  const closingAt = t;
  push({ kind: "closing", stepIdx: -1, durMs: WARMUP_CLOSING_HOLD_SEC * 1000, from: cur, to: cur, ease: "none", label: "closing", cueAtStart: "cuenco" });
  let bridgeAt: number | null = null;
  if (opts.mode === "session") {
    bridgeAt = t;
    push({ kind: "bridge", stepIdx: -1, durMs: WARMUP_BRIDGE_SEC * 1000, from: cur, to: cur, ease: "none", label: "bridge", cueAtStart: "doble" });
  }
  const totalMs = t;

  // ── Derived tables ───────────────────────────────────────────────────
  const cues: CuePoint[] = [];
  segs.forEach((s, idx) => {
    if (s.cueAtStart) cues.push({ atMs: s.t0Ms, kind: s.cueAtStart, segIdx: idx });
  });
  if (opts.mode !== "session") {
    const closingIdx = segs.findIndex((s) => s.kind === "closing");
    cues.push({ atMs: totalMs, kind: "doble", segIdx: closingIdx });
  }

  // Hum: from each step's first non-read segment (lead-in / leg / rest) to
  // its end, so the drone carries the whole movement and stops with the tic.
  const hums: HumWindow[] = ex.steps.map((_, i) => ({ fromMs: stepFirstMove[i], toMs: stepEnd[i], stepIdx: i }));

  const whispers: WhisperSlot[] = [];
  const doneObserveIdx: number[] = [];
  ex.observeAt.forEach((slot, observeIdx) => {
    if (!slot) return;
    if ("step" in slot) {
      const si = ex.steps.findIndex((s) => s.id === slot.step);
      if (si < 0) return;
      const from = stepFirstMove[si] + slot.atSec * 1000;
      whispers.push({ observeIdx, fromMs: from, untilMs: Math.min(from + WHISPER_MS, stepEnd[si]) });
    } else if (slot.slot === "closing") {
      const from = closingAt + (slot.atSec ?? 0) * 1000;
      whispers.push({ observeIdx, fromMs: from, untilMs: from + WHISPER_MS });
    } else {
      doneObserveIdx.push(observeIdx);
    }
  });
  whispers.sort((a, b) => a.fromMs - b.fromMs);

  const secondaryTexts: SecondaryText[] = [];
  ex.steps.forEach((step, i) => {
    if (step.readDuringPrevAtSec == null || i === 0) return;
    secondaryTexts.push({ stepIdx: i, fromMs: stepFirstMove[i - 1] + step.readDuringPrevAtSec * 1000, untilMs: stepStart[i] });
  });

  const breathHintStepIdx = (() => {
    const i = ex.steps.findIndex((s) => s.figure.variant !== "fast-open" && s.figure.direction !== "rest" && readBeatMs(s) > 0);
    return i >= 0 ? i : null;
  })();

  return {
    exerciseId: ex.id,
    kind,
    mode: opts.mode,
    totalMs,
    segments: segs,
    stepStart,
    stepEnd,
    arriveMs,
    closingAt,
    bridgeAt,
    cues,
    hums,
    whispers,
    secondaryTexts,
    breathHintStepIdx,
    doneObserveIdx,
  };
}

/** Index + progress (0..1) of the segment containing `tMs`. The last segment
 *  absorbs t ≥ totalMs; negative t maps to the first. */
export function segmentAt(tl: ExerciseTimeline, tMs: number): { i: number; u: number } {
  const segs = tl.segments;
  if (tMs <= 0) return { i: 0, u: 0 };
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0Ms <= tMs) lo = mid;
    else hi = mid - 1;
  }
  const s = segs[lo];
  const u = s.durMs > 0 ? Math.min(1, Math.max(0, (tMs - s.t0Ms) / s.durMs)) : 1;
  return { i: lo, u };
}

/** Pose of the moving part at `tMs`. */
export function poseAt(tl: ExerciseTimeline, tMs: number): Pose {
  const { i, u } = segmentAt(tl, tMs);
  return poseInSegment(tl.segments[i], tMs - tl.segments[i].t0Ms, u);
}

export function poseInSegment(s: Segment, localMs: number, u: number): Pose {
  switch (s.kind) {
    case "out":
    case "back":
    case "cross": {
      const e = softLinear(u, rampFracFor(s.durMs));
      return { a: s.from.a + (s.to.a - s.from.a) * e, b: (s.from.b ?? 0) + ((s.to.b ?? 0) - (s.from.b ?? 0)) * e };
    }
    case "reps": {
      if (!s.reps) return s.from;
      const v = s.reps.wave === "upDown" ? upDownWave(localMs, s.reps.cycleMs) : sineWave(localMs, s.reps.cycleMs);
      return { a: s.from.a + v, b: s.from.b };
    }
    default:
      return u >= 1 ? s.to : s.from;
  }
}

/** Step index for a time (−1 during arrive / closing / bridge). */
export function stepIndexAt(tl: ExerciseTimeline, tMs: number): number {
  return tl.segments[segmentAt(tl, tMs).i].stepIdx;
}

/** Whole seconds remaining in the current segment (for "Accesible"). */
export function segmentRemainingSec(tl: ExerciseTimeline, tMs: number): number {
  const { i } = segmentAt(tl, tMs);
  const s = tl.segments[i];
  return Math.max(0, Math.ceil((s.t0Ms + s.durMs - tMs) / 1000));
}

/** Segments of the step that contains segment `segIdx` (for the bar). For
 *  arrive / closing / bridge, just that segment. */
export function stepSegments(tl: ExerciseTimeline, segIdx: number): { first: number; segments: readonly Segment[] } {
  const s = tl.segments[segIdx];
  if (s.stepIdx < 0) {
    if (s.kind === "arrive") {
      const first = tl.segments.findIndex((x) => x.kind === "arrive");
      return { first, segments: tl.segments.filter((x) => x.kind === "arrive") };
    }
    return { first: segIdx, segments: [s] };
  }
  const first = tl.segments.findIndex((x) => x.stepIdx === s.stepIdx);
  return { first, segments: tl.segments.filter((x) => x.stepIdx === s.stepIdx) };
}

/** Duration the player will run (used by the synced run and the library). */
export function timelineTotalMs(ex: WarmupExercise, mode: TimelineMode = "library"): number {
  return buildExerciseTimeline(ex, { mode }).totalMs;
}

/** Short word sequence for the intro ("derecha · centro · izquierda · …"). */
export function sequenceMap(ex: WarmupExercise, locale: string, labels: Record<SegmentLabel, string>): string[] {
  const out: string[] = [];
  ex.steps.forEach((s) => {
    const dir = s.figure.direction ?? "rest";
    const fast = s.figure.variant === "fast-open";
    let key: SegmentLabel;
    if (fast) key = "fast";
    else if (dir === "rest") key = "still";
    else if (dir === "center") key = ex.figureKind === "arm-raise" ? "down" : "center";
    else if (dir === "up" || dir === "up-down") key = "up";
    else if (dir === "down") key = "down";
    else if (dir === "left") key = "left";
    else if (dir === "forward" || dir === "forward-back") key = "forward";
    else key = "right";
    const label = labels[key];
    if (out[out.length - 1] !== label) out.push(label);
  });
  void locale;
  return out;
}

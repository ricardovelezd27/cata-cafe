// Views of a warm-up timeline for golden comparisons that do NOT depend on
// how long the recorded voice takes to say a line.
//
// The pause before each step is sized from the recording of its instruction
// (lib/warmup/timeline.ts readBeatMs; the rule is pinned in
// tests/warmup-voice.test.ts). A re-render of the voice can move a pause by a
// quarter second, which moves every absolute time after it. So the fixtures
// here show a pause as "beat" and name a moment by the segment it falls in
// plus the offset into it ("s2:out+5000"), instead of by its millisecond.

import { segmentAt } from "@/lib/warmup/timeline";
import type { ExerciseTimeline, Segment } from "@/lib/warmup/timelineTypes";

export type ShapeRow = [kind: Segment["kind"], dur: number | "beat", from: number, to: number, label: string, cue: string | null];

/** Segments without absolute times; a read beat's length shows as "beat". */
export function shape(tl: ExerciseTimeline, fromIdx = 0, count = Infinity): ShapeRow[] {
  return tl.segments
    .slice(fromIdx, fromIdx + count)
    .map((s) => [s.kind, s.kind === "read" ? "beat" : s.durMs, s.from.a, s.to.a, s.label, s.cueAtStart ?? null]);
}

/** Name of a segment: "posture" / "breath" / "notice", "closing", "bridge",
 *  or "s<step number>:<kind>" (with "#2" for the second such segment of the
 *  step: a round trip has two lead-ins). */
export function segName(tl: ExerciseTimeline, i: number): string {
  const s = tl.segments[i];
  if (s.kind === "arrive") return s.arrivePhase ?? "arrive";
  if (s.stepIdx < 0) return s.kind;
  const nth = tl.segments.slice(0, i).filter((x) => x.stepIdx === s.stepIdx && x.kind === s.kind).length;
  return `s${s.stepIdx + 1}:${s.kind}${nth > 0 ? `#${nth + 1}` : ""}`;
}

/** A moment of the run as "<segment>+<ms into it>" ("end" at totalMs). */
export function at(tl: ExerciseTimeline, ms: number): string {
  if (ms >= tl.totalMs) return "end";
  const { i } = segmentAt(tl, ms);
  return `${segName(tl, i)}+${ms - tl.segments[i].t0Ms}`;
}

/** The first segment of that kind in a step (1-based step number). */
export function seg(tl: ExerciseTimeline, step: number, kind: Segment["kind"]): Segment {
  const s = tl.segments.find((x) => x.stepIdx === step - 1 && x.kind === kind);
  if (!s) throw new Error(`no ${kind} in step ${step}`);
  return s;
}

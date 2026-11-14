// Which lines the voice says in a run, and every line it can ever say.
// Pure (no React, no DOM): the player schedules from `runSpeech`, the render
// script records `allSpokenLines`, the tests check both.

import { WARMUP_EXERCISES, type WarmupExercise } from "./exercises";
import { spokenLine, type ScriptContext, type SpokenChrome } from "./script";
import { buildExerciseTimeline, exerciseForLength } from "./timeline";
import type { ExerciseTimeline, NarrationPoint, TimelineLength, TimelineMode } from "./timelineTypes";
import { spokenMs, voiceClip, type VoiceClip } from "./voice";

export interface SpokenPoint {
  /** When the voice starts, ms from the start of the run. */
  readonly atMs: number;
  readonly text: string;
  /** Measured length of the recording, or the estimate when there is none. */
  readonly durMs: number;
  /** The recorded file, when the line has one. */
  readonly clip: VoiceClip | null;
  readonly point: NarrationPoint;
}

/** Everything the voice says in this run, in time order (silent points are
 *  dropped). */
export function runSpeech(tl: ExerciseTimeline, ctx: ScriptContext): SpokenPoint[] {
  const out: SpokenPoint[] = [];
  for (const point of tl.narrations) {
    const text = spokenLine(point.source, ctx);
    if (!text) continue;
    out.push({ atMs: point.sayAtMs, text, durMs: spokenMs(text, ctx.locale), clip: voiceClip(text, ctx.locale), point });
  }
  return out;
}

export interface RunVariant {
  readonly exercise: WarmupExercise;
  readonly mode: TimelineMode;
  readonly length: TimelineLength;
  readonly seated: boolean;
}

/** Every way an exercise can be played that changes what is said or when.
 *  ("Poco espacio" changes neither.) */
export function runVariants(): RunVariant[] {
  const out: RunVariant[] = [];
  for (const exercise of WARMUP_EXERCISES) {
    for (const mode of ["library", "session"] as const) {
      for (const length of ["full", "short"] as const) {
        for (const seated of exercise.seated ? [false, true] : [false]) out.push({ exercise, mode, length, seated });
      }
    }
  }
  return out;
}

/** The timeline and the spoken points of one variant. */
export function variantSpeech(v: RunVariant, locale: string, chrome: SpokenChrome): { tl: ExerciseTimeline; speech: SpokenPoint[] } {
  const tl = buildExerciseTimeline(v.exercise, { mode: v.mode, length: v.length });
  const exercise = exerciseForLength(v.exercise, v.length);
  return { tl, speech: runSpeech(tl, { exercise, locale, chrome, seated: v.seated }) };
}

/** Every distinct line the voice can say in that language (sorted, so the
 *  render job is stable). */
export function allSpokenLines(locale: string, chrome: SpokenChrome): string[] {
  const lines = new Set<string>();
  for (const v of runVariants()) for (const s of variantSpeech(v, locale, chrome).speech) lines.add(s.text);
  return [...lines].sort();
}

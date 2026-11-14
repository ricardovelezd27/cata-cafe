// Which recorded lines one stretch of running time plays, and from where.
// Pure (no React, no DOM): hooks/useWarmupAudio.ts starts a buffer for each
// result; tests/warmup-voiceSchedule.test.ts pins the rules.
//
// The recorded voice is scheduled on the audio clock exactly like the bells:
// every line has a known start and a measured length, so nothing "queues" and
// nothing "interrupts". What needs a rule is where a stretch begins and ends:
//
//  - a stretch that begins in the MIDDLE of a line (the person paused inside
//    an instruction and resumed, a follower joined a group run late) picks the
//    line up where it is, unless too little of it is left to make sense;
//  - a line that starts ON the point where the clock stops by itself (a
//    "Quieto" step end) belongs to the next stretch;
//  - after such a stop, the lines that were already speaking finished into
//    the stop ("ring out", lib/warmup/audioWindow.ts): the next stretch must
//    not say them again.

import type { ScheduleWindow } from "./audioWindow";

/** A recorded line on the run's timeline. */
export interface ClipPoint {
  readonly atMs: number;
  readonly durMs: number;
  readonly url: string;
}

/** One buffer to start: at `atMs` on the run's timeline, `offsetMs` into the file. */
export interface DueClip {
  readonly url: string;
  readonly atMs: number;
  readonly offsetMs: number;
}

/** A line with less than this left is not picked up mid-way: half a word
 *  helps nobody. */
export const CLIP_RESUME_MIN_MS = 700;
/** A line that should have started this recently still starts from its
 *  beginning, now: losing the first syllable ("-ies en el suelo") is worse
 *  than being a moment late. It covers the scheduler running a few ms after
 *  the clock, and the recordings finishing to load just after "Empezar". */
export const CLIP_LATE_MS = 400;
/** Fade-in of a line picked up mid-way, so it does not start on a click. */
export const CLIP_PICKUP_FADE_MS = 60;

export function dueClips(clips: readonly ClipPoint[], elapsedMs: number, w: ScheduleWindow = {}): DueClip[] {
  const until = w.untilMs ?? Number.POSITIVE_INFINITY;
  const out: DueClip[] = [];
  for (const c of clips) {
    if (c.atMs >= until) continue; // starts on (or after) the stop: next stretch
    if (w.afterMs !== undefined && c.atMs < w.afterMs) continue; // rang out into the stop
    const end = c.atMs + c.durMs;
    if (c.atMs >= elapsedMs - CLIP_LATE_MS) {
      out.push({ url: c.url, atMs: Math.max(c.atMs, elapsedMs), offsetMs: 0 });
    } else if (end - elapsedMs >= CLIP_RESUME_MIN_MS) {
      out.push({ url: c.url, atMs: elapsedMs, offsetMs: elapsedMs - c.atMs });
    }
  }
  return out;
}

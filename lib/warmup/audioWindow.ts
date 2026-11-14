// Pure rules for WHAT the warm-up audio scheduler may put on the audio clock
// for one stretch of running time, and for when a stop lets the sound finish.
// No React, no DOM (hooks/useWarmupAudio.ts and the player consume it).
//
// Two things used to go wrong:
//  - every stop faded the bus at once, so the sound that MARKS the stop was
//    cut by it: the "doble" at the end of a run (scheduled exactly at
//    `totalMs`) was never heard in full, and neither was the tic at a step
//    end in "Quieto" mode;
//  - the whole rest of the run was scheduled ahead, so letting the bus live
//    past a stop would have played the next step's sounds over a paused run.
// So a stretch is scheduled only up to the point where the clock will stop by
// itself (`untilMs`), and only a stop the PERSON asked for (pause, seek,
// exit) cancels what is sounding.

import type { RunClockEvent } from "./runClock";
import type { CuePoint, HumWindow } from "./timelineTypes";

/** A cue up to this late still plays (the schedule runs a few ms after the clock). */
export const CUE_LATE_MS = 50;
/** A resume this soon after the place the clock stopped by itself is "the same place". */
export const RESUME_AFTER_STOP_MS = 50;

export interface ScheduleWindow {
  /** Nothing AFTER this ms is scheduled (the clock stops there by itself: the
   *  end of the run, or the step end in "Quieto" mode). A cue exactly on it
   *  plays: it is the sound of that stop. Default: no limit. */
  readonly untilMs?: number;
  /** Resuming from a stop that already rang out at this ms: cues at or
   *  before it were heard, so only later ones are scheduled. */
  readonly afterMs?: number;
}

/** The cues to schedule for a stretch that starts at `elapsedMs`. */
export function dueCues(cues: readonly CuePoint[], elapsedMs: number, w: ScheduleWindow = {}): CuePoint[] {
  const until = w.untilMs ?? Number.POSITIVE_INFINITY;
  const afterMs = w.afterMs;
  return cues.filter((c) => (afterMs !== undefined ? c.atMs > afterMs : c.atMs >= elapsedMs - CUE_LATE_MS) && c.atMs <= until);
}

/** The hum windows to schedule, cut at `untilMs` (a window that would start
 *  at or after it is dropped; one that has already ended too). */
export function dueHums(hums: readonly HumWindow[], elapsedMs: number, w: ScheduleWindow = {}): HumWindow[] {
  const until = w.untilMs ?? Number.POSITIVE_INFINITY;
  const out: HumWindow[] = [];
  for (const h of hums) {
    if (h.toMs <= elapsedMs || h.fromMs >= until) continue;
    out.push(h.toMs > until ? { ...h, toMs: until } : h);
  }
  return out;
}

/** The clock stopped by itself ("stop" = the Quieto step end, "done" = the end
 *  of the run): what is sounding finishes. Any other reason (the person
 *  paused or jumped, the tab was hidden, nothing happened yet) cancels it. */
export function ringsOut(lastEvent: RunClockEvent | null): boolean {
  return lastEvent === "stop" || lastEvent === "done";
}

/** `afterMs` for a schedule that starts at `elapsedMs`: the stop position when
 *  the run resumes right where it rang out, otherwise undefined. */
export function resumeAfterStop(stoppedAtMs: number | null, elapsedMs: number): number | undefined {
  if (stoppedAtMs === null) return undefined;
  const d = elapsedMs - stoppedAtMs;
  return d >= 0 && d < RESUME_AFTER_STOP_MS ? stoppedAtMs : undefined;
}

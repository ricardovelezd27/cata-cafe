// Pure state machine behind hooks/useRunClock.ts. Time is injected (`now`)
// so vitest can drive it; the hook supplies performance.now().
//
// One clock per exercise RUN: elapsed ms over the whole timeline, with
// pause / resume / seek, an optional `stopAt` (the "Quieto, solo atiende"
// mode auto-pauses exactly at a step end) and a `runId` that increments on
// every play / seek / resume so cue de-dup keys and audio schedules restart.

export interface RunClockState {
  readonly totalMs: number;
  /** ms accumulated while not running. */
  readonly accMs: number;
  /** `now` when the current run started, null while not running. */
  readonly runFrom: number | null;
  readonly userPaused: boolean;
  readonly hiddenPaused: boolean;
  readonly stopAt: number | null;
  readonly done: boolean;
  readonly runId: number;
}

export type RunClockEvent = "play" | "pause" | "seek" | "stop" | "done";

export function initialRunClock(totalMs: number, autoStart: boolean, now: number): RunClockState {
  return {
    totalMs,
    accMs: 0,
    runFrom: autoStart ? now : null,
    userPaused: !autoStart,
    hiddenPaused: false,
    stopAt: null,
    done: totalMs <= 0,
    runId: 1,
  };
}

export function isRunning(s: RunClockState): boolean {
  return s.runFrom !== null;
}

export function elapsedMs(s: RunClockState, now: number): number {
  const raw = s.accMs + (s.runFrom !== null ? Math.max(0, now - s.runFrom) : 0);
  const cap = s.stopAt !== null ? Math.min(s.totalMs, s.stopAt) : s.totalMs;
  return Math.min(cap, Math.max(0, raw));
}

/** ms until the clock must stop by itself (stopAt or total), or null. */
export function msUntilStop(s: RunClockState, now: number): number | null {
  if (s.runFrom === null) return null;
  const target = s.stopAt !== null ? Math.min(s.totalMs, s.stopAt) : s.totalMs;
  return Math.max(0, target - elapsedMs(s, now));
}

function freeze(s: RunClockState, now: number): RunClockState {
  if (s.runFrom === null) return s;
  return { ...s, accMs: elapsedMs({ ...s, stopAt: null }, now), runFrom: null };
}

function resumeIfAllowed(s: RunClockState, now: number): RunClockState {
  if (s.userPaused || s.hiddenPaused || s.done) return s;
  if (s.runFrom !== null) return s;
  return { ...s, runFrom: now, runId: s.runId + 1 };
}

export function play(s: RunClockState, now: number): RunClockState {
  if (s.done) return s;
  if (!s.userPaused && s.runFrom !== null) return s;
  return resumeIfAllowed(s.userPaused ? { ...s, userPaused: false } : s, now);
}

export function pause(s: RunClockState, now: number): RunClockState {
  if (s.userPaused && s.runFrom === null) return s;
  return { ...freeze(s, now), userPaused: true };
}

export function toggle(s: RunClockState, now: number): RunClockState {
  return s.userPaused ? play(s, now) : pause(s, now);
}

export function setHidden(s: RunClockState, hidden: boolean, now: number): RunClockState {
  if (s.hiddenPaused === hidden) return s;
  const frozen = freeze(s, now);
  const next = { ...frozen, hiddenPaused: hidden };
  return hidden ? next : resumeIfAllowed(next, now);
}

/** Jump to `ms`; `playAfter` (default: keep the current running state). */
export function seek(s: RunClockState, ms: number, now: number, playAfter?: boolean): RunClockState {
  const target = Math.min(s.totalMs, Math.max(0, ms));
  const wasRunning = s.runFrom !== null || (!s.userPaused && !s.hiddenPaused && !s.done);
  const base: RunClockState = {
    ...s,
    accMs: target,
    runFrom: null,
    done: false,
    runId: s.runId + 1,
    stopAt: s.stopAt !== null && s.stopAt <= target ? null : s.stopAt,
  };
  const shouldPlay = playAfter ?? wasRunning;
  if (!shouldPlay) return { ...base, userPaused: true };
  return { ...base, userPaused: false, runFrom: s.hiddenPaused ? null : now, runId: base.runId };
}

export function setStopAt(s: RunClockState, stopAt: number | null): RunClockState {
  if (s.stopAt === stopAt) return s;
  return { ...s, stopAt };
}

/** Called by the hook's wall-clock timer: settles "reached stopAt" / "done". */
export function tick(s: RunClockState, now: number): { state: RunClockState; event: RunClockEvent | null } {
  if (s.runFrom === null) return { state: s, event: null };
  const e = elapsedMs(s, now);
  if (e >= s.totalMs) {
    return { state: { ...s, accMs: s.totalMs, runFrom: null, done: true, userPaused: true }, event: "done" };
  }
  if (s.stopAt !== null && e >= s.stopAt) {
    return { state: { ...s, accMs: s.stopAt, runFrom: null, userPaused: true, stopAt: null }, event: "stop" };
  }
  return { state: s, event: null };
}

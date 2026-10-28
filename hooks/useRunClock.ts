"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  elapsedMs as elapsedOf,
  initialRunClock,
  isRunning,
  msUntilStop,
  pause as pauseFn,
  play as playFn,
  seek as seekFn,
  setHidden as setHiddenFn,
  setStopAt as setStopAtFn,
  tick as tickFn,
  toggle as toggleFn,
  type RunClockEvent,
  type RunClockState,
} from "@/lib/warmup/runClock";

/**
 * The single clock of a warm-up run (replaces useCountdown). State lives in
 * one reducer-like snapshot; `elapsedMs()` is NON-reactive (read it in the
 * rAF loop / handlers), the booleans are reactive. A wall-clock timeout
 * settles `stopAt` / `done` even when rAF is throttled or the tab hidden.
 */
export interface RunClock {
  elapsedMs: () => number;
  running: boolean;
  userPaused: boolean;
  hiddenPaused: boolean;
  done: boolean;
  /** Increments on every play / seek / resume — cue keys + audio reschedule. */
  runId: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number, opts?: { play?: boolean }) => void;
  /** "Quieto": auto-pause exactly at `ms` (null clears). */
  setStopAt: (ms: number | null) => void;
  subscribe: (fn: (e: RunClockEvent) => void) => () => void;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function useRunClock(
  totalMs: number,
  opts: { resetKey: string; autoStart?: boolean; pauseOnHide?: boolean; onDone?: () => void },
): RunClock {
  const { resetKey, autoStart = true, pauseOnHide = true, onDone } = opts;
  const [snap, setSnap] = useState<{ key: string; s: RunClockState }>(() => ({
    key: resetKey,
    s: initialRunClock(totalMs, autoStart, now()),
  }));
  if (snap.key !== resetKey) setSnap({ key: resetKey, s: initialRunClock(totalMs, autoStart, now()) });
  const state = snap.key === resetKey ? snap.s : initialRunClock(totalMs, autoStart, now());

  // Latest state for the non-reactive readers (elapsedMs, toggle, the timer).
  // Synced in a layout effect so a seek is visible to the player's own
  // layout paint in the same commit.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const listeners = useRef(new Set<(e: RunClockEvent) => void>());
  const emit = useCallback((e: RunClockEvent) => listeners.current.forEach((fn) => fn(e)), []);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const update = useCallback(
    (fn: (s: RunClockState) => RunClockState, event?: RunClockEvent) => {
      setSnap((prev) => {
        const next = fn(prev.s);
        if (next === prev.s) return prev;
        return { key: prev.key, s: next };
      });
      if (event) emit(event);
    },
    [emit],
  );

  // Wall-clock settlement of stopAt / total.
  useEffect(() => {
    if (!isRunning(state)) return;
    const wait = msUntilStop(state, now());
    if (wait === null) return;
    const timer = setTimeout(() => {
      const { state: next, event } = tickFn(stateRef.current, now());
      if (next !== stateRef.current) {
        setSnap((prev) => ({ key: prev.key, s: next }));
        if (event) {
          emit(event);
          if (event === "done") onDoneRef.current?.();
        }
      }
    }, wait + 2);
    return () => clearTimeout(timer);
  }, [state, emit]);

  // Hidden tab → pause (solo/library). Synced runs pass pauseOnHide: false.
  useEffect(() => {
    if (!pauseOnHide || typeof document === "undefined") return;
    const onVis = () => update((s) => setHiddenFn(s, document.visibilityState === "hidden", now()));
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pauseOnHide, update]);

  const elapsedMs = useCallback(() => elapsedOf(stateRef.current, now()), []);
  const play = useCallback(() => update((s) => playFn(s, now()), "play"), [update]);
  const pause = useCallback(() => update((s) => pauseFn(s, now()), "pause"), [update]);
  const toggle = useCallback(() => {
    const paused = stateRef.current.userPaused;
    update((s) => toggleFn(s, now()), paused ? "play" : "pause");
  }, [update]);
  const seek = useCallback(
    (ms: number, o?: { play?: boolean }) => update((s) => seekFn(s, ms, now(), o?.play), "seek"),
    [update],
  );
  const setStopAt = useCallback((ms: number | null) => update((s) => setStopAtFn(s, ms)), [update]);
  const subscribe = useCallback((fn: (e: RunClockEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return useMemo(
    () => ({
      elapsedMs,
      running: isRunning(state),
      userPaused: state.userPaused,
      hiddenPaused: state.hiddenPaused,
      done: state.done,
      runId: state.runId,
      play,
      pause,
      toggle,
      seek,
      setStopAt,
      subscribe,
    }),
    [elapsedMs, state, play, pause, toggle, seek, setStopAt, subscribe],
  );
}

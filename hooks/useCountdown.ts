"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wall-clock countdown for the warm-up player.
 *
 * - Time is measured with Date.now() deltas (not by counting ticks), so it
 *   stays accurate under throttled rAF / long frames; a wall-clock timeout
 *   fires completion on time even when rAF is paused for an occluded window.
 * - Re-renders only when the displayed whole second changes — the figure
 *   beside it is memoised and never re-renders per tick.
 * - Pauses itself while the tab is hidden (visibilitychange) and resumes
 *   when it comes back, unless the user had paused it.
 * - `resetKey` restarts the countdown (the player passes the phase key).
 */
export interface Countdown {
  /** Whole seconds left (ceil). */
  remainingSec: number;
  /** True while nothing is counting (user pause OR hidden tab). */
  paused: boolean;
  /** True only when the USER paused. */
  userPaused: boolean;
  /** True once the countdown hit zero for the current key. */
  done: boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  /** Milliseconds elapsed right now (not reactive — read in handlers). */
  elapsedMs: () => number;
}

export function useCountdown(
  durationSec: number,
  opts: {
    /** Changing it restarts the countdown. */
    resetKey: string;
    /** Start counting immediately (false = wait for resume()). */
    autoStart?: boolean;
    onComplete?: () => void;
    /** Whether to pause when the document is hidden (default true). */
    pauseOnHide?: boolean;
  },
): Countdown {
  const { resetKey, autoStart = true, onComplete, pauseOnHide = true } = opts;
  const durationMs = Math.max(0, durationSec) * 1000;

  // All per-key state lives in one snapshot tagged with its key, so a new
  // resetKey resets it during render (React's "adjust state on prop change"
  // pattern) instead of inside an effect.
  type Snap = { key: string; remainingSec: number; userPaused: boolean; hiddenPaused: boolean; done: boolean };
  const fresh = (): Snap => ({
    key: resetKey,
    remainingSec: Math.ceil(durationMs / 1000),
    userPaused: !autoStart,
    hiddenPaused: false,
    done: durationMs === 0,
  });
  const [snap, setSnap] = useState<Snap>(fresh);
  if (snap.key !== resetKey) setSnap(fresh());
  const current = snap.key === resetKey ? snap : fresh();
  const { remainingSec, userPaused, hiddenPaused, done } = current;
  const paused = userPaused || hiddenPaused;

  // Timing refs — only touched inside effects / handlers, never in render.
  // Accumulated time is tagged with its key so a new key starts from zero.
  const accumulatedRef = useRef<{ key: string; ms: number }>({ key: resetKey, ms: 0 });
  const runStartRef = useRef<number | null>(null); // Date.now() of the current run
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // The run loop: one effect owns rAF + timeout for as long as it is active.
  useEffect(() => {
    if (paused || done || durationMs <= 0) return;
    const base = accumulatedRef.current.key === resetKey ? accumulatedRef.current.ms : 0;
    const startedAt = Date.now();
    runStartRef.current = startedAt;
    let raf: number | null = null;
    let finished = false;

    const tick = () => {
      if (finished) return;
      const remaining = Math.max(0, durationMs - (base + Date.now() - startedAt));
      const sec = Math.ceil(remaining / 1000);
      if (remaining <= 0) {
        finished = true;
        accumulatedRef.current = { key: resetKey, ms: durationMs };
        runStartRef.current = null;
        setSnap((s) => (s.key === resetKey ? { ...s, remainingSec: 0, done: true } : s));
        onCompleteRef.current?.();
        return;
      }
      setSnap((s) => (s.key === resetKey && s.remainingSec !== sec ? { ...s, remainingSec: sec } : s));
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const timeout = setTimeout(tick, Math.max(0, durationMs - base) + 2);
    // rAF stops while the window is occluded (document still "visible");
    // a coarse interval keeps the displayed second honest in that case.
    const interval = setInterval(tick, 250);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      clearTimeout(timeout);
      clearInterval(interval);
      if (!finished) {
        accumulatedRef.current = { key: resetKey, ms: base + Date.now() - startedAt };
        runStartRef.current = null;
      }
    };
  }, [paused, done, durationMs, resetKey]);

  // Tab hidden → pause; visible again → resume (unless user-paused).
  useEffect(() => {
    if (!pauseOnHide || typeof document === "undefined") return;
    const onVis = () => {
      const hidden = document.visibilityState === "hidden";
      setSnap((s) => (s.hiddenPaused === hidden ? s : { ...s, hiddenPaused: hidden }));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pauseOnHide]);

  const elapsedMs = useCallback(() => {
    const running = runStartRef.current !== null ? Date.now() - runStartRef.current : 0;
    const acc = accumulatedRef.current.key === resetKey ? accumulatedRef.current.ms : 0;
    return acc + running;
  }, [resetKey]);
  const pause = useCallback(() => setSnap((s) => ({ ...s, userPaused: true })), []);
  const resume = useCallback(() => setSnap((s) => ({ ...s, userPaused: false })), []);
  const toggle = useCallback(() => setSnap((s) => ({ ...s, userPaused: !s.userPaused })), []);

  return { remainingSec, paused, userPaused, done, pause, resume, toggle, elapsedMs };
}

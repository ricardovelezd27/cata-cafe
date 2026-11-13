"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  canAdvancePass,
  formatTimer,
  parseTimerStart,
  timerCue,
  timerStorageKey,
  type TimerCue,
} from "@/lib/cuppingTimer";

// The optional cupping timer (S10 WP3b, Kim A5, TODO(kim-validar:A5)): off by default,
// started by the cupper when the water is poured, text cues only, no sound, no server
// call. The start timestamp lives in localStorage (lib/cuppingTimer.ts), so a reload
// keeps it. It is docked in the cup page's top bar, never over the form's controls.

export type TimerCopy = {
  title: string;
  show: string;
  hide: string;
  start: string;
  reset: string;
  nextPass: string;
  cueWait: string;
  cueBreak: string;
  cuePass1: string;
  cuePass2: string;
  cuePass3: string;
  hint: string;
};

/** Used only when the cup error boundary rehydrates an older cached prop blob without
 *  `timer` (same idea as MARKET_COPY_FALLBACK). tests/partialCopy.test.ts keeps it equal
 *  to the message files. */
export const TIMER_COPY_FALLBACK: Record<"es" | "en", TimerCopy> = {
  es: {
    title: "Temporizador",
    show: "Temporizador",
    hide: "Ocultar",
    start: "Empezar",
    reset: "Reiniciar",
    nextPass: "Siguiente pasada",
    cueWait: "Deja reposar",
    cueBreak: "Rompe la costra",
    cuePass1: "Primera pasada (entre 8 y 10 min)",
    cuePass2: "Segunda pasada",
    cuePass3: "Tercera pasada",
    hint: "Opcional. Empieza cuando viertas el agua.",
  },
  en: {
    title: "Timer",
    show: "Timer",
    hide: "Hide",
    start: "Start",
    reset: "Reset",
    nextPass: "Next pass",
    cueWait: "Let it rest",
    cueBreak: "Break the crust",
    cuePass1: "First pass (between 8 and 10 min)",
    cuePass2: "Second pass",
    cuePass3: "Third pass",
    hint: "Optional. Start it when you pour the water.",
  },
};

const CUE_KEY: Record<TimerCue, keyof TimerCopy> = {
  wait: "cueWait",
  break: "cueBreak",
  pass1: "cuePass1",
  pass2: "cuePass2",
  pass3: "cuePass3",
};

const EVENT = "cata:timer";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const BTN =
  "inline-flex min-h-[44px] items-center rounded-input px-3 font-sans text-sm text-on-surface-variant underline underline-offset-2 hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2";

export function CuppingTimer({
  sessionId,
  userId,
  copy,
}: {
  sessionId: string;
  userId: string;
  copy: TimerCopy;
}) {
  const key = timerStorageKey(sessionId, userId);
  // Private mode / blocked storage can throw: the timer then simply never starts.
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [extraPasses, setExtraPasses] = useState(0);

  const start = now !== null ? parseTimerStart(raw, now) : null;
  const running = start !== null;

  // ONE clock: a 1 s interval that only re-reads the time; elapsed is always now - start.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const write = (value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: nothing to persist */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  if (!running) {
    return (
      <div className="px-4 lg:px-6" data-testid="cupping-timer">
        {!open ? (
          <button type="button" className={BTN} onClick={() => setOpen(true)} aria-expanded={false}>
            {copy.show}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="font-sans text-sm text-on-surface-variant">{copy.hint}</span>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center rounded-pill border border-outline-variant px-4 font-sans text-sm font-semibold text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => {
                setExtraPasses(0);
                write(String(Date.now()));
              }}
            >
              {copy.start}
            </button>
            <button type="button" className={BTN} onClick={() => setOpen(false)}>
              {copy.hide}
            </button>
          </div>
        )}
      </div>
    );
  }

  const elapsed = Math.max(0, (now ?? start) - start);
  const cue = timerCue(elapsed, extraPasses);

  return (
    <div className="flex flex-wrap items-center gap-x-3 px-4 lg:px-6" data-testid="cupping-timer">
      <span className="font-mono text-lg font-semibold tabular-nums text-on-surface" role="timer" aria-label={copy.title}>
        {formatTimer(elapsed)}
      </span>
      <span className="font-sans text-sm font-medium text-on-surface" aria-live="polite">
        {copy[CUE_KEY[cue]]}
      </span>
      {canAdvancePass(elapsed, extraPasses) && (
        <button type="button" className={BTN} onClick={() => setExtraPasses((n) => Math.min(2, n + 1))}>
          {copy.nextPass}
        </button>
      )}
      <button
        type="button"
        className={BTN}
        onClick={() => {
          setExtraPasses(0);
          setOpen(false);
          write(null);
        }}
      >
        {copy.reset}
      </button>
    </div>
  );
}

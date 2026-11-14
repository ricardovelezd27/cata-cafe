"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocalFlag } from "@/hooks/useLocalFlag";
import type { AudioCtxState } from "@/lib/warmup/audioResume";
import { dueCues, dueHums, type ScheduleWindow } from "@/lib/warmup/audioWindow";
import { VIBRATION, cueDurationMs, renderCue, renderHum } from "@/lib/warmup/sounds";
import type { CueKind, CuePoint, HumWindow } from "@/lib/warmup/timelineTypes";

/**
 * Sound channel of the warm-up player (v3). Eyes are closed for half the
 * exercise, so the phone has to guide without the screen:
 *
 *  - four synthesised cues (lib/warmup/sounds.ts), scheduled ahead of time on
 *    the Web Audio clock so they land on the beat even if the main thread
 *    stalls. The player calls `schedule()` on start/resume/seek and
 *    `cancel()` on pause;
 *  - haptics (navigator.vibrate) on the same beats. They also play while the
 *    sound is muted (silently absent on iOS);
 *  - an optional read-aloud of the step text via speechSynthesis;
 *  - mute + voice toggles persisted in localStorage (`cata_warmup_sound`,
 *    `cata_warmup_voice`, "on"/"off"). A host can also set the sound for ONE
 *    run without touching the person's stored choice (`persist: false`: a
 *    follower of a group run starts muted, the master's phone sounds).
 *
 * One AudioContext per page (module singleton), created lazily inside
 * `unlock()` / `unlockWarmupAudio()` (which must be called synchronously
 * inside a user gesture) or the first `schedule()`. Never closed; suspended
 * when the last consumer unmounts.
 */
export const WARMUP_SOUND_KEY = "cata_warmup_sound";
export const WARMUP_VOICE_KEY = "cata_warmup_voice";

const FLAG_STRINGS = { on: "on", off: "off" };
const SPEECH_RATE = 0.88;

export interface WarmupAudio {
  muted: boolean;
  /** `persist: false` sets the sound for this run only (a host default); the
   *  default is the person's own choice, stored for every later run. */
  setMuted(m: boolean, opts?: { persist?: boolean }): void;
  /** speechSynthesis read-aloud (default off). */
  voice: boolean;
  setVoice(v: boolean): void;
  /** speechSynthesis exists AND lists a voice for the locale's language. */
  voiceAvailable: boolean;
  /** Call synchronously inside a user gesture. */
  unlock(): void;
  /** cancel(), then schedule the cues and hum windows that are due inside
   *  `window` (lib/warmup/audioWindow.ts: nothing past the point where the
   *  clock stops by itself; lib/warmup/sounds.ts renderHum). */
  schedule(cues: readonly CuePoint[], elapsedMs: number, hums?: readonly HumWindow[], window?: ScheduleWindow): void;
  cancel(): void;
  /** Immediate single cue (intro "Escucha" demo). */
  playDemo(kind: CueKind): void;
  vibrate(pattern: number | number[]): void;
  /** Resolves on end / error / cancel (and on a length-based safety timeout).
   *  `interrupt` (default true) cuts whatever is still being read; false
   *  queues the line behind it (short leg / hold cues). */
  speak(text: string, locale: string, opts?: { interrupt?: boolean }): Promise<void>;
  cancelSpeech(): void;
  /** iOS "interrupted" context (call, Siri, other audio app) — treat as a pause. */
  interrupted: boolean;
  /** Try to resume the existing context (never creates one); resolves with
   *  its state once it settled or after `waitMs` (iOS may never settle the
   *  promise outside a gesture). "none" when no context exists yet. */
  checkContext(waitMs?: number): Promise<AudioCtxState>;
}

// ── AudioContext singleton ─────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let consumers = 0;
const ctxListeners = new Set<() => void>();
const notifyCtx = () => ctxListeners.forEach((l) => l());

function getCtx(create: boolean): AudioContext | null {
  if (ctx || !create || typeof window === "undefined") return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    ctx.addEventListener("statechange", notifyCtx);
    notifyCtx();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** "interrupted" is iOS-only and missing from the DOM typings. */
const isInterrupted = () => (ctx?.state as string | undefined) === "interrupted";

function subscribeCtx(cb: () => void) {
  ctxListeners.add(cb);
  return () => {
    ctxListeners.delete(cb);
  };
}

function resumeIfNeeded(c: AudioContext) {
  if (c.state !== "running" && c.state !== "closed") void c.resume().catch(() => {});
}

function vibrateNow(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* haptics unavailable */
  }
}

/**
 * Open the audio output. Call SYNCHRONOUSLY inside a user gesture (a tap):
 * iOS only lets a context start there. The player calls it from "Empezar";
 * a host whose player mounts later, after an awaited server action (the
 * master starting a group warm-up), must call it in the tap itself, because
 * by the time the player mounts the gesture is gone and the phone stays
 * silent.
 */
export function unlockWarmupAudio(): void {
  const c = getCtx(true);
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* not supported */
  }
  if (!c) return;
  resumeIfNeeded(c);
  try {
    // iOS only opens the output once a buffer actually plays inside the gesture.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* best-effort */
  }
}

// ── speechSynthesis voices ─────────────────────────────────────────────────

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function subscribeVoices(cb: () => void) {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", cb);
  return () => s.removeEventListener("voiceschanged", cb);
}

const langPrefix = (locale: string) => locale.slice(0, 2).toLowerCase();
const speechLang = (locale: string) => (langPrefix(locale) === "en" ? "en-GB" : "es-ES");

function pickVoice(locale: string): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  let voices: SpeechSynthesisVoice[];
  try {
    voices = s.getVoices();
  } catch {
    return null;
  }
  const exact = speechLang(locale).toLowerCase();
  const prefix = langPrefix(locale);
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v) === exact && v.localService) ??
    voices.find((v) => norm(v) === exact) ??
    voices.find((v) => norm(v).startsWith(prefix)) ??
    null
  );
}

function documentLocale(): string {
  return (typeof document !== "undefined" && document.documentElement.lang) || "es";
}

// ── hook ───────────────────────────────────────────────────────────────────

/** `locale` only feeds `voiceAvailable`; it defaults to `<html lang>`. */
export function useWarmupAudio(locale?: string): WarmupAudio {
  const [sound, setSound] = useLocalFlag(WARMUP_SOUND_KEY, true, FLAG_STRINGS);
  const [voice, setVoiceFlag] = useLocalFlag(WARMUP_VOICE_KEY, false, FLAG_STRINGS);
  // A host default for this run only (null = follow the stored choice).
  const [runMuted, setRunMuted] = useState<boolean | null>(null);
  const muted = runMuted ?? !sound;

  const interrupted = useSyncExternalStore(subscribeCtx, isInterrupted, () => false);
  const voiceAvailable = useSyncExternalStore(
    subscribeVoices,
    () => pickVoice(locale ?? documentLocale()) !== null,
    () => false,
  );

  const mutedRef = useRef(muted);
  const voiceRef = useRef(voice);
  useEffect(() => {
    mutedRef.current = muted;
    voiceRef.current = voice;
  }, [muted, voice]);

  const busRef = useRef<GainNode | null>(null);
  const demoBusRef = useRef<GainNode | null>(null);
  const vibrateTimers = useRef<number[]>([]);
  const speechDone = useRef(new Set<() => void>());

  /** Fade a bus out and disconnect it 300 ms later; its voices die with it. */
  const fadeBus = useCallback((ref: { current: GainNode | null }) => {
    const bus = ref.current;
    ref.current = null;
    if (!bus) return;
    try {
      const now = bus.context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      /* context gone */
    }
    window.setTimeout(() => {
      try {
        bus.disconnect();
      } catch {
        /* already disconnected */
      }
    }, 300);
  }, []);

  const freshBus = useCallback((c: AudioContext): GainNode | null => {
    try {
      const bus = c.createGain();
      bus.gain.value = 1;
      bus.connect(c.destination);
      return bus;
    } catch {
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    fadeBus(busRef);
    fadeBus(demoBusRef);
    vibrateTimers.current.forEach((t) => window.clearTimeout(t));
    vibrateTimers.current = [];
  }, [fadeBus]);

  const unlock = unlockWarmupAudio;

  const schedule = useCallback(
    (cues: readonly CuePoint[], elapsedMs: number, hums: readonly HumWindow[] = [], win: ScheduleWindow = {}) => {
      cancel();
      const due = dueCues(cues, elapsedMs, win);
      for (const cue of due) {
        const delay = Math.max(0, cue.atMs - elapsedMs);
        vibrateTimers.current.push(window.setTimeout(() => vibrateNow(VIBRATION[cue.kind]), delay));
      }
      if (mutedRef.current) return;
      const c = getCtx(true);
      if (!c) return;
      resumeIfNeeded(c);
      const bus = freshBus(c);
      if (!bus) return;
      busRef.current = bus;
      const now = c.currentTime;
      for (const cue of due) renderCue(c, cue.kind, now + (cue.atMs - elapsedMs) / 1000, bus);
      // The hum follows the movement windows; a window already running when
      // we (re)schedule starts at once (renderHum clamps to currentTime).
      for (const h of dueHums(hums, elapsedMs, win)) {
        renderHum(c, now + (h.fromMs - elapsedMs) / 1000, now + (h.toMs - elapsedMs) / 1000, bus, h.contour);
      }
    },
    [cancel, freshBus],
  );

  const checkContext = useCallback(async (waitMs = 300): Promise<AudioCtxState> => {
    const c = getCtx(false);
    if (!c) return "none";
    if (c.state !== "running" && c.state !== "closed") {
      try {
        await Promise.race([c.resume().catch(() => {}), new Promise<void>((r) => window.setTimeout(r, waitMs))]);
      } catch {
        /* resume unavailable */
      }
    }
    const st = c.state as string;
    return st === "running" || st === "suspended" || st === "interrupted" || st === "closed" ? st : "suspended";
  }, []);

  const playDemo = useCallback(
    (kind: CueKind) => {
      unlockWarmupAudio();
      vibrateNow(VIBRATION[kind]);
      if (mutedRef.current) return;
      const c = getCtx(false);
      if (!c) return;
      fadeBus(demoBusRef);
      const bus = freshBus(c);
      if (!bus) return;
      demoBusRef.current = bus;
      renderCue(c, kind, c.currentTime + 0.02, bus);
      window.setTimeout(() => {
        if (demoBusRef.current === bus) fadeBus(demoBusRef);
      }, cueDurationMs(kind) + 200);
    },
    [fadeBus, freshBus],
  );

  const cancelSpeech = useCallback(() => {
    try {
      synth()?.cancel();
    } catch {
      /* ignore */
    }
    const pending = [...speechDone.current];
    speechDone.current.clear();
    pending.forEach((done) => done());
  }, []);

  const speak = useCallback((text: string, loc: string, opts?: { interrupt?: boolean }): Promise<void> => {
    const s = synth();
    if (!voiceRef.current || mutedRef.current || !s || !text.trim()) return Promise.resolve();
    const v = pickVoice(loc);
    if (!v) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      let timer = 0;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        speechDone.current.delete(done);
        resolve();
      };
      // Safety net: some engines (iOS) occasionally never fire end/error.
      timer = window.setTimeout(done, Math.max(4000, text.length * 160));
      speechDone.current.add(done);
      try {
        // Instructions never queue behind a stuck utterance; the short cues
        // ("Para", "Sube") wait their turn so a sentence is not cut.
        if (opts?.interrupt !== false) s.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = speechLang(loc);
        u.voice = v;
        u.rate = SPEECH_RATE;
        u.onend = done;
        u.onerror = done;
        s.speak(u);
      } catch {
        done();
      }
    });
  }, []);

  const setMuted = useCallback(
    (m: boolean, opts?: { persist?: boolean }) => {
      if (opts?.persist === false) {
        setRunMuted(m);
      } else {
        // The person's own choice: stored, and it ends any host default.
        setRunMuted(null);
        setSound(!m);
      }
      mutedRef.current = m;
      if (m) {
        // Silence what is already scheduled; vibration timers keep running.
        fadeBus(busRef);
        fadeBus(demoBusRef);
        cancelSpeech();
      }
    },
    [setSound, fadeBus, cancelSpeech],
  );

  const setVoice = useCallback(
    (v: boolean) => {
      setVoiceFlag(v);
      voiceRef.current = v;
      if (!v) cancelSpeech();
    },
    [setVoiceFlag, cancelSpeech],
  );

  // Ref-count consumers of the shared context; the last one out suspends it.
  // Idempotent under StrictMode's mount -> unmount -> mount (a suspended
  // context is resumed by the next unlock()/schedule()).
  useEffect(() => {
    consumers += 1;
    return () => {
      consumers -= 1;
      cancel();
      cancelSpeech();
      if (consumers === 0 && ctx && ctx.state === "running") void ctx.suspend().catch(() => {});
    };
  }, [cancel, cancelSpeech]);

  return useMemo(
    () => ({
      muted,
      setMuted,
      voice,
      setVoice,
      voiceAvailable,
      unlock,
      schedule,
      cancel,
      playDemo,
      vibrate: vibrateNow,
      speak,
      cancelSpeech,
      interrupted,
      checkContext,
    }),
    [muted, setMuted, voice, setVoice, voiceAvailable, unlock, schedule, cancel, playDemo, speak, cancelSpeech, interrupted, checkContext],
  );
}

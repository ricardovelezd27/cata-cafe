"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocalFlag } from "@/hooks/useLocalFlag";
import type { AudioCtxState } from "@/lib/warmup/audioResume";
import { dueCues, dueHums, type ScheduleWindow } from "@/lib/warmup/audioWindow";
import { FALLBACK_VOICE_VOLUME, LIMITER, MIX, duckingPlan, laneGains, type MixLevels, type SpeechWindow } from "@/lib/warmup/mix";
import { AIR, HUM, VIBRATION, cueDurationMs, renderAir, renderCue, renderHum, type HumRecipe } from "@/lib/warmup/sounds";
import type { CueKind, CuePoint, HumWindow } from "@/lib/warmup/timelineTypes";
import { CLIP_PICKUP_FADE_MS, dueClips, type ClipPoint } from "@/lib/warmup/voiceSchedule";

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
 *  - the GUIDE VOICE: recorded files (lib/warmup/voice.ts), loaded with
 *    `loadWarmupVoice()` and started on the same audio clock as the bells,
 *    through the voice lane of the mix. The phone's own speechSynthesis is
 *    only the fallback when the files cannot be loaded;
 *  - mute + voice toggles persisted in localStorage (`cata_warmup_sound`,
 *    `cata_warmup_voice`, "on"/"off"; the voice is ON unless turned off). A host can also set the sound for ONE
 *    run without touching the person's stored choice (`persist: false`: a
 *    follower of a group run starts muted, the master's phone sounds).
 *
 * One AudioContext per page (module singleton), created lazily inside
 * `unlock()` / `unlockWarmupAudio()` (which must be called synchronously
 * inside a user gesture) or the first `schedule()`. Never closed; suspended
 * when the last consumer unmounts.
 *
 * THE MIX (lib/warmup/mix.ts holds the numbers and the rules):
 *
 *   voice ──────────────────────────────┐
 *   markers (campana, tic, cuenco, doble)┼─► limiter ─► output
 *   background ◄─ tone (movement hum)    │
 *              ◄─ air  (continuous bed) ─┘
 *
 * The voice, the limiter and the background lane live as long as the
 * context. Each `schedule()` hangs four short-lived gain nodes on them
 * (markers, tone, air, and the recorded lines of the stretch) at the lane
 * levels of the mix; `cancel()` fades and drops them. The background lane's own gain is the DUCKING: it is
 * drawn ahead of time from the known speech windows, never reacting to the
 * signal.
 */
export const WARMUP_SOUND_KEY = "cata_warmup_sound";
export const WARMUP_VOICE_KEY = "cata_warmup_voice";

const FLAG_STRINGS = { on: "on", off: "off" };
const SPEECH_RATE = 0.88;

export interface ScheduleOptions extends ScheduleWindow {
  /** The exercise's own tone (lib/warmup/sounds.ts toneFor). Default: HUM. */
  readonly tone?: HumRecipe;
  /** When a line is spoken, ms on the run's timeline: the background dips
   *  under each one (lib/warmup/mix.ts duckingPlan). */
  readonly speech?: readonly SpeechWindow[];
  /** The recorded lines of the run (lib/warmup/voiceLines.ts). Those due in
   *  this stretch are started on the audio clock (voiceSchedule.ts); a line
   *  whose file is not loaded is skipped. */
  readonly clips?: readonly ClipPoint[];
}

export interface WarmupAudio {
  muted: boolean;
  /** `persist: false` sets the sound for this run only (a host default); the
   *  default is the person's own choice, stored for every later run. */
  setMuted(m: boolean, opts?: { persist?: boolean }): void;
  /** The guide voice (default on). */
  voice: boolean;
  setVoice(v: boolean): void;
  /** speechSynthesis exists AND lists a voice for the locale's language. */
  voiceAvailable: boolean;
  /** Call synchronously inside a user gesture. */
  unlock(): void;
  /** cancel(), then schedule the cues and hum windows that are due inside
   *  the window of `opts` (lib/warmup/audioWindow.ts: nothing past the point
   *  where the clock stops by itself), the air for the whole stretch, and
   *  the ducking of the background under `opts.speech`. */
  schedule(cues: readonly CuePoint[], elapsedMs: number, hums?: readonly HumWindow[], opts?: ScheduleOptions): void;
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
  /** Counts the changes of the dev mix override (setWarmupMixOverride). It
   *  changes this object's identity, which is what makes a running player
   *  reschedule with the new levels. */
  mixVersion: number;
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

// ── The persistent part of the mix ─────────────────────────────────────────

interface Graph {
  readonly ctx: AudioContext;
  /** Where the markers lane and the two lanes below plug in (the limiter). */
  readonly out: AudioNode;
  readonly voice: GainNode;
  /** Tone + air. Its gain is the ducking lane (1 = nobody speaks). */
  readonly background: GainNode;
}

let graph: Graph | null = null;

function getGraph(c: AudioContext): Graph | null {
  if (graph && graph.ctx === c) return graph;
  try {
    let out: AudioNode = c.destination;
    try {
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = LIMITER.thresholdDb;
      limiter.knee.value = LIMITER.kneeDb;
      limiter.ratio.value = LIMITER.ratio;
      limiter.attack.value = LIMITER.attackS;
      limiter.release.value = LIMITER.releaseS;
      limiter.connect(c.destination);
      out = limiter;
    } catch {
      /* no compressor: the mix's own headroom has to do */
    }
    const voice = c.createGain();
    voice.gain.value = 1;
    voice.connect(out);
    const background = c.createGain();
    background.gain.value = 1;
    background.connect(out);
    graph = { ctx: c, out, voice, background };
  } catch {
    graph = null;
  }
  return graph;
}

// The mix in force. `MIX` unless the dev player is trying other numbers.
let mixOverride: MixLevels | null = null;
let mixVersion = 0;
const mixListeners = new Set<() => void>();
const currentMix = (): MixLevels => mixOverride ?? MIX;
function subscribeMix(cb: () => void) {
  mixListeners.add(cb);
  return () => {
    mixListeners.delete(cb);
  };
}

/** Dev only (/app/warmup/dev-player): try other mix numbers without editing
 *  lib/warmup/mix.ts. A running player reschedules at once. `null` restores
 *  the committed mix. */
export function setWarmupMixOverride(mix: MixLevels | null): void {
  mixOverride = mix;
  mixVersion += 1;
  mixListeners.forEach((l) => l());
}

// ── The recorded voice files ───────────────────────────────────────────────
// Fetched as bytes (no audio context needed: it can happen on the intro
// screen, before any tap) and decoded once a context exists.

const clipBytes = new Map<string, ArrayBuffer>();
const clipBuffers = new Map<string, AudioBuffer>();
const clipFetches = new Map<string, Promise<boolean>>();
const clipDecodes = new Map<string, Promise<boolean>>();
/** How many files are fetched or decoded at once. */
const VOICE_LOAD_PARALLEL = 6;

async function eachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<boolean>): Promise<boolean> {
  let ok = true;
  let next = 0;
  const worker = async () => {
    while (next < items.length && ok) {
      const item = items[next++];
      if (!(await fn(item))) ok = false;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ok;
}

/**
 * Load the recorded lines of a run. `decode: false` only downloads them (the
 * intro screen: it warms the browser and service-worker caches without
 * creating an audio context before a tap); `decode: true` also decodes them,
 * which is what `schedule()` needs. Resolves false when ANY file could not be
 * loaded: the caller then falls back to the phone's own voice for the whole
 * run, never a mix of two voices. Decoded lines of other runs are dropped.
 */
export async function loadWarmupVoice(urls: readonly string[], decode: boolean): Promise<boolean> {
  const wanted = [...new Set(urls)];
  try {
    const fetched = await eachLimited(wanted, VOICE_LOAD_PARALLEL, async (url) => {
      if (clipBuffers.has(url) || clipBytes.has(url)) return true;
      // One download per file, even when two loads ask for it at once.
      let pending = clipFetches.get(url);
      if (!pending) {
        pending = (async () => {
          try {
            const res = await fetch(url);
            if (!res.ok) return false;
            clipBytes.set(url, await res.arrayBuffer());
            return true;
          } catch {
            return false;
          } finally {
            clipFetches.delete(url);
          }
        })();
        clipFetches.set(url, pending);
      }
      return pending;
    });
    if (!fetched) return false;
    if (!decode) return true;
    const c = getCtx(true);
    if (!c) return false;
    const keep = new Set(wanted);
    for (const url of [...clipBuffers.keys()]) if (!keep.has(url)) clipBuffers.delete(url);
    return await eachLimited(wanted, VOICE_LOAD_PARALLEL, async (url) => {
      if (clipBuffers.has(url)) return true;
      let pending = clipDecodes.get(url);
      if (!pending) {
        const bytes = clipBytes.get(url);
        if (!bytes) return false;
        // decodeAudioData detaches the buffer it is given; the bytes are not
        // needed again.
        clipBytes.delete(url);
        pending = (async () => {
          try {
            clipBuffers.set(url, await c.decodeAudioData(bytes));
            return true;
          } catch {
            return false;
          } finally {
            clipDecodes.delete(url);
          }
        })();
        clipDecodes.set(url, pending);
      }
      return pending;
    });
  } catch {
    return false;
  }
}

/**
 * Dev only for now: play one rendered voice file through the VOICE lane,
 * with the background ducked under it exactly as the mix says, so the levels
 * can be judged against a real line. Call inside a tap. Resolves with a stop
 * function (a no-op when the clip could not be played).
 */
export async function playWarmupVoiceClip(url: string): Promise<() => void> {
  unlockWarmupAudio();
  const c = getCtx(false);
  const g = c ? getGraph(c) : null;
  if (!c || !g) return () => {};
  try {
    let buf = clipBuffers.get(url);
    if (!buf) {
      const res = await fetch(url);
      if (!res.ok) return () => {};
      buf = await c.decodeAudioData(await res.arrayBuffer());
    }
    const mix = currentMix();
    const now = c.currentTime;
    const startMs = mix.duckAttackMs + 20;
    const plan = duckingPlan([{ fromMs: startMs, toMs: startMs + buf.duration * 1000 }], 0, mix);
    g.background.gain.cancelScheduledValues(now);
    g.background.gain.setValueAtTime(plan.start, now);
    for (const p of plan.points) g.background.gain.linearRampToValueAtTime(p.gain, now + p.atMs / 1000);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(g.voice);
    src.start(now + startMs / 1000);
    return () => {
      try {
        src.stop();
        const t = c.currentTime;
        g.background.gain.cancelScheduledValues(t);
        g.background.gain.setTargetAtTime(1, t, 0.15);
      } catch {
        /* already ended */
      }
    };
  } catch {
    return () => {};
  }
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
  const [voice, setVoiceFlag] = useLocalFlag(WARMUP_VOICE_KEY, true, FLAG_STRINGS);
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

  // The short-lived lane nodes of the stretch that is scheduled now.
  const stretchRef = useRef<GainNode[] | null>(null);
  const demoBusRef = useRef<GainNode | null>(null);
  const vibrateTimers = useRef<number[]>([]);
  const speechDone = useRef(new Set<() => void>());
  // Re-render (and so reschedule a running player) when the dev mix changes.
  const mixTick = useSyncExternalStore(
    subscribeMix,
    () => mixVersion,
    () => 0,
  );

  /** Fade a node out and disconnect it 300 ms later; its voices die with it. */
  const fadeNode = useCallback((node: GainNode | null) => {
    if (!node) return;
    try {
      const now = node.context.currentTime;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      /* context gone */
    }
    window.setTimeout(() => {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }, 300);
  }, []);
  const fadeBus = useCallback(
    (ref: { current: GainNode | null }) => {
      const bus = ref.current;
      ref.current = null;
      fadeNode(bus);
    },
    [fadeNode],
  );

  /** A gain node at `gain` feeding `into`. */
  const lane = useCallback((c: AudioContext, gain: number, into: AudioNode): GainNode | null => {
    try {
      const node = c.createGain();
      node.gain.value = gain;
      node.connect(into);
      return node;
    } catch {
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    const stretch = stretchRef.current;
    stretchRef.current = null;
    stretch?.forEach(fadeNode);
    fadeBus(demoBusRef);
    vibrateTimers.current.forEach((t) => window.clearTimeout(t));
    vibrateTimers.current = [];
    // Nobody speaks while the run is stopped: the background lane rests at 1.
    const g = graph;
    if (g) {
      try {
        const now = g.ctx.currentTime;
        g.background.gain.cancelScheduledValues(now);
        g.background.gain.setTargetAtTime(1, now, 0.1);
      } catch {
        /* context gone */
      }
    }
  }, [fadeNode, fadeBus]);

  const unlock = unlockWarmupAudio;

  const schedule = useCallback(
    (cues: readonly CuePoint[], elapsedMs: number, hums: readonly HumWindow[] = [], opts: ScheduleOptions = {}) => {
      cancel();
      const due = dueCues(cues, elapsedMs, opts);
      for (const cue of due) {
        const delay = Math.max(0, cue.atMs - elapsedMs);
        vibrateTimers.current.push(window.setTimeout(() => vibrateNow(VIBRATION[cue.kind]), delay));
      }
      if (mutedRef.current) return;
      const c = getCtx(true);
      const g = c ? getGraph(c) : null;
      if (!c || !g) return;
      resumeIfNeeded(c);
      const mix = currentMix();
      const tone = opts.tone ?? HUM;
      const gains = laneGains(mix, tone, AIR, c.sampleRate);
      const markers = lane(c, gains.markers, g.out);
      const toneLane = lane(c, gains.tone, g.background);
      const airLane = lane(c, gains.air, g.background);
      const voiceLane = lane(c, gains.voice, g.voice);
      if (!markers || !toneLane || !airLane || !voiceLane) return;
      stretchRef.current = [markers, toneLane, airLane, voiceLane];
      const now = c.currentTime;
      const at = (ms: number) => now + (ms - elapsedMs) / 1000;
      for (const cue of due) renderCue(c, cue.kind, at(cue.atMs), markers);
      // The tone follows the movement windows; a window already running when
      // we (re)schedule starts at once (renderHum clamps to currentTime).
      for (const h of dueHums(hums, elapsedMs, opts)) renderHum(c, at(h.fromMs), at(h.toMs), toneLane, h.contour, tone);
      // The air runs for the whole stretch and fades out into its end.
      if (opts.untilMs !== undefined) renderAir(c, now, at(opts.untilMs), airLane);
      // The recorded lines, on the same clock as the bells.
      if (voiceRef.current) {
        for (const d of dueClips(opts.clips ?? [], elapsedMs, opts)) {
          const buf = clipBuffers.get(d.url);
          if (!buf) continue;
          try {
            const src = c.createBufferSource();
            src.buffer = buf;
            let into: AudioNode = voiceLane;
            if (d.offsetMs > 0) {
              // Picked up mid-line: a short fade-in instead of a click.
              const fade = c.createGain();
              fade.gain.setValueAtTime(0, at(d.atMs));
              fade.gain.linearRampToValueAtTime(1, at(d.atMs) + CLIP_PICKUP_FADE_MS / 1000);
              fade.connect(voiceLane);
              into = fade;
            }
            src.connect(into);
            src.start(at(d.atMs), d.offsetMs / 1000);
          } catch {
            /* audio is best-effort */
          }
        }
      }
      // Ducking: the background lane, drawn ahead from the speech windows.
      try {
        const plan = duckingPlan(opts.speech ?? [], elapsedMs, mix);
        g.background.gain.cancelScheduledValues(now);
        g.background.gain.setValueAtTime(plan.start, now);
        for (const p of plan.points) g.background.gain.linearRampToValueAtTime(p.gain, at(p.atMs));
      } catch {
        /* audio is best-effort */
      }
    },
    [cancel, lane],
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
      const g = c ? getGraph(c) : null;
      if (!c || !g) return;
      fadeBus(demoBusRef);
      // The demo plays in the markers lane, at the level a cue has in a run.
      const bus = lane(c, laneGains(currentMix()).markers, g.out);
      if (!bus) return;
      demoBusRef.current = bus;
      renderCue(c, kind, c.currentTime + 0.02, bus);
      window.setTimeout(() => {
        if (demoBusRef.current === bus) fadeBus(demoBusRef);
      }, cueDurationMs(kind) + 200);
    },
    [fadeBus, lane],
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
        // Outside the mixer: brought roughly in line with it (lib/warmup/mix.ts).
        u.volume = FALLBACK_VOICE_VOLUME;
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
        const stretch = stretchRef.current;
        stretchRef.current = null;
        stretch?.forEach(fadeNode);
        fadeBus(demoBusRef);
        cancelSpeech();
      }
    },
    [setSound, fadeNode, fadeBus, cancelSpeech],
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
      mixVersion: mixTick,
    }),
    [muted, setMuted, voice, setVoice, voiceAvailable, unlock, schedule, cancel, playDemo, speak, cancelSpeech, interrupted, checkContext, mixTick],
  );
}

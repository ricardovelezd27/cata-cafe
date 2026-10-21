"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLocalFlag } from "@/hooks/useLocalFlag";

/**
 * Guidance channel for the warm-up player (v2): eyes are closed for half the
 * exercise, so the phone has to speak without the screen.
 *
 *  - a soft chime synthesised with Web Audio (no asset) at step start, at the
 *    turn-around of a round trip, and when a hold ends;
 *  - an optional voice track per step, loaded from
 *    /public/warmup/<slug>/<stepId>.m4a ONLY IF the file exists (one HEAD
 *    request per URL, cached for the page's lifetime). We ship no audio;
 *  - a Vibration API tick on the same events (silently absent on iOS);
 *  - a mute toggle (sound + voice; haptics stay) persisted in localStorage
 *    `cata_warmup_sound`.
 *
 * The chime/voice only start after `unlock()` has run inside a user gesture
 * (the player calls it from its Start/Empezar button), which also satisfies
 * the autoplay policy of iOS and Chrome.
 */
export const WARMUP_SOUND_KEY = "cata_warmup_sound";

export type WarmupCue = "start" | "turn" | "holdEnd" | "close";

const PITCHES: Record<WarmupCue, number[]> = {
  start: [523.25, 784],
  turn: [392],
  holdEnd: [659.25],
  close: [523.25, 659.25, 784],
};
const VIBRATION: Record<WarmupCue, number | number[]> = {
  start: 40,
  turn: [30, 60, 30],
  holdEnd: 30,
  close: [40, 80, 40],
};

const voiceExists = new Map<string, Promise<boolean>>();
function checkVoice(url: string): Promise<boolean> {
  let p = voiceExists.get(url);
  if (!p) {
    p = fetch(url, { method: "HEAD" })
      .then((r) => r.ok && /^(audio|video)\//.test(r.headers.get("content-type") ?? ""))
      .catch(() => false);
    voiceExists.set(url, p);
  }
  return p;
}

export interface WarmupCues {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Call inside a user gesture before the first cue. */
  unlock: () => void;
  /** Chime (unless muted) + vibration. */
  cue: (kind: WarmupCue) => void;
  /** Play `/warmup/<slug>/<stepId>.m4a` if it exists and sound is on. */
  voice: (slug: string, stepId: string) => void;
  stopVoice: () => void;
}

export function useWarmupCues(): WarmupCues {
  const [sound, setSound] = useLocalFlag(WARMUP_SOUND_KEY, true, { on: "on", off: "off" });
  const muted = !sound;
  const mutedRef = useRef(muted);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceTokenRef = useRef(0);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) audioRef.current?.pause();
  }, [muted]);

  const getCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    } catch {
      return null;
    }
    return ctxRef.current;
  }, []);

  const unlock = useCallback(() => {
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }, [getCtx]);

  const cue = useCallback(
    (kind: WarmupCue) => {
      try {
        navigator.vibrate?.(VIBRATION[kind]);
      } catch {
        /* haptics unavailable (iOS) */
      }
      if (mutedRef.current) return;
      const ctx = getCtx();
      if (!ctx || ctx.state === "closed") return;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      PITCHES[kind].forEach((freq, i) => {
        const t0 = now + i * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // Soft bell: 40 ms attack, long exponential tail, low level.
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 1.7);
      });
    },
    [getCtx],
  );

  const stopVoice = useCallback(() => {
    voiceTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const voice = useCallback(
    (slug: string, stepId: string) => {
      stopVoice();
      if (mutedRef.current) return;
      const token = voiceTokenRef.current;
      const url = `/warmup/${slug}/${stepId}.m4a`;
      void checkVoice(url).then((ok) => {
        if (!ok || token !== voiceTokenRef.current || mutedRef.current) return;
        const a = new Audio(url);
        audioRef.current = a;
        void a.play().catch(() => {});
      });
    },
    [stopVoice],
  );

  useEffect(
    () => () => {
      voiceTokenRef.current += 1;
      audioRef.current?.pause();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    },
    [],
  );

  return { muted, setMuted: (m) => setSound(!m), unlock, cue, voice, stopVoice };
}

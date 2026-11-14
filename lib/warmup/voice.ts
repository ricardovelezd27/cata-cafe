// The recorded guide voice: which voice speaks each language, and where the
// file of a line lives. Pure (no React, no DOM).
//
// The files are rendered ahead of time on a developer's machine with Kokoro
// (scripts/warmup-voice/README.md): no text leaves that machine and nothing is
// synthesised on the phone. A line is found by its TEXT (voiceKey.ts), so the
// player needs no id table: whatever it is about to say either has a file or
// it does not.

import type { WarmupLocale } from "./exercises";
import { VOICE_MANIFEST } from "./voiceManifest";
import { lineKey } from "./voiceKey";

export interface VoiceSet {
  /** Folder under public/warmup/voice/ (and the manifest's `set`). */
  readonly id: string;
  /** Kokoro voice. */
  readonly voice: string;
  /** Pronunciation passed to the phonemiser. */
  readonly lang: string;
  readonly speed: number;
}

// The owner's pick by ear, 2026-11-14 (audition page): Dora with the LATIN
// AMERICAN pronunciation for Spanish (no "th" sound for c and z), Heart (US)
// for English. He picked the Spain pronunciation first and changed to this
// one the same day. The WORDING is neutral Spanish either way (no "vosotros",
// "detente" over "párate").
//
// CHANGING A VOICE NEEDS A NEW `id`. The files are named after their text, so
// the same line keeps the same file name under any voice, and phones keep the
// files for good (public/sw.js, cache-first): under the old folder name they
// would go on playing the old voice. A new id is a new folder, so new URLs.
export const VOICE_SETS: Readonly<Record<WarmupLocale, VoiceSet>> = {
  es: { id: "es-dora-419", voice: "ef_dora", lang: "es-419", speed: 0.9 },
  en: { id: "en-heart", voice: "af_heart", lang: "en-us", speed: 0.9 },
};

export const VOICE_BASE = "/warmup/voice";

export const voiceLocale = (locale: string): WarmupLocale => (locale === "en" ? "en" : "es");

export interface VoiceClip {
  readonly url: string;
  readonly durMs: number;
}

/** The recorded file of `text` in that language, or null when none exists. */
export function voiceClip(text: string, locale: string): VoiceClip | null {
  const entry = VOICE_MANIFEST[voiceLocale(locale)];
  const key = lineKey(text);
  const durMs = entry.lines[key];
  if (durMs === undefined) return null;
  return { url: `${VOICE_BASE}/${entry.set}/${key}.mp3`, durMs };
}

/** How long the phone's own voice (or an unrecorded line) takes to say
 *  `text`, ms: an ESTIMATE. About 2.4 words a second, plus the pause of each
 *  sentence end. */
export function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const stops = (text.match(/[.!?…:;]/g) ?? []).length;
  return Math.round(350 + words * 420 + stops * 250);
}

/** How long the line takes to say: the measured length of its recording, or
 *  the estimate when it has none (a line being edited, a synthetic exercise
 *  in a test). */
export function spokenMs(text: string, locale: string): number {
  return voiceClip(text, locale)?.durMs ?? estimateSpeechMs(text);
}

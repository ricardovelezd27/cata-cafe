// The mix of the warm-up player: how loud each kind of sound is RELATIVE TO
// THE GUIDE VOICE, and how the background gets out of the voice's way.
// Pure (no React, no DOM): hooks/useWarmupAudio.ts turns these numbers into
// gain nodes, tests/warmup-mix.test.ts keeps them inside safe limits.
//
// Four kinds of sound, three lanes into one limiter:
//
//   voice    the spoken instructions            (the reference: 0 dB)
//   markers  campana, tic, cuenco, doble        (events: "move", "stop", ...)
//   tone     the movement tone under each leg   \  the BACKGROUND: it dips
//   air      the continuous room-air bed        /  while a line is spoken
//
// Everything is written the way a person would say it at a mixing desk:
// "the bells sit 6 dB under the voice", "the background drops another 8 dB
// while someone speaks". The recipes in lib/warmup/sounds.ts report their own
// nominal level, so those sentences stay true when a recipe is retuned.

import { AIR, HUM, airRmsDb, cueAttackRmsDb, cuePeakMax, humPeakMax, humRmsDb, type AirRecipe, type HumRecipe } from "./sounds";

/** Loudness of the rendered voice files (scripts/warmup-voice/render.py). */
export const VOICE_LUFS = -19;
/** Peak ceiling of the rendered voice files, dB re full scale. */
export const VOICE_PEAK_DB = -1.5;

export interface MixLevels {
  /** Bells (at their loudest instant) relative to the voice, dB. */
  readonly markersDb: number;
  /** The movement tone relative to the voice while NOBODY speaks, dB. */
  readonly toneDb: number;
  /** The continuous air relative to the voice while NOBODY speaks, dB. */
  readonly airDb: number;
  /** Extra turn-down of the whole background (tone + air) while a line is
   *  spoken, dB (negative). "Ducking". */
  readonly duckDb: number;
  /** How long the background takes to get down before a line starts, ms. It
   *  finishes dipping exactly when the first word starts (we know the start
   *  ahead of time, so the dip can lead it). */
  readonly duckAttackMs: number;
  /** How long it takes to come back up after the last word, ms. */
  readonly duckReleaseMs: number;
}

// SET BY MEASUREMENT, NOT BY EAR (2026-11-14). The owner could not listen
// before this shipped and asked for it to be made right without him, so these
// six numbers come from computed, ear-weighted (dB(A)) levels of each sound,
// on full-range playback and through a small-speaker model (a 400 Hz
// high-pass, roughly a phone). They are still a judgement of the ear and they
// are still his: tune them live in /app/warmup/dev-player (the "mix"
// sliders, with "Voz de prueba" playing a real rendered line), on headphones
// AND on a phone speaker, and write what you land on here.
//
// What each number was chosen to do, and what it measures:
//   markersDb  0   The bells stay close to what people already know: 3.7 dB
//                  under their level before the mixer existed, and never
//                  above the voice.
//   toneDb   -12   The movement tone is 15 to 20 dB under the bell's strike,
//                  so the bell still reads as an event. On a phone speaker it
//                  is about 12 dB more present than the old tone, which was
//                  33 dB under the bell there (in practice, silent).
//   airDb    -30   The air sits 7 to 14 dB under the tone (the low-rooted
//                  tones lose the most on a phone speaker, which sets the
//                  7): noticed only when it stops.
//   duckDb    -8   While a line is spoken the tone is 20 dB under the voice
//                  and the air 38 dB under it.
// tests/warmup-mix.test.ts keeps those relations true and enforces the hard
// limits (the voice at least 12 dB above the background while it speaks; the
// sum of everything must not clip).
export const MIX: MixLevels = {
  markersDb: 0,
  toneDb: -12,
  airDb: -30,
  duckDb: -8,
  duckAttackMs: 250,
  duckReleaseMs: 700,
};

/** The safety limiter on the output. It only acts on rare coincidences (a
 *  voice peak on top of a bell): the mix must already be right by gain
 *  staging, because a DynamicsCompressor adds make-up gain of its own that
 *  grows with how low the threshold is. */
export const LIMITER = { thresholdDb: -1.5, kneeDb: 0, ratio: 20, attackS: 0.003, releaseS: 0.15 } as const;

/** The phone's own voice (speechSynthesis, the fallback when the rendered
 *  voice is not available) plays OUTSIDE the mixer, at whatever level the
 *  phone gives it. The bells are 3.7 dB quieter than they were before the
 *  mixer existed (MIX.markersDb), so this volume (0..1) turns the phone's
 *  voice down by the same amount: the balance people already know between
 *  that voice and the bells is kept. */
export const FALLBACK_VOICE_VOLUME = 0.65;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (gain: number): number => 20 * Math.log10(Math.max(gain, 1e-9));

/** Gain of a lane so that a source whose nominal level is `sourceRmsDb`
 *  ends up `relDb` away from the voice. */
export function laneGain(relDb: number, sourceRmsDb: number): number {
  return dbToGain(VOICE_LUFS + relDb - sourceRmsDb);
}

export interface LaneGains {
  readonly voice: number;
  readonly markers: number;
  readonly tone: number;
  readonly air: number;
  /** Multiplier of the background lane while a line is spoken. */
  readonly ducked: number;
}

/** The lane gains for a mix (and the tone / air recipes actually played). */
export function laneGains(mix: MixLevels = MIX, tone: HumRecipe = HUM, air: AirRecipe = AIR, sampleRate = 48000): LaneGains {
  return {
    voice: 1,
    // The campana is the reference marker; the other cues keep the balance
    // their recipes give them against it.
    markers: laneGain(mix.markersDb, cueAttackRmsDb("campana")),
    tone: laneGain(mix.toneDb, humRmsDb(tone)),
    air: laneGain(mix.airDb, airRmsDb(air, sampleRate)),
    ducked: dbToGain(mix.duckDb),
  };
}

/** How far under the voice the loudest background layer sits WHILE a line is
 *  spoken, dB (negative). The number that answers "is the voice clearly on
 *  top?". */
export function backgroundUnderVoiceDb(mix: MixLevels = MIX): number {
  return Math.max(mix.toneDb, mix.airDb) + mix.duckDb;
}

/** The worst case, dB re full scale: a voice peak, the loudest cue with all
 *  its partials in phase, the tone at the top of its arrival bloom and the
 *  air, all at the same instant, background ducked (a voice is speaking).
 *  Above 0 dB the limiter is what stands between the mix and clipping. */
export function worstCasePeakDb(mix: MixLevels = MIX, tone: HumRecipe = HUM, air: AirRecipe = AIR): number {
  const g = laneGains(mix, tone, air);
  // Noise peaks about 10 dB over its RMS level.
  const airPeak = dbToGain(airRmsDb(air) + 10);
  const sum = dbToGain(VOICE_PEAK_DB) * g.voice + cuePeakMax() * g.markers + (humPeakMax(tone) * g.tone + airPeak * g.air) * g.ducked;
  return gainToDb(sum);
}

// ── Ducking ──────────────────────────────────────────────────────────────
// Every spoken line has a known start and length, so the background does not
// "react" to the voice (a sidechain): its volume is drawn ahead of time, as a
// lane of straight ramps, the way an editor draws automation.

/** A stretch of the run during which a line is being spoken, ms. */
export interface SpeechWindow {
  readonly fromMs: number;
  readonly toMs: number;
}

/** One point of the background lane: its gain (a multiplier, 1 = not ducked)
 *  reaches `gain` at `atMs`, in a straight line from the previous point. */
export interface DuckPoint {
  readonly atMs: number;
  readonly gain: number;
}

export interface DuckPlan {
  /** Gain at the moment the plan starts (`elapsedMs`). */
  readonly start: number;
  /** Points after `elapsedMs`, in time order. */
  readonly points: readonly DuckPoint[];
}

/** Lines that are closer than one release + one attack are spoken "in one
 *  breath": the background stays down between them instead of pumping. */
export function mergeSpeech(windows: readonly SpeechWindow[], mix: MixLevels = MIX): SpeechWindow[] {
  const sorted = windows.filter((w) => w.toMs > w.fromMs).sort((a, b) => a.fromMs - b.fromMs);
  const out: SpeechWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.fromMs - mix.duckAttackMs <= last.toMs + mix.duckReleaseMs) {
      out[out.length - 1] = { fromMs: last.fromMs, toMs: Math.max(last.toMs, w.toMs) };
    } else {
      out.push({ fromMs: w.fromMs, toMs: w.toMs });
    }
  }
  return out;
}

/** The whole lane as points (no clipping to a start time). */
function lane(windows: readonly SpeechWindow[], mix: MixLevels): DuckPoint[] {
  const ducked = dbToGain(mix.duckDb);
  const pts: DuckPoint[] = [];
  for (const w of mergeSpeech(windows, mix)) {
    pts.push({ atMs: w.fromMs - mix.duckAttackMs, gain: 1 }, { atMs: w.fromMs, gain: ducked }, { atMs: w.toMs, gain: ducked }, { atMs: w.toMs + mix.duckReleaseMs, gain: 1 });
  }
  return pts;
}

/** Background gain at `tMs` (straight lines between the lane's points). */
export function duckGainAt(windows: readonly SpeechWindow[], tMs: number, mix: MixLevels = MIX): number {
  let prev: DuckPoint | null = null;
  for (const p of lane(windows, mix)) {
    if (tMs < p.atMs) {
      if (!prev) return 1; // before the first dip the lane rests at 1
      return prev.gain + ((p.gain - prev.gain) * (tMs - prev.atMs)) / (p.atMs - prev.atMs);
    }
    prev = p;
  }
  return prev ? prev.gain : 1; // the lane always ends back at 1
}

/** The lane from `elapsedMs` on: where it is right now, and every point
 *  still ahead. The scheduler sets `start` now and ramps to each point. */
export function duckingPlan(windows: readonly SpeechWindow[], elapsedMs: number, mix: MixLevels = MIX): DuckPlan {
  return { start: duckGainAt(windows, elapsedMs, mix), points: lane(windows, mix).filter((p) => p.atMs > elapsedMs) };
}

// The estimate of how long the phone's own voice takes to say a line lives
// with the rest of the voice rules (lib/warmup/voice.ts).
export { estimateSpeechMs } from "./voice";

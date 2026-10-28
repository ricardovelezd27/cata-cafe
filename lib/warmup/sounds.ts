// Synthesis recipes for the four warm-up cues (hooks/useWarmupAudio.ts).
// Pure: no DOM, no window. `renderCue` only uses the BaseAudioContext API, so
// it runs against a fake context in tests and against a real AudioContext in
// the browser. Each sound has ONE meaning (lib/warmup/timelineTypes.ts):
//   campana — step start / turn      tic   — light tick (reps, hold end)
//   cuenco  — long bowl (arrive/closing)   doble — two strikes (step change)

import type { CueKind } from "./timelineTypes";

/** One sine/triangle partial: frequency, relative amplitude, decay length. */
export interface PartialSpec {
  readonly freq: number;
  readonly amp: number;
  readonly decayMs: number;
}

/** One strike of a cue. Every partial gets its own gain envelope:
 *  0 at `when` → linear to `peak * amp * gainScale` after `attackMs` →
 *  exponential to 0.0001 after `decayMs`. */
export interface StrikeRecipe {
  readonly wave: OscillatorType;
  readonly attackMs: number;
  /** Final linear level of a voice's gain node for an `amp: 1` partial. */
  readonly peak: number;
  readonly partials: readonly PartialSpec[];
  /** Partials are summed through a lowpass BiquadFilter at this cutoff. */
  readonly lowpassHz?: number;
  /** Frequency glide of every partial (tic): to `toHz` over `overMs`. */
  readonly glide?: { readonly toHz: number; readonly overMs: number };
  /** Band-passed white-noise burst layered on the strike (tic). */
  readonly noise?: { readonly bandHz: number; readonly q: number; readonly gain: number; readonly durMs: number };
}

export interface CueRecipe {
  readonly strikes: readonly { readonly offsetMs: number; readonly gainScale: number; readonly strike: StrikeRecipe }[];
}

const CAMPANA: StrikeRecipe = {
  wave: "sine",
  attackMs: 8,
  peak: 0.22,
  lowpassHz: 3000,
  partials: [
    { freq: 392, amp: 1, decayMs: 2500 },
    { freq: 393.5, amp: 0.3, decayMs: 2500 }, // beats against 392 Hz
    { freq: 1062, amp: 0.35, decayMs: 1400 },
    { freq: 2038, amp: 0.12, decayMs: 600 },
  ],
};

/** Campana with its decays scaled so the longest is 2000 ms (doble). */
const CAMPANA_SHORT: StrikeRecipe = {
  ...CAMPANA,
  partials: CAMPANA.partials.map((p) => ({ ...p, decayMs: Math.round(p.decayMs * 0.8) })),
};

const TIC: StrikeRecipe = {
  wave: "triangle",
  attackMs: 2,
  peak: 0.16,
  partials: [{ freq: 520, amp: 1, decayMs: 70 }],
  glide: { toHz: 420, overMs: 40 },
  noise: { bandHz: 1200, q: 4, gain: 0.06, durMs: 15 },
};

const CUENCO: StrikeRecipe = {
  wave: "sine",
  attackMs: 15,
  peak: 0.25,
  partials: [
    { freq: 196, amp: 1, decayMs: 5000 },
    { freq: 196.8, amp: 0.3, decayMs: 5000 },
    { freq: 531, amp: 0.6, decayMs: 2800 },
    { freq: 1019, amp: 0.1, decayMs: 1000 },
  ],
};

export const RECIPES: Record<CueKind, CueRecipe> = {
  campana: { strikes: [{ offsetMs: 0, gainScale: 1, strike: CAMPANA }] },
  tic: { strikes: [{ offsetMs: 0, gainScale: 1, strike: TIC }] },
  cuenco: { strikes: [{ offsetMs: 0, gainScale: 1, strike: CUENCO }] },
  doble: {
    strikes: [
      { offsetMs: 0, gainScale: 1, strike: CAMPANA_SHORT },
      { offsetMs: 600, gainScale: 0.8, strike: CAMPANA_SHORT },
    ],
  },
};

/** navigator.vibrate pattern played with each cue. */
export const VIBRATION: Record<CueKind, number | number[]> = {
  campana: 30,
  tic: [12, 60, 12],
  cuenco: 40,
  doble: [30, 120, 30],
};

const FLOOR = 0.0001;
/** Sources stop this long after their envelope reaches the floor. */
const STOP_PAD_S = 0.05;

/** Audible length of a cue (last strike's attack + longest decay). */
export function cueDurationMs(kind: CueKind): number {
  let end = 0;
  for (const { offsetMs, strike } of RECIPES[kind].strikes) {
    const longest = Math.max(...strike.partials.map((p) => p.decayMs), strike.noise?.durMs ?? 0);
    end = Math.max(end, offsetMs + strike.attackMs + longest);
  }
  return end;
}

const noiseBuffers = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
function noiseBuffer(ctx: BaseAudioContext, durMs: number): AudioBuffer {
  let perCtx = noiseBuffers.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    noiseBuffers.set(ctx, perCtx);
  }
  let buf = perCtx.get(durMs);
  if (!buf) {
    const length = Math.max(1, Math.round((ctx.sampleRate * durMs) / 1000));
    buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    perCtx.set(durMs, buf);
  }
  return buf;
}

function envelope(param: AudioParam, when: number, peak: number, attackS: number, decayS: number) {
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR), when + attackS);
  param.exponentialRampToValueAtTime(FLOOR, when + attackS + decayS);
}

function renderStrike(ctx: BaseAudioContext, s: StrikeRecipe, when: number, bus: AudioNode, gainScale: number) {
  const attackS = s.attackMs / 1000;
  let out: AudioNode = bus;
  if (s.lowpassHz) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(s.lowpassHz, when);
    lp.connect(bus);
    out = lp;
  }
  for (const p of s.partials) {
    const decayS = p.decayMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = s.wave;
    osc.frequency.setValueAtTime(p.freq, when);
    if (s.glide) osc.frequency.exponentialRampToValueAtTime(s.glide.toHz, when + s.glide.overMs / 1000);
    const g = ctx.createGain();
    envelope(g.gain, when, s.peak * p.amp * gainScale, attackS, decayS);
    osc.connect(g);
    g.connect(out);
    osc.start(when);
    osc.stop(when + attackS + decayS + STOP_PAD_S);
  }
  if (s.noise) {
    const n = s.noise;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, n.durMs);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(n.bandHz, when);
    bp.Q.setValueAtTime(n.q, when);
    const g = ctx.createGain();
    const durS = n.durMs / 1000;
    envelope(g.gain, when, n.gain * gainScale, Math.min(attackS, durS / 2), durS - Math.min(attackS, durS / 2));
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(when);
    src.stop(when + durS + STOP_PAD_S);
  }
}

/**
 * Schedule one cue at context time `when` (seconds) into `bus`. Times in the
 * past are clamped to `ctx.currentTime`. Never throws: an audio failure must
 * not break the player (e.g. a context closed underneath us).
 */
export function renderCue(ctx: BaseAudioContext, kind: CueKind, when: number, bus: AudioNode, gainScale = 1): void {
  try {
    const t0 = Math.max(when, ctx.currentTime);
    for (const { offsetMs, gainScale: g, strike } of RECIPES[kind].strikes) {
      renderStrike(ctx, strike, t0 + offsetMs / 1000, bus, gainScale * g);
    }
  } catch {
    /* audio is best-effort */
  }
}

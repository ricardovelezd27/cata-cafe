// Synthesis recipes for the four warm-up cues (hooks/useWarmupAudio.ts).
// Pure: no DOM, no window. `renderCue` only uses the BaseAudioContext API, so
// it runs against a fake context in tests and against a real AudioContext in
// the browser. Each sound has ONE meaning (lib/warmup/timelineTypes.ts):
//   campana — step start / turn      tic   — light tick (reps, hold end)
//   cuenco  — long bowl (arrive/closing)   doble — two strikes (step change)

import type { CueKind, HumContour } from "./timelineTypes";

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

// ── Hum ─────────────────────────────────────────────────────────────────
// The drone that carries each movement with the eyes closed:
// campana → hum → tic. Not a flat tone: a low fundamental doubled left/right
// with a small offset (a binaural-style beat on headphones, a slow throb on
// speakers), two soft overtones, a breath-slow swell, a hint of vibrato and
// a PITCH CONTOUR that follows the movement — it climbs a fourth on the way
// out, falls on the way back, undulates under the fast reps, and rises and
// falls with each inhale/exhale of the arrival. Level stays far below the
// cues so they still read as events.

export interface HumRecipe {
  /** Fundamental, Hz. 132 Hz sits near the "Om" 136 Hz relaxation drones. */
  readonly baseHz: number;
  /** Overtones as ratios of the fundamental (the fundamental itself is 1). */
  readonly partials: readonly { readonly ratio: number; readonly amp: number; readonly wave: OscillatorType }[];
  /** Left/right offset of the fundamental, Hz (theta-band beat). */
  readonly binauralHz: number;
  readonly lowpassHz: number;
  /** Steady level of the hum's gain node. */
  readonly peak: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  /** Slow amplitude swell: ±depth around peak at this rate. */
  readonly swell: { readonly hz: number; readonly depth: number };
  /** Gentle vibrato on every partial: ±depth (as a ratio) at this rate. */
  readonly vibrato: { readonly hz: number; readonly depth: number };
  /** Semitones travelled by "rise" / "fall", the ± span of "wave", and the
   *  span of one breath. */
  readonly span: { readonly leg: number; readonly wave: number; readonly breath: number };
  /** Breath timing of the arrival window (contour "breath"). */
  readonly breath: { readonly inMs: number; readonly outMs: number };
}

export const HUM: HumRecipe = {
  baseHz: 132,
  partials: [
    { ratio: 1, amp: 1, wave: "sine" },
    { ratio: 2, amp: 0.28, wave: "triangle" },
    { ratio: 1.5, amp: 0.14, wave: "sine" }, // the fifth, barely there
    { ratio: 3, amp: 0.06, wave: "sine" }, // shimmer
  ],
  binauralHz: 6,
  lowpassHz: 640,
  peak: 0.05,
  fadeInMs: 1500,
  fadeOutMs: 1200,
  swell: { hz: 0.1, depth: 0.012 },
  vibrato: { hz: 0.18, depth: 0.006 },
  span: { leg: 5, wave: 3, breath: 3 },
  breath: { inMs: 4000, outMs: 6000 },
};

const semis = (n: number) => Math.pow(2, n / 12);

/**
 * Pitch automation for one partial over [start, toS]: the contour as
 * exponential ramps (musically even), starting and ending on `base` so
 * consecutive windows never jump in pitch.
 */
function contourRamps(param: AudioParam, base: number, start: number, toS: number, contour: HumContour, r: HumRecipe) {
  const len = toS - start;
  param.setValueAtTime(base, start);
  switch (contour) {
    case "rise":
    case "fall": {
      const k = contour === "rise" ? semis(r.span.leg) : semis(-r.span.leg);
      param.setValueAtTime(base, start + len * 0.08);
      param.exponentialRampToValueAtTime(base * k, start + len * 0.92);
      return;
    }
    case "wave": {
      // Up, down past the base, back: one undulation per ~2.4 s.
      const period = 2.4;
      let t = start;
      while (t + period <= toS + 1e-6) {
        param.exponentialRampToValueAtTime(base * semis(r.span.wave), t + period * 0.25);
        param.exponentialRampToValueAtTime(base * semis(-r.span.wave), t + period * 0.75);
        param.exponentialRampToValueAtTime(base, t + period);
        t += period;
      }
      if (t < toS) param.exponentialRampToValueAtTime(base, toS);
      return;
    }
    case "breath": {
      const inS = r.breath.inMs / 1000;
      const outS = r.breath.outMs / 1000;
      let t = start;
      while (t + inS + outS <= toS + 1e-6) {
        param.exponentialRampToValueAtTime(base * semis(r.span.breath), t + inS);
        param.exponentialRampToValueAtTime(base, t + inS + outS);
        t += inS + outS;
      }
      return;
    }
    case "flat":
      return;
  }
}

/**
 * Schedule a hum from `fromS` to `toS` (context seconds) into `bus` with a
 * pitch `contour`. Windows shorter than the fades are shortened
 * proportionally; a window already in the past is skipped. Never throws.
 */
export function renderHum(
  ctx: BaseAudioContext,
  fromS: number,
  toS: number,
  bus: AudioNode,
  contour: HumContour = "flat",
  recipe: HumRecipe = HUM,
): void {
  try {
    const start = Math.max(fromS, ctx.currentTime);
    if (toS - start < 0.3) return;
    const len = toS - start;
    const fadeIn = Math.min(recipe.fadeInMs / 1000, len / 3);
    const fadeOut = Math.min(recipe.fadeOutMs / 1000, len / 3);
    const stopAt = toS + STOP_PAD_S;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(recipe.lowpassHz, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(recipe.peak, start + fadeIn);
    env.gain.setValueAtTime(recipe.peak, toS - fadeOut);
    env.gain.linearRampToValueAtTime(0, toS);
    lp.connect(env);
    env.connect(bus);

    // Breath-like swell: an LFO modulating the envelope gain around `peak`.
    const swell = ctx.createOscillator();
    swell.type = "sine";
    swell.frequency.setValueAtTime(recipe.swell.hz, start);
    const swellDepth = ctx.createGain();
    swellDepth.gain.setValueAtTime(recipe.swell.depth, start);
    swell.connect(swellDepth);
    swellDepth.connect(env.gain);
    swell.start(start);
    swell.stop(stopAt);

    // Vibrato: one LFO, fanned to every partial's frequency scaled by its pitch.
    const vib = ctx.createOscillator();
    vib.type = "sine";
    vib.frequency.setValueAtTime(recipe.vibrato.hz, start);
    vib.start(start);
    vib.stop(stopAt);

    // Stereo: the fundamental is doubled left/right `binauralHz` apart when
    // the context can pan; otherwise the pair is simply mixed (a slow beat).
    const canPan = typeof (ctx as BaseAudioContext & { createStereoPanner?: unknown }).createStereoPanner === "function";
    const voice = (hz: number, amp: number, wave: OscillatorType, pan: number | null) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      contourRamps(osc.frequency, hz, start, toS, contour, recipe);
      const vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(hz * recipe.vibrato.depth, start);
      vib.connect(vibDepth);
      vibDepth.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, start);
      osc.connect(g);
      if (pan !== null && canPan) {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(pan, start);
        g.connect(p);
        p.connect(lp);
      } else {
        g.connect(lp);
      }
      osc.start(start);
      osc.stop(stopAt);
    };

    for (const p of recipe.partials) {
      const hz = recipe.baseHz * p.ratio;
      if (p.ratio === 1) {
        voice(hz, p.amp * 0.62, p.wave, -0.6);
        voice(hz + recipe.binauralHz, p.amp * 0.62, p.wave, 0.6);
      } else {
        voice(hz, p.amp, p.wave, null);
      }
    }
  } catch {
    /* audio is best-effort */
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

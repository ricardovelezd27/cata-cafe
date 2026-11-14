import { describe, expect, it } from "vitest";
import {
  FALLBACK_VOICE_VOLUME,
  LIMITER,
  MIX,
  VOICE_LUFS,
  backgroundUnderVoiceDb,
  dbToGain,
  duckGainAt,
  duckingPlan,
  estimateSpeechMs,
  gainToDb,
  laneGain,
  laneGains,
  mergeSpeech,
  worstCasePeakDb,
  type MixLevels,
} from "@/lib/warmup/mix";
import { WARMUP_EXERCISES } from "@/lib/warmup/exercises";
import { AIR, HUM, RECIPES, TONES, airRmsDb, cueAttackRmsDb, humRmsDb, toneFor } from "@/lib/warmup/sounds";

const mix: MixLevels = { markersDb: -6, toneDb: -10, airDb: -20, duckDb: -8, duckAttackMs: 250, duckReleaseMs: 700 };
const ducked = dbToGain(-8);

describe("the committed mix stays inside the hard limits", () => {
  // These are the guard rails of lib/warmup/mix.ts MIX: whatever numbers are
  // chosen by ear, they must keep the voice on top and must not clip.
  it("while a line is spoken, the background sits at least 12 dB under the voice", () => {
    expect(backgroundUnderVoiceDb(MIX)).toBeLessThanOrEqual(-12);
  });

  it("the background is never louder than the voice, and ducking turns it DOWN", () => {
    expect(MIX.toneDb).toBeLessThanOrEqual(0);
    expect(MIX.airDb).toBeLessThanOrEqual(0);
    expect(MIX.duckDb).toBeLessThanOrEqual(0);
  });

  it("the bells are not louder than the voice", () => {
    expect(MIX.markersDb).toBeLessThanOrEqual(0);
  });

  it("the dip finishes before the first word and the return is not abrupt", () => {
    expect(MIX.duckAttackMs).toBeGreaterThanOrEqual(80);
    expect(MIX.duckAttackMs).toBeLessThanOrEqual(1000);
    expect(MIX.duckReleaseMs).toBeGreaterThanOrEqual(200);
    expect(MIX.duckReleaseMs).toBeLessThanOrEqual(3000);
  });

  it("headroom: everything at once, for every exercise's tone, stays within what the limiter absorbs cleanly (3 dB)", () => {
    for (const ex of WARMUP_EXERCISES) {
      expect(worstCasePeakDb(MIX, toneFor(ex.id)), ex.id).toBeLessThanOrEqual(3);
    }
  });

  it("without the voice, markers + tone + air never reach the limiter", () => {
    for (const ex of WARMUP_EXERCISES) {
      const g = laneGains(MIX, toneFor(ex.id));
      // Same sum as worstCasePeakDb, minus the voice, background NOT ducked.
      const voicePeak = dbToGain(-1.5);
      const withVoice = dbToGain(worstCasePeakDb({ ...MIX, duckDb: 0 }, toneFor(ex.id)));
      expect(gainToDb(withVoice - voicePeak * g.voice), ex.id).toBeLessThan(LIMITER.thresholdDb);
    }
  });
});

describe("lane gains place each source relative to the voice", () => {
  it("a source lands exactly relDb away from the voice", () => {
    const source = -30;
    expect(gainToDb(laneGain(-10, source)) + source).toBeCloseTo(VOICE_LUFS - 10, 6);
  });

  it("uses each recipe's own nominal level, so a retune keeps the sentence true", () => {
    const g = laneGains(mix);
    expect(gainToDb(g.markers) + cueAttackRmsDb("campana")).toBeCloseTo(VOICE_LUFS - 6, 6);
    expect(gainToDb(g.tone) + humRmsDb(HUM)).toBeCloseTo(VOICE_LUFS - 10, 6);
    expect(gainToDb(g.air) + airRmsDb(AIR)).toBeCloseTo(VOICE_LUFS - 20, 6);
    expect(g.voice).toBe(1);
    expect(g.ducked).toBeCloseTo(ducked, 9);
  });

  it("every exercise has a tone, and its level under the voice is the same for all five", () => {
    for (const ex of WARMUP_EXERCISES) {
      expect(TONES[ex.id], ex.id).toBeDefined();
      const tone = toneFor(ex.id);
      expect(gainToDb(laneGains(mix, tone).tone) + humRmsDb(tone), ex.id).toBeCloseTo(VOICE_LUFS - 10, 6);
    }
    expect(toneFor("nope")).toBe(HUM);
    expect(toneFor(null)).toBe(HUM);
  });
});

describe("ducking: the background lane is drawn ahead of the voice", () => {
  const line = [{ fromMs: 5000, toMs: 8000 }];

  it("rests at 1, is fully down exactly when the first word starts, and is back one release after the last", () => {
    expect(duckGainAt(line, 0, mix)).toBe(1);
    expect(duckGainAt(line, 5000 - 250, mix)).toBe(1);
    expect(duckGainAt(line, 5000 - 125, mix)).toBeCloseTo((1 + ducked) / 2, 9); // halfway down
    expect(duckGainAt(line, 5000, mix)).toBeCloseTo(ducked, 9);
    expect(duckGainAt(line, 6500, mix)).toBeCloseTo(ducked, 9);
    expect(duckGainAt(line, 8000, mix)).toBeCloseTo(ducked, 9);
    expect(duckGainAt(line, 8350, mix)).toBeCloseTo((1 + ducked) / 2, 9); // halfway up
    expect(duckGainAt(line, 8700, mix)).toBe(1);
    expect(duckGainAt(line, 20000, mix)).toBe(1);
  });

  it("no speech, no dip", () => {
    expect(duckingPlan([], 0, mix)).toEqual({ start: 1, points: [] });
    expect(duckGainAt([], 1234, mix)).toBe(1);
  });

  it("lines spoken in one breath keep the background down between them (no pumping)", () => {
    const close = [
      { fromMs: 5000, toMs: 6000 },
      { fromMs: 6000 + 700 + 250, toMs: 9000 }, // the return would just touch the next dip
      { fromMs: 15000, toMs: 16000 },
    ];
    expect(mergeSpeech(close, mix)).toEqual([
      { fromMs: 5000, toMs: 9000 },
      { fromMs: 15000, toMs: 16000 },
    ]);
    expect(duckGainAt(close, 6500, mix)).toBeCloseTo(ducked, 9);
    expect(duckGainAt(close, 12000, mix)).toBe(1);
  });

  it("sorts, drops empty windows and swallows a line inside another", () => {
    expect(
      mergeSpeech(
        [
          { fromMs: 9000, toMs: 9500 },
          { fromMs: 1000, toMs: 6000 },
          { fromMs: 2000, toMs: 3000 },
          { fromMs: 7000, toMs: 7000 },
        ],
        mix,
      ),
    ).toEqual([
      { fromMs: 1000, toMs: 6000 },
      { fromMs: 9000, toMs: 9500 },
    ]);
  });

  it("a plan that starts mid-run begins at the lane's value there and keeps only the points ahead", () => {
    const fromStart = duckingPlan(line, 0, mix);
    expect(fromStart.start).toBe(1);
    expect(fromStart.points).toEqual([
      { atMs: 4750, gain: 1 },
      { atMs: 5000, gain: ducked },
      { atMs: 8000, gain: ducked },
      { atMs: 8700, gain: 1 },
    ]);
    const midLine = duckingPlan(line, 6000, mix);
    expect(midLine.start).toBeCloseTo(ducked, 9);
    expect(midLine.points.map((p) => p.atMs)).toEqual([8000, 8700]);
    const midDip = duckingPlan(line, 4875, mix);
    expect(midDip.start).toBeCloseTo((1 + ducked) / 2, 9);
    expect(midDip.points[0]).toEqual({ atMs: 5000, gain: ducked });
    expect(duckingPlan(line, 9000, mix)).toEqual({ start: 1, points: [] });
  });

  it("the plan's points are in time order and the lane never leaves [ducked, 1]", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ fromMs: 3000 + i * 4100, toMs: 3000 + i * 4100 + 1500 + (i % 3) * 900 }));
    const plan = duckingPlan(many, 0, mix);
    for (let i = 1; i < plan.points.length; i++) expect(plan.points[i].atMs).toBeGreaterThanOrEqual(plan.points[i - 1].atMs);
    for (let t = 0; t < 60000; t += 137) {
      const g = duckGainAt(many, t, mix);
      expect(g).toBeGreaterThanOrEqual(ducked - 1e-9);
      expect(g).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("estimateSpeechMs (the phone's own voice, fallback only)", () => {
  it("is zero for nothing and grows with the words and the sentence ends", () => {
    expect(estimateSpeechMs("")).toBe(0);
    expect(estimateSpeechMs("   ")).toBe(0);
    expect(estimateSpeechMs("Para.")).toBe(350 + 420 + 250);
    expect(estimateSpeechMs("Cierra los ojos. Sube el brazo.")).toBe(350 + 6 * 420 + 2 * 250);
    expect(estimateSpeechMs("uno dos tres cuatro")).toBeLessThan(estimateSpeechMs("uno dos tres cuatro cinco"));
  });
});

// ── How loud each sound is TO THE EAR ─────────────────────────────────────
// The mix was set by measurement (nobody could listen before it shipped), so
// the measurements are kept here as tests. Levels are A-weighted (the ear is
// far less sensitive to low notes at quiet levels), on full-range playback
// and through a small-speaker model: a 400 Hz 12 dB/octave high-pass, roughly
// a phone speaker.
describe("perceived levels of the committed mix", () => {
  const aWeight = (f: number) => {
    const f2 = f * f;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    return 20 * Math.log10(ra) + 2.0;
  };
  const highPass = (f: number, fc: number) => 10 * Math.log10((f / fc) ** 4 / (1 + (f / fc) ** 4));
  const lowPass = (f: number, fc: number) => 10 * Math.log10(1 / (1 + (f / fc) ** 4));
  const PHONE_HZ = 400;
  type Partial_ = { f: number; a: number };
  const heard = (ps: Partial_[], phone: boolean, lowpassHz?: number) =>
    10 *
    Math.log10(
      ps.reduce((sum, p) => sum + (p.a ** 2 / 2) * 10 ** ((aWeight(p.f) + (phone ? highPass(p.f, PHONE_HZ) : 0) + (lowpassHz ? lowPass(p.f, lowpassHz) : 0)) / 10), 0),
    );
  const bell = (): Partial_[] => {
    const s = RECIPES.campana.strikes[0].strike;
    return s.partials.map((p) => ({ f: p.freq, a: s.peak * p.amp }));
  };
  const toneParts = (r: typeof HUM): Partial_[] =>
    r.partials.flatMap((p) =>
      p.ratio === 1
        ? [
            { f: r.baseHz, a: r.peak * p.amp * 0.62 },
            { f: r.baseHz + r.binauralHz, a: r.peak * p.amp * 0.62 },
          ]
        : [{ f: r.baseHz * p.ratio, a: r.peak * p.amp }],
    );
  /** The tone before the 2026-11 retune, at the level it played at (gain 1). */
  const OLD_TONE: typeof HUM = {
    ...HUM,
    baseHz: 132,
    binauralHz: 6,
    lowpassHz: 640,
    partials: [
      { ratio: 1, amp: 1, wave: "sine" },
      { ratio: 2, amp: 0.28, wave: "triangle" },
      { ratio: 1.5, amp: 0.14, wave: "sine" },
      { ratio: 3, amp: 0.06, wave: "sine" },
    ],
  };
  const airHeard = (phone: boolean) => airRmsDb(AIR) + aWeight(AIR.bandHz) + (phone ? highPass(AIR.bandHz, PHONE_HZ) : 0);
  const levels = (id: string, phone: boolean) => {
    const tone = toneFor(id);
    const g = laneGains(MIX, tone);
    return {
      bell: heard(bell(), phone) + gainToDb(g.markers),
      tone: heard(toneParts(tone), phone, tone.lowpassHz) + gainToDb(g.tone),
      air: airHeard(phone) + gainToDb(g.air),
    };
  };

  it("the old tone really was lost on a phone speaker: over 30 dB under the bell", () => {
    expect(heard(bell(), true) - heard(toneParts(OLD_TONE), true, 640)).toBeGreaterThan(30);
  });

  it("on a phone speaker every exercise's tone is at least 8 dB more present than the old one was", () => {
    const old = heard(toneParts(OLD_TONE), true, 640);
    for (const ex of WARMUP_EXERCISES) expect(levels(ex.id, true).tone - old, ex.id).toBeGreaterThanOrEqual(8);
  });

  it("the bell still reads as an event: its strike is 14 to 26 dB above the tone, on both kinds of playback", () => {
    for (const ex of WARMUP_EXERCISES) {
      for (const phone of [false, true]) {
        const l = levels(ex.id, phone);
        expect(l.bell - l.tone, `${ex.id} phone=${phone}`).toBeGreaterThanOrEqual(14);
        expect(l.bell - l.tone, `${ex.id} phone=${phone}`).toBeLessThanOrEqual(26);
      }
    }
  });

  it("the air stays under the tone (at least 6 dB) on both kinds of playback", () => {
    for (const ex of WARMUP_EXERCISES) {
      for (const phone of [false, true]) {
        const l = levels(ex.id, phone);
        expect(l.tone - l.air, `${ex.id} phone=${phone}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("the bells did not get much quieter than people know them (within 6 dB of the level before the mixer)", () => {
    const drop = -gainToDb(laneGains(MIX).markers);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(drop).toBeLessThanOrEqual(6);
  });

  it("the phone's own voice is turned down by what the bells were turned down (within 1 dB)", () => {
    expect(Math.abs(gainToDb(FALLBACK_VOICE_VOLUME) - gainToDb(laneGains(MIX).markers))).toBeLessThanOrEqual(1);
  });
});

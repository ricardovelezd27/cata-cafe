import { describe, expect, it } from "vitest";
import { WARMUP_EXERCISES, warmupById } from "@/lib/warmup/exercises";
import {
  buildExerciseTimeline,
  poseAt,
  readBeatMs,
  segmentAt,
  segmentRemainingSec,
  sequenceMap,
  stepSegments,
  timelineTotalMs,
} from "@/lib/warmup/timeline";
import type { ExerciseTimeline, Segment } from "@/lib/warmup/timelineTypes";

const ex1 = warmupById("arm-raise")!;
const ex3 = warmupById("head-rotate")!;

type Row = [kind: Segment["kind"], t0: number, dur: number, from: number, to: number, label: string, cue?: string];

/** Compact view of a timeline's segments for golden comparisons. */
function rows(tl: ExerciseTimeline, fromIdx = 0, count = Infinity): Row[] {
  return tl.segments.slice(fromIdx, fromIdx + count).map((s) => {
    const r: Row = [s.kind, s.t0Ms, s.durMs, s.from.a, s.to.a, s.label];
    if (s.cueAtStart) r.push(s.cueAtStart);
    return r;
  });
}

describe("read beat", () => {
  it("clamps 3 + 0.25 × max(es, en) words to [4, 12] s", () => {
    expect(readBeatMs(ex1.steps[0])).toBe(5750); // 11 words
    expect(readBeatMs(ex1.steps[2])).toBe(0); // readDuringPrevAtSec
    expect(readBeatMs(ex3.steps[0])).toBe(9500); // 26 words (es)
    const long = { ...ex1.steps[0], text: { es: "a ".repeat(60), en: "a" } };
    expect(readBeatMs(long)).toBe(12000);
    const short = { ...ex1.steps[0], text: { es: "a", en: "a" } };
    expect(readBeatMs(short)).toBe(4000);
  });
});

describe("golden fixture A — ex 1 El brazo lento (library)", () => {
  const tl = buildExerciseTimeline(ex1, { mode: "library" });
  it("has the arrive block of 40 s", () => {
    expect(tl.arriveMs).toBe(40000);
    expect(rows(tl, 0, 3)).toEqual([
      ["arrive", 0, 6000, 0, 0, "arrive"],
      ["arrive", 6000, 30000, 0, 0, "arrive"],
      ["arrive", 36000, 4000, 0, 0, "arrive"],
    ]);
  });
  it("matches the animator's step rows (with s3's read beat folded into s2)", () => {
    expect(rows(tl, 3)).toEqual([
      ["read", 40000, 5750, 0, 0, "upNext"],
      ["lead-in", 45750, 400, 0, 0, "fast", "campana"],
      ["reps", 46150, 2100, 0, 0, "fast"],
      ["still", 48250, 5500, 0, 0, "still", "tic"],
      ["read", 53750, 6500, 0, 0, "upNext"],
      ["out", 60250, 15000, 0, 1, "up", "campana"],
      ["rest", 75250, 10000, 1, 1, "still", "tic"], // s3: no read beat (shown during s2 at 5 s)
      ["read", 85250, 5500, 1, 1, "upNext"],
      ["out", 90750, 15000, 1, 0, "down", "campana"],
      ["read", 105750, 5250, 0, 0, "upNext", "tic"],
      ["out", 111000, 15000, 0, 1, "up", "campana"],
      ["read", 126000, 2750, 1, 1, "upNext", "tic"],
      ["hold", 128750, 3000, 1, 1, "hold"],
      ["out", 131750, 15000, 1, 0, "down", "campana"],
      ["closing", 146750, 30000, 0, 0, "closing", "cuenco"],
    ]);
    expect(tl.totalMs).toBe(176750);
    expect(tl.cues.at(-1)).toEqual({ atMs: 176750, kind: "doble", segIdx: tl.segments.length - 1 });
  });
  it("shows s3's text during s2 from 5 s until s3 starts", () => {
    expect(tl.secondaryTexts).toEqual([{ stepIdx: 2, fromMs: 65250, untilMs: 75250 }]);
  });
  it("session mode appends the 5 s bridge with the doble campana", () => {
    const s = buildExerciseTimeline(ex1, { mode: "session" });
    expect(s.bridgeAt).toBe(176750);
    expect(s.totalMs).toBe(181750);
    expect(s.segments.at(-1)).toMatchObject({ kind: "bridge", cueAtStart: "doble" });
    expect(s.cues.filter((c) => c.kind === "doble")).toHaveLength(1);
  });
});

describe("golden fixture B — ex 3 La cabeza, steps 1–4", () => {
  const tl = buildExerciseTimeline(ex3, { mode: "library" });
  it("goes extreme to extreme and starts each step where the previous ended", () => {
    expect(rows(tl, 3, 14)).toEqual([
      ["read", 40000, 9500, 0, 0, "upNext"],
      ["lead-in", 49500, 400, 0, 0, "fast", "campana"],
      ["reps", 49900, 4800, 0, 0, "fast"],
      ["still", 54700, 6800, 0, 0, "still", "tic"],
      ["read", 61500, 8000, 0, 0, "upNext"],
      ["out", 69500, 15000, 0, 1, "right", "campana"],
      ["hold", 84500, 3000, 1, 1, "hold", "tic"],
      ["back", 87500, 15000, 1, -1, "left", "campana"],
      ["read", 102500, 5250, -1, -1, "upNext", "tic"],
      ["out", 107750, 15000, -1, 1, "right", "campana"],
      ["hold", 122750, 3000, 1, 1, "hold", "tic"],
      ["back", 125750, 15000, 1, -1, "left", "campana"],
      ["read", 140750, 4750, -1, -1, "upNext", "tic"],
      ["cross", 145500, 7000, -1, 0, "center", "campana"],
    ]);
  });
  it("steps 5–6 (returns) come back to centre with the 'return' chrome cue", () => {
    const back5 = tl.segments.filter((s) => s.stepIdx === 4 && s.kind === "back")[0];
    expect(back5.to.a).toBe(0);
    expect(back5.chromeCue).toBe("return");
    const back2 = tl.segments.filter((s) => s.stepIdx === 1 && s.kind === "back")[0];
    expect(back2.chromeCue).toBe("otherSide");
  });
});

describe("timeline invariants (all five exercises, both modes)", () => {
  for (const ex of WARMUP_EXERCISES) {
    for (const mode of ["library", "session"] as const) {
      const tl = buildExerciseTimeline(ex, { mode });
      it(`${ex.id} / ${mode}: segments are contiguous and sum to totalMs`, () => {
        let t = 0;
        for (const s of tl.segments) {
          expect(s.t0Ms).toBe(t);
          expect(s.durMs).toBeGreaterThan(0);
          t += s.durMs;
        }
        expect(t).toBe(tl.totalMs);
      });
      it(`${ex.id} / ${mode}: each step's non-read time equals durationSec`, () => {
        ex.steps.forEach((step, i) => {
          const own = tl.segments.filter((s) => s.stepIdx === i && s.kind !== "read" && !(s.kind === "cross" && s.label === "upNext"));
          const ms = own.reduce((a, s) => a + s.durMs, 0);
          expect(ms, step.id).toBe(step.durationSec * 1000);
        });
      });
      it(`${ex.id} / ${mode}: continuity — every segment starts where the previous ended`, () => {
        for (let i = 1; i < tl.segments.length; i++) {
          const prev = tl.segments[i - 1];
          const cur = tl.segments[i];
          expect(cur.from.a, `${cur.kind}@${cur.t0Ms}`).toBeCloseTo(prev.to.a, 5);
          expect(cur.from.b ?? 0).toBeCloseTo(prev.to.b ?? 0, 5);
        }
      });
      it(`${ex.id} / ${mode}: cues are monotonic, one campana per movement, closing has cuenco`, () => {
        for (let i = 1; i < tl.cues.length; i++) expect(tl.cues[i].atMs).toBeGreaterThanOrEqual(tl.cues[i - 1].atMs);
        const moving = tl.segments.filter((s) => ["out", "back", "reps"].includes(s.kind) || (s.kind === "cross" && s.label !== "upNext"));
        const campanas = tl.cues.filter((c) => c.kind === "campana").length;
        expect(campanas).toBe(moving.length);
        expect(tl.segments.find((s) => s.kind === "closing")?.cueAtStart).toBe("cuenco");
        expect(tl.cues.filter((c) => c.kind === "doble")).toHaveLength(1);
      });
      it(`${ex.id} / ${mode}: stepStart/stepEnd bracket each step`, () => {
        ex.steps.forEach((_, i) => {
          const own = tl.segments.filter((s) => s.stepIdx === i);
          expect(own[0].t0Ms).toBe(tl.stepStart[i]);
          expect(own.at(-1)!.t0Ms + own.at(-1)!.durMs).toBe(tl.stepEnd[i]);
        });
        expect(tl.closingAt).toBe(tl.stepEnd.at(-1));
      });
    }
  }
  it("totals are locale independent and within 1.3× Kim's minutes", () => {
    for (const ex of WARMUP_EXERCISES) {
      const total = timelineTotalMs(ex);
      expect(total).toBeLessThanOrEqual(ex.durationMin * 60 * 1000 * 1.3);
      expect(total).toBeGreaterThan(120000);
    }
  });
  it("snapshot of the five library totals (ms)", () => {
    expect(WARMUP_EXERCISES.map((ex) => [ex.id, timelineTotalMs(ex)])).toMatchInlineSnapshot(`
      [
        [
          "arm-raise",
          176750,
        ],
        [
          "eyes",
          288250,
        ],
        [
          "head-rotate",
          322750,
        ],
        [
          "trunk-forward-back",
          364000,
        ],
        [
          "trunk-side",
          350250,
        ],
      ]
    `);
  });
});

describe("small amplitude continuity (ex 5 De lado a lado)", () => {
  const tl = buildExerciseTimeline(warmupById("trunk-side")!, { mode: "library" });
  it("crosses silently from −1 to −0.18 inside step 3's read beat, then moves ±0.18", () => {
    const s3 = tl.segments.filter((s) => s.stepIdx === 2);
    expect(s3.map((s) => s.kind)).toEqual(["read", "cross", "out", "hold", "back"]);
    expect(s3[1]).toMatchObject({ durMs: 3000, from: { a: -1 }, to: { a: -0.18 }, label: "upNext" });
    expect(s3[1].cueAtStart).toBeUndefined();
    expect(s3[2].to.a).toBeCloseTo(0.18);
    expect(s3[4].to.a).toBeCloseTo(-0.18);
  });
  it("step 4 (returns, full amplitude) starts from −0.18 and ends at centre", () => {
    const s4 = tl.segments.filter((s) => s.stepIdx === 3);
    expect(s4[0].kind).toBe("read");
    expect(s4[1]).toMatchObject({ kind: "out", from: { a: -0.18 }, to: { a: 1 } });
    expect(s4.at(-1)).toMatchObject({ kind: "back", to: { a: 0 }, chromeCue: "return" });
  });
});

describe("ex 4 step 8 lead-ins and ex 2 eyes", () => {
  it("adelante-atrás s8: 3 s intention before each 12 s leg, return labelled CENTRO", () => {
    const tl = buildExerciseTimeline(warmupById("trunk-forward-back")!, { mode: "library" });
    const s8 = tl.segments.filter((s) => s.stepIdx === 7);
    expect(s8.map((s) => [s.kind, s.durMs, s.label])).toEqual([
      ["read", 8000, "upNext"],
      ["lead-in", 3000, "still"],
      ["out", 12000, "forward"],
      ["hold", 3000, "hold"],
      ["lead-in", 3000, "still"],
      ["back", 12000, "center"],
    ]);
    expect(s8[1].cueAtStart).toBe("campana");
    expect(s8[2].cueAtStart).toBeUndefined();
    expect(s8[2].to.a).toBeCloseTo(0.18);
  });
  it("ojos: eyes-2 is a plain 15 s leg, eyes-3 folds its hold into a 1 s read + 3 s PARA", () => {
    const tl = buildExerciseTimeline(warmupById("eyes")!, { mode: "library" });
    const s2 = tl.segments.filter((s) => s.stepIdx === 1);
    expect(s2.map((s) => [s.kind, s.durMs])).toEqual([
      ["read", 8500],
      ["out", 15000],
    ]);
    const s3 = tl.segments.filter((s) => s.stepIdx === 2);
    expect(s3.map((s) => [s.kind, s.durMs, s.cueAtStart ?? null])).toEqual([
      ["read", 1000, "tic"],
      ["hold", 3000, null],
      ["cross", 10000, "campana"],
    ]);
    const s5 = tl.segments.filter((s) => s.stepIdx === 4);
    expect(s5[1]).toMatchObject({ kind: "out", to: { a: 0, b: -1 }, label: "up" });
    expect(s5.at(-1)).toMatchObject({ kind: "back", to: { a: 0, b: 0 }, label: "center" });
  });
});

describe("lookups", () => {
  const tl = buildExerciseTimeline(ex1, { mode: "library" });
  it("segmentAt / poseAt / remaining", () => {
    expect(segmentAt(tl, -5)).toEqual({ i: 0, u: 0 });
    expect(segmentAt(tl, 60250 + 7500)).toEqual({ i: 8, u: 0.5 });
    expect(poseAt(tl, 60250).a).toBeCloseTo(0, 3);
    expect(poseAt(tl, 60250 + 7500).a).toBeCloseTo(0.5, 2);
    expect(poseAt(tl, 75250).a).toBeCloseTo(1, 3);
    expect(poseAt(tl, 80000).a).toBe(1); // rest holds the top
    expect(segmentAt(tl, 10_000_000).i).toBe(tl.segments.length - 1);
    expect(segmentRemainingSec(tl, 60250 + 7500)).toBe(8);
  });
  it("reps return to the start pose and peak mid-cycle", () => {
    const reps = tl.segments.find((s) => s.kind === "reps")!;
    expect(poseAt(tl, reps.t0Ms).a).toBeCloseTo(0, 5);
    expect(poseAt(tl, reps.t0Ms + 1000).a).toBeCloseTo(1, 2);
    expect(poseAt(tl, reps.t0Ms + reps.durMs - 1).a).toBeCloseTo(0, 2);
  });
  it("stepSegments returns the whole step for the bar", () => {
    const { first, segments } = stepSegments(tl, 8);
    expect(first).toBe(7);
    expect(segments.map((s) => s.kind)).toEqual(["read", "out"]);
    expect(stepSegments(tl, 1).segments.map((s) => s.arrivePhase)).toEqual(["posture", "breath", "notice"]);
  });
  it("whispers are timed from the first movement segment", () => {
    // observeAt[0] = arm-raise-4 @ 9 s → out starts at 90750
    expect(tl.whispers[0]).toEqual({ observeIdx: 0, fromMs: 99750, untilMs: 105750 });
    expect(tl.whispers.at(-1)).toEqual({ observeIdx: 2, fromMs: 146750 + 8000, untilMs: 146750 + 16000 });
    expect(tl.breathHintStepIdx).toBe(1);
  });
  it("sequenceMap collapses repeated directions", () => {
    const labels = Object.fromEntries(
      ["up", "down", "right", "left", "forward", "back", "center", "hold", "still", "fast", "upNext", "arrive", "closing", "bridge"].map((k) => [k, k.toUpperCase()]),
    ) as Record<string, string>;
    expect(sequenceMap(ex3, "es", labels as never)).toEqual(["FAST", "RIGHT", "CENTER", "RIGHT", "CENTER"]);
  });
});

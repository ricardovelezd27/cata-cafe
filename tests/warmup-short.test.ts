// S10 WP7: the short version (Kim F4 / B7) and the "Poco espacio" option (Kim F5).
// The full timeline's own fixtures live in warmup-timeline.test.ts and must not
// change; this file pins the NEW paths.
import { describe, expect, it } from "vitest";
import { WARMUP_EXERCISES, WARMUP_SHORT_STEP_BUDGET_SEC, warmupById } from "@/lib/warmup/exercises";
import { SMALL_AMPLITUDE, buildExerciseTimeline, exerciseForLength, poseInSegment, shortStepCount, timelineTotalMs } from "@/lib/warmup/timeline";
import { ARRIVE_PLAN_SHORT, arrivePhaseAt } from "@/lib/warmup/breath";
import type { ExerciseTimeline, Segment } from "@/lib/warmup/timelineTypes";

const ex1 = warmupById("arm-raise")!;

type Row = [kind: Segment["kind"], t0: number, dur: number, from: number, to: number, label: string, cue: string | null];
const rows = (tl: ExerciseTimeline): Row[] =>
  tl.segments.map((s) => [s.kind, s.t0Ms, s.durMs, s.from.a, s.to.a, s.label, s.cueAtStart ?? null]);

describe("short version: 1 to 2 minutes for every exercise", () => {
  for (const ex of WARMUP_EXERCISES) {
    for (const mode of ["library", "session"] as const) {
      it(`${ex.id} / ${mode}: total lands between 60 s and 120 s`, () => {
        const tl = buildExerciseTimeline(ex, { mode, length: "short" });
        expect(tl.totalMs).toBeGreaterThanOrEqual(60_000);
        expect(tl.totalMs).toBeLessThanOrEqual(120_000);
        expect(timelineTotalMs(ex, mode, "short")).toBe(tl.totalMs);
      });
    }
  }

  it("totals of the five exercises (library), pinned", () => {
    expect(WARMUP_EXERCISES.map((e) => [e.id, shortStepCount(e), timelineTotalMs(e, "library", "short")])).toEqual([
      ["arm-raise", 4, 100250],
      ["eyes", 3, 101000],
      ["head-rotate", 2, 94000],
      ["trunk-forward-back", 2, 93500],
      ["trunk-side", 2, 94750],
    ]);
  });

  it("is the first steps only, in order, never half a step, within the step budget, at least one", () => {
    for (const ex of WARMUP_EXERCISES) {
      const k = shortStepCount(ex);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(ex.steps.length);
      const full = buildExerciseTimeline(ex, { mode: "library" });
      const used = full.stepEnd[k - 1] - full.stepStart[0];
      if (k > 1) expect(used).toBeLessThanOrEqual(WARMUP_SHORT_STEP_BUDGET_SEC * 1000);
      // the next step would not have fit
      if (k < ex.steps.length) expect(full.stepEnd[k] - full.stepStart[0]).toBeGreaterThan(WARMUP_SHORT_STEP_BUDGET_SEC * 1000);
      const kept = exerciseForLength(ex, "short");
      expect(kept.steps.map((s) => s.id)).toEqual(ex.steps.slice(0, k).map((s) => s.id));
      expect(exerciseForLength(ex, "full")).toBe(ex);
      // idempotent: a prefix keeps all of itself
      expect(shortStepCount(kept)).toBe(k);
    }
  });

  it("keeps at least one step even when the first step alone is over the budget", () => {
    const long = { ...ex1, steps: [{ ...ex1.steps[0], durationSec: 200 }, ...ex1.steps.slice(1)] };
    expect(shortStepCount(long)).toBe(1);
  });

  describe("golden fixture: ex 1 El brazo lento (short, library)", () => {
    const tl = buildExerciseTimeline(ex1, { mode: "library", length: "short" });
    it("posture 5 s + ONE breath cycle 10 s, the first four steps, a 15 s closing", () => {
      expect(rows(tl)).toEqual([
        ["arrive", 0, 5000, 0, 0, "arrive", null],
        ["arrive", 5000, 10000, 0, 0, "arrive", "campana"],
        ["read", 15000, 8250, 0, 0, "upNext", "tic"], // the tic that ends the breaths (no notice beat)
        ["lead-in", 23250, 400, 0, 0, "fast", "campana"],
        ["reps", 23650, 2100, 0, 0, "fast", null],
        ["still", 25750, 5500, 0, 0, "still", "tic"],
        ["read", 31250, 7750, 0, 0, "upNext", null],
        ["out", 39000, 15000, 0, 1, "up", "campana"],
        ["rest", 54000, 10000, 1, 1, "still", "tic"],
        ["read", 64000, 6250, 1, 1, "upNext", null],
        ["out", 70250, 15000, 1, 0, "down", "campana"],
        ["closing", 85250, 15000, 0, 0, "closing", "cuenco"],
      ]);
      expect(tl.arriveMs).toBe(15000);
      expect(tl.closingAt).toBe(85250);
      expect(tl.totalMs).toBe(100250);
      expect(tl.stepStart).toEqual([15000, 31250, 54000, 64000]);
      expect(tl.stepEnd).toEqual([31250, 54000, 64000, 85250]);
    });
    it("cues, hums and narrations come from the same code paths", () => {
      expect(tl.cues.map((c) => [c.atMs, c.kind])).toEqual([
        [5000, "campana"],
        [15000, "tic"],
        [23250, "campana"],
        [25750, "tic"],
        [39000, "campana"],
        [54000, "tic"],
        [70250, "campana"],
        [85250, "cuenco"],
        [100250, "doble"],
      ]);
      expect(tl.hums.map((h) => [h.fromMs, h.toMs, h.contour])).toEqual([
        [5000, 15000, "breath"],
        [23250, 25750, "wave"],
        [39000, 54000, "rise"],
        [54000, 64000, "flat"],
        [70250, 85250, "fall"],
      ]);
      expect(tl.narrations.map((n) => [n.atMs, n.source.kind])).toEqual([
        [0, "arrive"],
        [5000, "breath"],
        [9000, "breath"],
        [15000, "step"],
        [23250, "label"],
        [25750, "label"],
        [31250, "step"],
        [39000, "label"],
        [44000, "step"],
        [54000, "label"],
        [64000, "step"],
        [70250, "label"],
        [85250, "closing"],
        [96250, "closingOpen"],
      ]);
      // steps 5-6 are not part of the short run: their whispers do not exist
      expect(tl.whispers.map((w) => w.observeIdx)).toEqual([0, 2]);
      expect(tl.whispers.every((w) => w.untilMs <= tl.totalMs)).toBe(true);
    });
    it("session mode appends the 5 s bridge as usual", () => {
      const s = buildExerciseTimeline(ex1, { mode: "session", length: "short" });
      expect(s.bridgeAt).toBe(100250);
      expect(s.totalMs).toBe(105250);
      expect(s.cues.filter((c) => c.kind === "doble")).toHaveLength(1);
    });
  });

  it("the arrival is tied to the breath plan: no notice beat, phases follow the short plan", () => {
    expect(arrivePhaseAt(2000, ARRIVE_PLAN_SHORT).phase).toBe("posture");
    expect(arrivePhaseAt(7000, ARRIVE_PLAN_SHORT).phase).toBe("breath");
    expect(arrivePhaseAt(14999, ARRIVE_PLAN_SHORT).cycle).toBe(0);
    for (const ex of WARMUP_EXERCISES) {
      const tl = buildExerciseTimeline(ex, { mode: "library", length: "short" });
      expect(tl.segments.filter((s) => s.arrivePhase === "notice")).toHaveLength(0);
      expect(tl.segments.filter((s) => s.kind === "arrive").map((s) => s.durMs)).toEqual([5000, 10000]);
    }
  });

  it("the default (and an explicit 'full') is byte-identical to the run without options", () => {
    for (const ex of WARMUP_EXERCISES) {
      for (const mode of ["library", "session"] as const) {
        const a = JSON.stringify(buildExerciseTimeline(ex, { mode }));
        expect(JSON.stringify(buildExerciseTimeline(ex, { mode, length: "full" }))).toBe(a);
        expect(JSON.stringify(buildExerciseTimeline(ex, { mode, length: "full", compact: false }))).toBe(a);
      }
    }
  });
});

describe('"Poco espacio" (compact): same timing, smaller movement', () => {
  for (const ex of WARMUP_EXERCISES) {
    for (const length of ["full", "short"] as const) {
      it(`${ex.id} / ${length}: durations, cues, hums and narrations are identical with the option on or off`, () => {
        const off = buildExerciseTimeline(ex, { mode: "library", length });
        const on = buildExerciseTimeline(ex, { mode: "library", length, compact: true });
        expect(on.totalMs).toBe(off.totalMs);
        expect(on.segments.map((s) => [s.kind, s.t0Ms, s.durMs, s.label, s.cueAtStart ?? null])).toEqual(
          off.segments.map((s) => [s.kind, s.t0Ms, s.durMs, s.label, s.cueAtStart ?? null]),
        );
        expect(on.cues).toEqual(off.cues);
        expect(on.hums).toEqual(off.hums);
        expect(on.narrations).toEqual(off.narrations);
        expect(on.stepStart).toEqual(off.stepStart);
        expect(on.stepEnd).toEqual(off.stepEnd);
      });
    }
    it(`${ex.id}: every drawn pose stays within the small amplitude`, () => {
      const tl = buildExerciseTimeline(ex, { mode: "library", compact: true });
      for (const s of tl.segments) {
        for (const p of [s.from, s.to]) {
          expect(Math.abs(p.a)).toBeLessThanOrEqual(SMALL_AMPLITUDE + 1e-9);
          expect(Math.abs(p.b ?? 0)).toBeLessThanOrEqual(SMALL_AMPLITUDE + 1e-9);
        }
        if (s.kind === "reps") expect(s.reps?.amp).toBe(SMALL_AMPLITUDE);
      }
    });
  }

  it("the fast reps are scaled too (the wave never exceeds the small amplitude)", () => {
    const tl = buildExerciseTimeline(ex1, { mode: "library", compact: true });
    const reps = tl.segments.find((s) => s.kind === "reps")!;
    let max = 0;
    for (let ms = 0; ms <= reps.durMs; ms += 50) max = Math.max(max, poseInSegment(reps, ms, ms / reps.durMs).a);
    expect(max).toBeGreaterThan(0.1);
    expect(max).toBeLessThanOrEqual(SMALL_AMPLITUDE + 1e-9);
    // and full keeps its wave (no amp field)
    expect(buildExerciseTimeline(ex1, { mode: "library" }).segments.find((s) => s.kind === "reps")?.reps?.amp).toBeUndefined();
  });

  it("the silent amplitude cross of ex 5 step 3 (full → small) is kept, so its 3 s are not lost", () => {
    const ex5 = warmupById("trunk-side")!;
    const off = buildExerciseTimeline(ex5, { mode: "library" });
    const on = buildExerciseTimeline(ex5, { mode: "library", compact: true });
    expect(off.segments.some((s) => s.kind === "cross" && s.label === "upNext")).toBe(true);
    expect(on.segments.some((s) => s.kind === "cross" && s.label === "upNext")).toBe(true);
    expect(on.totalMs).toBe(off.totalMs);
  });

  it("the seated substitution exists only for the standing exercise and fits a spoken line", () => {
    for (const ex of WARMUP_EXERCISES) {
      if (ex.posture === "standing") {
        expect(ex.seated).toBeDefined();
        for (const t of [ex.seated!.postureText, ex.seated!.arrivePosture]) {
          for (const l of ["es", "en"] as const) expect(t[l].trim().split(/\s+/).length).toBeLessThanOrEqual(32);
        }
      } else {
        expect(ex.seated).toBeUndefined();
      }
    }
  });
});

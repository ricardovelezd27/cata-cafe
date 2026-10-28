import { describe, expect, it } from "vitest";
import {
  WARMUP_EXERCISES,
  WARMUP_IDS,
  WARMUP_SHARED,
  isWarmupId,
  warmupById,
  warmupBySlug,
} from "@/lib/warmup/exercises";

describe("warm-up content (Movimiento Sensorial)", () => {
  it("has exactly five exercises, ordered 1..5, one per figure kind", () => {
    expect(WARMUP_EXERCISES).toHaveLength(5);
    expect(WARMUP_EXERCISES.map((e) => e.order)).toEqual([1, 2, 3, 4, 5]);
    expect(WARMUP_EXERCISES.map((e) => e.id)).toEqual([...WARMUP_IDS]);
    expect(new Set(WARMUP_EXERCISES.map((e) => e.figureKind)).size).toBe(5);
  });

  it("every exercise closes with the same two questions", () => {
    for (const ex of WARMUP_EXERCISES) {
      expect(ex.closing).toHaveLength(2);
      expect(ex.closing[0]).toEqual(WARMUP_SHARED.closing.questions[0]);
      expect(ex.closing[1]).toEqual(WARMUP_SHARED.closing.questions[1]);
    }
  });

  it("step ids are unique across all exercises and slugs/ids are unique", () => {
    const stepIds = WARMUP_EXERCISES.flatMap((e) => e.steps.map((s) => s.id));
    expect(new Set(stepIds).size).toBe(stepIds.length);
    expect(new Set(WARMUP_EXERCISES.map((e) => e.slug)).size).toBe(5);
    expect(new Set(WARMUP_EXERCISES.map((e) => e.id)).size).toBe(5);
  });

  it("step durations are positive and each figure matches its exercise", () => {
    for (const ex of WARMUP_EXERCISES) {
      expect(ex.steps.length).toBeGreaterThan(0);
      for (const s of ex.steps) {
        expect(s.durationSec).toBeGreaterThan(0);
        expect(s.figure.kind).toBe(ex.figureKind);
      }
    }
  });

  it("v3 timing metadata is coherent (observeAt, readDuringPrevAtSec, reps)", () => {
    for (const ex of WARMUP_EXERCISES) {
      expect(ex.observeAt).toHaveLength(ex.observe.length);
      const ids = new Set(ex.steps.map((s) => s.id));
      for (const slot of ex.observeAt) {
        if (slot === null) continue;
        if ("step" in slot) expect(ids.has(slot.step)).toBe(true);
        if (slot.atSec !== undefined) expect(slot.atSec).toBeGreaterThanOrEqual(0);
      }
      ex.steps.forEach((s, i) => {
        if (s.readDuringPrevAtSec !== undefined) {
          expect(i).toBeGreaterThan(0);
          expect(s.readDuringPrevAtSec).toBeGreaterThanOrEqual(0);
        }
        if (s.reps !== undefined) expect([1, 2]).toContain(s.reps);
      });
    }
  });

  it("follows Kim's evolution: the first step is fast-open (or closed-eyes exercise), the last is slow-closed", () => {
    for (const ex of WARMUP_EXERCISES) {
      const first = ex.steps[0].figure.variant;
      const last = ex.steps[ex.steps.length - 1].figure.variant;
      expect(["fast-open", "slow-closed"]).toContain(first);
      expect(last).toBe("slow-closed");
      // Once eyes close they stay closed.
      const idx = ex.steps.findIndex((s) => s.figure.variant === "slow-closed");
      expect(ex.steps.slice(idx).every((s) => s.figure.variant === "slow-closed")).toBe(true);
    }
  });

  it("every localized string has both es and en, non-empty", () => {
    const check = (t: { es: string; en: string }) => {
      expect(t.es.trim().length).toBeGreaterThan(0);
      expect(t.en.trim().length).toBeGreaterThan(0);
    };
    for (const ex of WARMUP_EXERCISES) {
      check(ex.name);
      check(ex.purpose);
      check(ex.postureText);
      ex.steps.forEach((s) => check(s.text));
      ex.observe.forEach(check);
      ex.closing.forEach(check);
    }
    check(WARMUP_SHARED.safety.text);
    check(WARMUP_SHARED.fifteenSeconds.text);
    check(WARMUP_SHARED.evolution.text);
  });

  it("lookups", () => {
    expect(warmupById("eyes")?.slug).toBe("ojos");
    expect(warmupBySlug("ojos")?.id).toBe("eyes");
    expect(warmupById("nope")).toBeNull();
    expect(warmupById(null)).toBeNull();
    expect(isWarmupId("arm-raise")).toBe(true);
    expect(isWarmupId("arm_raise")).toBe(false);
    expect(isWarmupId(1)).toBe(false);
  });
});

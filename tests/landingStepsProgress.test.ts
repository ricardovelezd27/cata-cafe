import { describe, expect, it } from "vitest";
import {
  STEPS_SCRUB,
  follow,
  reachedStep,
  stepProgress,
} from "@/components/landing/stepsProgress";

const H = 900;

describe("stepProgress", () => {
  it("is 0 while the title is below the start line and 1 from the middle up", () => {
    expect(stepProgress(H * 1.4, H)).toBe(0);
    expect(stepProgress(H * STEPS_SCRUB.start, H)).toBe(0);
    expect(stepProgress(H * STEPS_SCRUB.end, H)).toBe(1);
    expect(stepProgress(H * 0.2, H)).toBe(1);
    expect(stepProgress(-500, H)).toBe(1);
  });

  it("the screen is in place exactly when the title reaches the middle, not before", () => {
    expect(stepProgress(H * 0.5 + 12, H)).toBeLessThan(1);
    expect(stepProgress(H * 0.5 + 12, H)).toBeGreaterThan(0.98);
  });

  it("never goes backwards as the title moves up", () => {
    let prev = -1;
    for (let y = H * 1.2; y >= 0; y -= 9) {
      const p = stepProgress(y, H);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });

  it("starts gently and lands gently", () => {
    const span = H * (STEPS_SCRUB.start - STEPS_SCRUB.end);
    const at = (share: number) => stepProgress(H * STEPS_SCRUB.start - span * share, H);
    expect(at(0.1)).toBeLessThan(0.1);
    expect(at(0.5)).toBeCloseTo(0.5, 5);
    expect(at(0.9)).toBeGreaterThan(0.9);
  });

  it("is the same share of the travel at any viewport height", () => {
    for (const h of [600, 900, 1300]) {
      expect(stepProgress(h * 0.71, h)).toBeCloseTo(stepProgress(H * 0.71, H), 6);
    }
  });

  it("answers 0 for a viewport with no height or a title that cannot be measured", () => {
    expect(stepProgress(100, 0)).toBe(0);
    expect(stepProgress(Number.NaN, H)).toBe(0);
  });
});

describe("reachedStep", () => {
  it.each([
    [[0, 0], 1],
    [[0.6, 0], 1],
    [[1, 0], 2],
    [[1, 0.5], 2],
    [[1, 1], 3],
    [[STEPS_SCRUB.settled, STEPS_SCRUB.settled], 3],
  ])("%j is step %i", (progress, step) => {
    expect(reachedStep(progress)).toBe(step);
  });

  it("step 3 never counts before step 2", () => {
    expect(reachedStep([0.4, 1])).toBe(1);
  });
});

describe("follow", () => {
  it("moves toward the target without passing it", () => {
    let p = 0;
    for (let i = 0; i < 200; i++) {
      const next = follow(p, 1, 16);
      expect(next).toBeGreaterThanOrEqual(p);
      expect(next).toBeLessThanOrEqual(1);
      p = next;
    }
    expect(p).toBe(1);
  });

  it("settles within about half a second", () => {
    let p = 0;
    let ms = 0;
    while (p !== 1 && ms < 2000) {
      p = follow(p, 1, 16);
      ms += 16;
    }
    expect(ms).toBeLessThanOrEqual(600);
  });

  it("covers the same ground in one long frame as in several short ones", () => {
    let short = 0;
    for (let i = 0; i < 4; i++) short = follow(short, 1, 16);
    expect(follow(0, 1, 64)).toBeCloseTo(short, 6);
  });

  it("does not move on a frame of no time, and snaps when the rest is invisible", () => {
    expect(follow(0.3, 1, 0)).toBe(0.3);
    expect(follow(0.999, 1, 16)).toBe(1);
  });
});

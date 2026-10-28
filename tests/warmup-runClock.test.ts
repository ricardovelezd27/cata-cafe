import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  initialRunClock,
  isRunning,
  msUntilStop,
  pause,
  play,
  seek,
  setHidden,
  setStopAt,
  tick,
  toggle,
} from "@/lib/warmup/runClock";
import { rampFracFor, sineInOut, softLinear, upDownWave } from "@/lib/warmup/easing";
import { extremityAt, partTransforms, passedDots, trajectoryDots } from "@/lib/warmup/poses";

describe("runClock reducer", () => {
  it("counts wall-clock time while running and freezes on pause", () => {
    let s = initialRunClock(10000, true, 1000);
    expect(isRunning(s)).toBe(true);
    expect(elapsedMs(s, 1500)).toBe(500);
    s = pause(s, 2000);
    expect(elapsedMs(s, 9000)).toBe(1000);
    expect(s.userPaused).toBe(true);
    s = play(s, 9000);
    expect(elapsedMs(s, 9500)).toBe(1500);
    expect(s.runId).toBe(2);
  });
  it("autoStart=false waits for play()", () => {
    const s = initialRunClock(10000, false, 0);
    expect(isRunning(s)).toBe(false);
    expect(elapsedMs(s, 5000)).toBe(0);
    expect(isRunning(play(s, 5000))).toBe(true);
  });
  it("seek jumps and bumps runId; keeps running state unless told", () => {
    let s = initialRunClock(10000, true, 0);
    s = seek(s, 4000, 100);
    expect(elapsedMs(s, 100)).toBe(4000);
    expect(isRunning(s)).toBe(true);
    expect(s.runId).toBe(2);
    s = seek(pause(s, 200), 1000, 300);
    expect(isRunning(s)).toBe(false);
    s = seek(s, 2000, 400, true);
    expect(isRunning(s)).toBe(true);
    expect(elapsedMs(s, 900)).toBe(2500);
    expect(elapsedMs(seek(s, 99999, 1000), 1000)).toBe(10000);
  });
  it("hidden tab pauses without touching userPaused and resumes on visible", () => {
    let s = initialRunClock(10000, true, 0);
    s = setHidden(s, true, 1000);
    expect(isRunning(s)).toBe(false);
    expect(s.userPaused).toBe(false);
    expect(elapsedMs(s, 5000)).toBe(1000);
    s = setHidden(s, false, 5000);
    expect(isRunning(s)).toBe(true);
    expect(elapsedMs(s, 5500)).toBe(1500);
    // user-paused + hidden → visible must NOT resume
    s = setHidden(setHidden(pause(s, 6000), true, 6000), false, 7000);
    expect(isRunning(s)).toBe(false);
  });
  it("stopAt caps elapsed and tick settles the stop", () => {
    let s = setStopAt(initialRunClock(10000, true, 0), 3000);
    expect(elapsedMs(s, 5000)).toBe(3000);
    expect(msUntilStop(s, 1000)).toBe(2000);
    const r = tick(s, 3001);
    expect(r.event).toBe("stop");
    expect(r.state.userPaused).toBe(true);
    expect(r.state.stopAt).toBeNull();
    expect(elapsedMs(r.state, 9999)).toBe(3000);
    s = play(r.state, 4000);
    expect(elapsedMs(s, 4500)).toBe(3500);
    expect(tick(s, 4500).event).toBeNull();
  });
  it("tick reports done at the end and toggle flips", () => {
    const s = initialRunClock(1000, true, 0);
    const r = tick(s, 1000);
    expect(r.event).toBe("done");
    expect(r.state.done).toBe(true);
    expect(isRunning(r.state)).toBe(false);
    expect(play(r.state, 2000)).toBe(r.state);
    const t = toggle(initialRunClock(1000, true, 0), 10);
    expect(t.userPaused).toBe(true);
    expect(toggle(t, 20).userPaused).toBe(false);
  });
});

describe("easing", () => {
  it("softLinear is monotonic, hits 0 and 1, and is linear in the core", () => {
    const r = rampFracFor(15000);
    expect(r).toBeCloseTo(0.04);
    expect(softLinear(0, r)).toBe(0);
    expect(softLinear(1, r)).toBeCloseTo(1, 9);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = softLinear(i / 100, r);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    const a = softLinear(0.3, r);
    const b = softLinear(0.5, r);
    const c = softLinear(0.7, r);
    expect(c - b).toBeCloseTo(b - a, 6);
  });
  it("short legs clamp the ramp to 45 %", () => {
    expect(rampFracFor(200)).toBe(0.45);
  });
  it("sineInOut and upDownWave shapes", () => {
    expect(sineInOut(0)).toBeCloseTo(0, 9);
    expect(sineInOut(0.5)).toBeCloseTo(0.5);
    expect(sineInOut(1)).toBe(1);
    expect(upDownWave(0, 2100)).toBeCloseTo(0, 9);
    expect(upDownWave(900, 2100)).toBeCloseTo(1, 6);
    expect(upDownWave(1100, 2100)).toBe(1);
    expect(upDownWave(2099, 2100)).toBeCloseTo(0, 2);
  });
});

describe("poses", () => {
  it("maps poses to transform attributes around the documented pivots", () => {
    expect(partTransforms("arm-raise", { a: 1 })).toEqual({ "arm-r": "rotate(-160 146 112)" });
    expect(partTransforms("arm-raise", { a: 0.5 })).toEqual({ "arm-r": "rotate(-80 146 112)" });
    expect(partTransforms("head-rotate", { a: -1 })).toEqual({ face: "translate(-13 0)" });
    expect(partTransforms("eyes", { a: 0.5, b: -1 })).toEqual({ pupils: "translate(5 -6)" });
    expect(partTransforms("trunk-forward-back", { a: 1 })).toEqual({ upper: "rotate(16 118 206)" });
    expect(partTransforms("trunk-side", { a: 0.18 })).toEqual({ upper: "translate(3.96 0)" });
  });
  it("extremity and trajectory geometry", () => {
    const down = extremityAt("arm-raise", { a: 0 });
    expect(down).toEqual({ x: 158, y: 198 });
    const up = extremityAt("arm-raise", { a: 1 });
    expect(up.y).toBeLessThan(112);
    const { dots, destination } = trajectoryDots("arm-raise", { a: 0 }, { a: 1 });
    expect(dots.length).toBeGreaterThan(20);
    expect(destination).toEqual(up);
    expect(passedDots(dots.length, 0)).toBe(0);
    expect(passedDots(dots.length, 1)).toBe(dots.length);
    expect(passedDots(10, 0.55)).toBe(5);
    expect(trajectoryDots("eyes", { a: 0, b: 0 }, { a: 1, b: 0 }).dots.length).toBeGreaterThan(0);
  });
});

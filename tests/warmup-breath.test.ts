import { describe, expect, it } from "vitest";
import { ARRIVE_PLAN, ARRIVE_TOTAL_MS, arrivePhaseAt, breathAt, halo } from "@/lib/warmup/breath";

describe("breath curve", () => {
  it("is empty at the start of each cycle and full at the top of the inhale", () => {
    expect(breathAt(0).scale).toBeCloseTo(0.62);
    expect(breathAt(0).phase).toBe("in");
    expect(breathAt(4000).scale).toBeCloseTo(1);
    expect(breathAt(4000).phase).toBe("out");
    expect(breathAt(10000).scale).toBeCloseTo(0.62);
    expect(breathAt(10000).phase).toBe("in");
    expect(breathAt(2000)).toMatchObject({ phase: "in", u: 0.5 });
    expect(breathAt(2000).scale).toBeCloseTo(0.81);
  });

  it("rises monotonically on the inhale and falls on the exhale", () => {
    let prev = -Infinity;
    for (let ms = 0; ms < 4000; ms += 50) {
      const s = breathAt(ms).scale;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    prev = Infinity;
    for (let ms = 4000; ms < 10000; ms += 50) {
      const s = breathAt(ms).scale;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("honours custom timings", () => {
    expect(breathAt(3000, { inMs: 3000, outMs: 3000 }).scale).toBeCloseTo(1);
    expect(breathAt(6000, { inMs: 3000, outMs: 3000 }).scale).toBeCloseTo(0.62);
  });

  it("lags the halo 300 ms behind the bubble, between 0.25 and 0.55", () => {
    expect(halo(0)).toBeCloseTo(0.25);
    expect(halo(300)).toBeCloseTo(0.25);
    expect(halo(4000)).toBeLessThan(0.55);
    expect(halo(4300)).toBeCloseTo(0.55);
    expect(halo(2000)).toBeLessThan(0.25 + 0.3 * ((breathAt(2000).scale - 0.62) / 0.38));
    for (let ms = 0; ms < 20000; ms += 100) {
      expect(halo(ms)).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(halo(ms)).toBeLessThanOrEqual(0.55 + 1e-9);
    }
  });
});

describe("arrive plan", () => {
  it("totals 40 s", () => {
    expect(ARRIVE_TOTAL_MS).toBe(40000);
    expect(ARRIVE_PLAN.cycles).toBe(3);
  });

  it("switches phases on the exact boundaries", () => {
    expect(arrivePhaseAt(0).phase).toBe("posture");
    expect(arrivePhaseAt(5999).phase).toBe("posture");
    expect(arrivePhaseAt(6000)).toMatchObject({ phase: "breath", cycle: 0 });
    expect(arrivePhaseAt(6000).breath?.scale).toBeCloseTo(0.62);
    expect(arrivePhaseAt(10000).breath?.scale).toBeCloseTo(1);
    expect(arrivePhaseAt(16000)).toMatchObject({ phase: "breath", cycle: 1 });
    expect(arrivePhaseAt(35999)).toMatchObject({ phase: "breath", cycle: 2 });
    expect(arrivePhaseAt(36000).phase).toBe("notice");
    expect(arrivePhaseAt(39999).phase).toBe("notice");
    expect(arrivePhaseAt(40000).phase).toBe("notice");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EASE_RATE, dotSize, driftX, driftY, frameEase, luminance, mulberry32, resolveRgb } from "@/lib/canvas/particles";

// The particle dialect shared by the landing's constellation and the
// warm-up's stage field (lib/canvas/particles.ts).

describe("seeded randomness", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("easing that does not depend on the frame rate", () => {
  it("one 60 Hz frame covers EASE_RATE of the way", () => {
    expect(frameEase(16.667)).toBeCloseTo(EASE_RATE, 6);
    expect(frameEase(0)).toBe(0);
  });
  it("two 30 Hz frames land where four 60 Hz frames do, and so do 10 Hz frames", () => {
    const run = (dt: number, totalMs: number) => {
      let x = 0;
      for (let t = 0; t < totalMs - 1e-6; t += dt) x += (1 - x) * frameEase(dt);
      return x;
    };
    const at60 = run(1000 / 60, 1000);
    expect(run(1000 / 30, 1000)).toBeCloseTo(at60, 6);
    expect(run(100, 1000)).toBeCloseTo(at60, 6);
  });
});

describe("the dot", () => {
  it("is the same size on the same screen, a little larger on a phone, never under 1.8 px", () => {
    expect(dotSize(375, 812, true)).toBeCloseTo(1.8 * 1.3, 6);
    expect(dotSize(1440, 900, false)).toBeCloseTo(900 * 0.0028, 6);
    expect(dotSize(320, 568, false)).toBe(1.8);
  });
});

describe("idle drift", () => {
  it("is bounded by the jitter and the sway, and still when both are zero", () => {
    for (let k = 0; k < 500; k++) {
      const t = k * 0.37;
      expect(Math.abs(driftX(t, k, k * 2, 10, 2))).toBeLessThanOrEqual(10 + 1 + 1e-9);
      expect(Math.abs(driftY(t, k, k * 2, 10, 2))).toBeLessThanOrEqual(10 + 2 + 1e-9);
    }
    expect(driftX(3, 1, 2, 0, 0)).toBeCloseTo(0, 12);
    expect(driftY(3, 1, 2, 0, 0)).toBeCloseTo(0, 12);
  });
});

describe("colour parsing through the canvas", () => {
  // A context normalises what it is given: hex stays hex, the rest becomes rgb().
  const fake = (map: Record<string, string>) => {
    let v = "#000000";
    return {
      get fillStyle() {
        return v;
      },
      set fillStyle(next: string) {
        if (next in map) v = map[next];
        else if (/^#[0-9a-f]{6}$/i.test(next)) v = next.toLowerCase();
        // an unparseable value leaves the previous one, as a real context does
      },
    };
  };
  it("reads hex and rgb()", () => {
    expect(resolveRgb(fake({}), "#C7EBD4", "#000000")).toEqual([199, 235, 212]);
    expect(resolveRgb(fake({ "oklch(0.9 0.05 160)": "rgba(10, 20, 30, 0.5)" }), "oklch(0.9 0.05 160)", "#000000")).toEqual([10, 20, 30]);
  });
  it("falls back when the token is missing", () => {
    expect(resolveRgb(fake({}), "", "#fd8c6a")).toEqual([253, 140, 106]);
  });
  it("luminance: white 1, black 0", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(luminance([0, 0, 0])).toBe(0);
  });
});

describe("one dialect, two hosts", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
  const HOSTS = ["components/landing/journey/ConstellationCanvas.tsx", "components/warmup/StageField.tsx"];
  it("both canvases take the easing, the drift, the dot and the governor from lib/canvas", () => {
    for (const host of HOSTS) {
      const src = read(host);
      expect(src, host).toMatch(/from "@\/lib\/canvas\/particles"/);
      expect(src, host).toMatch(/from "@\/lib\/canvas\/governor"/);
      for (const name of ["frameEase", "driftX", "driftY", "dotSize", "resolveRgb", "createGovernor"]) expect(src, `${host} ${name}`).toContain(name);
    }
  });
  it("nobody keeps a private copy of the seed function or of the easing formula", () => {
    const files = [...HOSTS, "components/landing/journey/formations.ts", "components/landing/journey/intro.ts", "lib/warmup/stageField.ts"];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain("0x6d2b79f5");
      expect(src, f).not.toMatch(/Math\.pow\(1 - 0\.\d+, dt/);
    }
  });
  it("the stage field has no loop of its own and makes no gradient or colour string per frame", () => {
    const src = read("components/warmup/StageField.tsx");
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("setInterval");
    expect(src).not.toContain("createRadialGradient");
    expect(src).not.toMatch(/rgba\(\$\{/);
  });
});

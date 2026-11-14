import { describe, expect, it } from "vitest";
import { PALETTE, seedIdentity } from "@/components/landing/journey/formations";
import {
  INTRO,
  INTRO_SCALE,
  INTRO_TOTAL_MS,
  buildIntro,
  introProgress,
  introRing,
  shouldPlayIntro,
} from "@/components/landing/journey/intro";

const N = 1600;
const DESKTOP = { W: 1440, H: 900, narrow: false };
const MOBILE = { W: 390, H: 844, narrow: true };
const idR = seedIdentity(N);

describe("introProgress", () => {
  it("walks gather, hold, release, done in order", () => {
    expect(introProgress(0).phase).toBe("gather");
    expect(introProgress(INTRO.gatherMs - 1).phase).toBe("gather");
    expect(introProgress(INTRO.gatherMs).phase).toBe("hold");
    expect(introProgress(INTRO.gatherMs + INTRO.holdMs).phase).toBe("release");
    expect(introProgress(INTRO_TOTAL_MS).phase).toBe("done");
    expect(introProgress(INTRO_TOTAL_MS * 10).phase).toBe("done");
  });

  it("t stays in 0..1 and never goes backwards inside a phase", () => {
    let lastPhase = "";
    let lastT = -1;
    for (let ms = -50; ms <= INTRO_TOTAL_MS + 50; ms += 7) {
      const { phase, t } = introProgress(ms);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      if (phase === lastPhase) expect(t).toBeGreaterThanOrEqual(lastT);
      lastPhase = phase;
      lastT = t;
    }
  });

  it("the gather starts fast and lands gently (ease-out)", () => {
    expect(introProgress(INTRO.gatherMs * 0.25).t).toBeGreaterThan(0.6);
  });

  it("the whole arrival takes about two seconds", () => {
    expect(INTRO_TOTAL_MS).toBeGreaterThanOrEqual(1500);
    expect(INTRO_TOTAL_MS).toBeLessThanOrEqual(2500);
  });
});

describe("shouldPlayIntro", () => {
  const base = { reduced: false, saveData: false, seen: false, hidden: false, scrollY: 0 };

  it("plays for a first visit at the top of the page", () => {
    expect(shouldPlayIntro(base)).toBe(true);
  });

  it.each([
    ["reduced motion", { reduced: true }],
    ["Save-Data", { saveData: true }],
    ["already seen in this tab", { seen: true }],
    ["a hidden tab", { hidden: true }],
    ["a visitor who already scrolled", { scrollY: 400 }],
  ])("does not play with %s", (_name, patch) => {
    expect(shouldPlayIntro({ ...base, ...patch })).toBe(false);
  });
});

describe("buildIntro", () => {
  for (const vp of [DESKTOP, MOBILE]) {
    const { scatter, ring } = buildIntro(N, vp.W, vp.H, idR, vp.narrow);
    const geo = introRing(vp.W, vp.H, vp.narrow);

    it(`@${vp.W}: a dot keeps its flavour family from the scatter to the ring`, () => {
      for (let i = 0; i < N; i++) expect(scatter.c[i]).toBe(ring.c[i]);
    });

    it(`@${vp.W}: the ring carries all nine families and nothing else`, () => {
      const used = new Set<number>();
      for (let i = 0; i < N; i++) used.add(ring.c[i]);
      expect(used.size).toBe(9);
      for (let k = 0; k < 9; k++) expect(used.has(PALETTE.FLAVOR0 + k)).toBe(true);
    });

    it(`@${vp.W}: the ring is thin: ≥ 90 % of the dots within ±12 % of the ellipse`, () => {
      let near = 0;
      for (let i = 0; i < N; i++) {
        const u = (ring.x[i] - geo.cx) / geo.rx;
        const v = (ring.y[i] - geo.cy) / geo.ry;
        if (Math.abs(Math.hypot(u, v) - 1) <= 0.12) near++;
      }
      expect(near / N).toBeGreaterThanOrEqual(0.9);
    });

    it(`@${vp.W}: the near side of the ring is drawn larger than the far side`, () => {
      let near = 0, nearN = 0, far = 0, farN = 0;
      for (let i = 0; i < N; i++) {
        if (ring.y[i] > geo.cy) { near += ring.scale![i]; nearN++; }
        else { far += ring.scale![i]; farN++; }
      }
      expect(near / nearN).toBeGreaterThan(far / farN + 0.4);
    });

    it(`@${vp.W}: both formations stay inside the viewport and size stays bounded`, () => {
      for (const f of [scatter, ring]) {
        let out = 0;
        for (let i = 0; i < N; i++) {
          if (f.x[i] < -8 || f.x[i] > vp.W + 8 || f.y[i] < -8 || f.y[i] > vp.H + 8) out++;
          expect(f.scale![i]).toBeGreaterThanOrEqual(INTRO_SCALE.min - 1e-6);
          expect(f.scale![i]).toBeLessThanOrEqual(INTRO_SCALE.max + 1e-6);
        }
        expect(out / N).toBeLessThanOrEqual(0.02);
        expect(f.alpha).toBeGreaterThan(0);
        expect(f.alpha).toBeLessThanOrEqual(1);
      }
    });
  }

  it("desktop: the ring is centred on the offer card (right column) and wider than it", () => {
    const geo = introRing(DESKTOP.W, DESKTOP.H, false);
    expect(geo.cx).toBeGreaterThan(DESKTOP.W * 0.55);
    expect(geo.rx * 2).toBeGreaterThan(456); // the card is about 456 px wide
    expect(geo.ry).toBeLessThan(geo.rx * 0.5); // a flat ellipse: seen from a low angle
  });

  it("the gathered ring is calmer than the scatter", () => {
    const { scatter, ring } = buildIntro(N, DESKTOP.W, DESKTOP.H, idR, false);
    expect(ring.jitter).toBeLessThan(scatter.jitter);
  });
});

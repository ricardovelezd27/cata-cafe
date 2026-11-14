import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WARMUP_EXERCISES, type WarmupFigureKind } from "@/lib/warmup/exercises";
import { CLOSE_FADE_FROM, CLOSE_FRAME, FIGURE_VIEW, closeFrameStyle, closeFrameVars, closeHalfWidth } from "@/lib/warmup/figureCrop";
import { GEO, extremityAt } from "@/lib/warmup/poses";

const KINDS = Object.keys(CLOSE_FRAME) as WarmupFigureKind[];
/** Radius of the destination ring of a trajectory, plus the hand's own. */
const MARGIN = 8;
/** Poses to sweep: `a` over its whole range for the kind. */
const sweep = (kind: WarmupFigureKind): number[] => {
  const lo = kind === "arm-raise" || kind === "trunk-forward-back" ? 0 : -1;
  return Array.from({ length: 41 }, (_, i) => lo + ((1 - lo) * i) / 40);
};

/** What must be readable in each frame besides the moving extremity: static
 *  parts of the drawing (components/warmup/figures/Mannequin.tsx). */
const MUST_SHOW: Record<string, { x: number; y: number }[]> = {
  "arm-raise": [
    { x: 120, y: 27 }, // top of the hair bun
    { x: GEO.arm.hand[0], y: GEO.arm.hand[1] + 7.5 }, // the hand hanging at rest
    { x: 82 - 7.5, y: 198 }, // the other hand
  ],
  "head-rotate": [
    { x: 120, y: 27 },
    { x: 92, y: 116 }, // shoulders
    { x: 148, y: 116 },
  ],
  "trunk-forward-back": [
    { x: 122, y: 27 },
    { x: 66, y: 104 }, // top of the chair back
    { x: GEO.trunkFwd.pivot[0], y: GEO.trunkFwd.pivot[1] }, // the hips: where the trunk tips from
  ],
  "trunk-side": [
    { x: 120, y: 27 },
    { x: 70, y: 204 }, // the seat, both ends
    { x: 170, y: 204 },
  ],
};

describe("the half-body frames", () => {
  it("exist for the four full-body figures and not for the eyes bust", () => {
    expect(KINDS.sort()).toEqual(["arm-raise", "head-rotate", "trunk-forward-back", "trunk-side"]);
    expect(closeFrameVars("eyes")).toBeNull();
    expect(closeFrameStyle("eyes")).toBeUndefined();
    for (const ex of WARMUP_EXERCISES) {
      if (ex.figureKind !== "eyes") expect(CLOSE_FRAME[ex.figureKind], ex.id).toBeDefined();
    }
  });

  it("are really closer (at least 1.4x) and stay inside the drawing", () => {
    for (const kind of KINDS) {
      const f = CLOSE_FRAME[kind]!;
      expect(FIGURE_VIEW.h / f.h, kind).toBeGreaterThanOrEqual(1.4);
      expect(f.top, kind).toBeGreaterThanOrEqual(0);
      expect(f.top + f.h, kind).toBeLessThanOrEqual(FIGURE_VIEW.h);
    }
    // The head exercise gains the most: only the face moves.
    expect(FIGURE_VIEW.h / CLOSE_FRAME["head-rotate"]!.h).toBeGreaterThan(2);
  });

  it("keep everything that moves above the fade, at every pose", () => {
    for (const kind of KINDS) {
      const f = CLOSE_FRAME[kind]!;
      const readableBottom = f.top + f.h * CLOSE_FADE_FROM;
      for (const a of sweep(kind)) {
        const p = extremityAt(kind, { a });
        expect(p.y - MARGIN, `${kind} a=${a} top`).toBeGreaterThanOrEqual(f.top);
        expect(p.y + MARGIN, `${kind} a=${a} bottom`).toBeLessThanOrEqual(readableBottom);
      }
    }
  });

  it("keep the static parts that give the movement its meaning above the fade", () => {
    for (const kind of KINDS) {
      const f = CLOSE_FRAME[kind]!;
      for (const p of MUST_SHOW[kind]) {
        expect(p.y, `${kind} ${p.x},${p.y}`).toBeGreaterThanOrEqual(f.top);
        expect(p.y, `${kind} ${p.x},${p.y}`).toBeLessThanOrEqual(f.top + f.h * CLOSE_FADE_FROM);
      }
    }
  });

  it("fit sideways on every phone shape, from a short 320 px wide one to a tall 430 px wide one", () => {
    // The figure box is 92 % of a stage that is 46 % of the viewport height
    // while the exercise runs (24 % on the intro, which only gives more room).
    const phones = [
      [320, 568],
      [360, 640],
      [375, 667],
      [390, 844],
      [412, 915],
      [430, 932],
    ];
    for (const [w, vh] of phones) {
      const boxH = 0.92 * 0.46 * vh;
      for (const kind of KINDS) {
        const f = CLOSE_FRAME[kind]!;
        const half = closeHalfWidth(f, w, boxH);
        const inside = (x: number, what: string) => {
          expect(x, `${kind} ${w}x${vh} ${what}`).toBeGreaterThanOrEqual(f.cx - half);
          expect(x, `${kind} ${w}x${vh} ${what}`).toBeLessThanOrEqual(f.cx + half);
        };
        for (const a of sweep(kind)) {
          const p = extremityAt(kind, { a });
          inside(p.x - MARGIN, `extremity a=${a}`);
          inside(p.x + MARGIN, `extremity a=${a}`);
        }
        // The upper body slides sideways as a whole in the side exercise.
        const slide = kind === "trunk-side" ? GEO.trunkSide.dx : 0;
        for (const p of MUST_SHOW[kind]) {
          inside(p.x - slide, "static part");
          inside(p.x + slide, "static part");
        }
      }
    }
  });
});

describe("closeFrameVars (the numbers the stylesheet reads)", () => {
  it("scale = 320 / frame height; shifts are fractions of the box height", () => {
    const f = CLOSE_FRAME["arm-raise"]!;
    const v = closeFrameVars("arm-raise")!;
    expect(v.k).toBeCloseTo(320 / f.h, 3);
    expect(v.y).toBeCloseTo((-f.top / 320) * (320 / f.h), 3);
    expect(v.x).toBeCloseTo((-(f.cx - 120) / 320) * (320 / f.h), 3);
    expect(closeFrameVars("head-rotate")!.x).toBeCloseTo(0, 9); // centred on the body: no sideways shift
    expect(closeFrameStyle("trunk-side")).toEqual({ "--close-k": closeFrameVars("trunk-side")!.k, "--close-x": 0, "--close-y": closeFrameVars("trunk-side")!.y });
  });

  it("puts the frame's top edge on the box's top edge and its bottom on the box's bottom", () => {
    for (const kind of KINDS) {
      const f = CLOSE_FRAME[kind]!;
      const v = closeFrameVars(kind)!;
      const H = 300; // any box height
      const u = H / FIGURE_VIEW.h; // px per unit before scaling
      const yPx = (unitY: number) => unitY * u * v.k + v.y * H;
      expect(yPx(f.top), kind).toBeCloseTo(0, 0);
      expect(yPx(f.top + f.h), kind).toBeCloseTo(H, 0);
      // Horizontal: the frame centre lands on the box centre (offset 0).
      const xPx = (unitX: number) => (unitX - FIGURE_VIEW.w / 2) * u * v.k + v.x * H;
      expect(xPx(f.cx), kind).toBeCloseTo(0, 0);
    }
  });
});

describe("the stylesheet applies the frame on phones only", () => {
  const css = readFileSync(resolve(__dirname, "../components/warmup/WarmupPlayer.module.css"), "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
  it("reads the three custom properties with safe defaults, on the stage frame, inside the phone media query", () => {
    expect(phone).toContain('.figureBox > svg[data-frame="stage"]');
    expect(phone).toContain("var(--close-k, 1)");
    expect(phone).toContain("var(--close-x, 0)");
    expect(phone).toContain("var(--close-y, 0)");
    expect(phone).toContain("transform-origin: 50% 0");
  });
  it("fades the bottom from the same share the frames were checked against", () => {
    expect(phone).toContain(`black ${CLOSE_FADE_FROM * 100}%`);
  });
  it("never transforms the pose groups (they carry the pose as attributes)", () => {
    expect(css).not.toMatch(/\[data-part[^\]]*\][^{]*\{[^}]*transform\s*:/);
  });
});

describe("the figure stage keeps its own class name", () => {
  // CSS modules hash by NAME: two rules called `.stage` are one class, and the
  // later one wins. That happened (the "evolution" list item was also
  // `.stage`), and the figure stage lost its height on every phone.
  const css = readFileSync(resolve(__dirname, "../components/warmup/WarmupPlayer.module.css"), "utf8");
  const tsx = readFileSync(resolve(__dirname, "../components/warmup/WarmupPlayer.tsx"), "utf8");
  it("has exactly one top-level `.stage` rule, and the list item is `.evoStage`", () => {
    expect(css.match(/^\.stage \{/gm)).toHaveLength(1);
    expect(css).toMatch(/^\.evoStage \{/m);
    expect(tsx.match(/s\.stage\b/g)).toHaveLength(1);
    expect(tsx).toContain("s.evoStage");
  });
  it("on phones the stage has a fixed height that leaves the instruction its room", () => {
    const rule = css.slice(css.search(/^\.stage \{/m), css.indexOf("}", css.search(/^\.stage \{/m)));
    expect(rule).toContain("flex: 0 0 clamp(120px, calc(100dvh - 460px), 46dvh)");
  });
  it("the running text is centred with spacers, so an overflow never cuts its first line", () => {
    const run = css.slice(css.indexOf(".bodyRun {"), css.indexOf(".cue {"));
    expect(run).not.toContain("justify-content: center");
    expect(run).toMatch(/\.bodyRun::before,\s*\.bodyRun::after \{[^}]*flex: 1 1 0/);
  });
});

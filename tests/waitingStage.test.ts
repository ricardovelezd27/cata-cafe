import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Package S7b (audit K-02): the waiting room's status on the stage panel.
// Every text and mark on the panel is computed from the tokens; the logic of
// the waiting room is guarded by tests elsewhere and by the PR's own diff.

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const globals = read("app/globals.css");
const css = read("components/arrival/ArrivalStage.module.css");
/** The source without its comments: a guard reads code, not prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const client = code(read("app/[locale]/app/sessions/[id]/waiting/WaitingRoomClient.tsx"));
const panel = code(read("components/arrival/StagePanel.tsx"));

function token(name: string): number[] {
  const m = globals.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`no token --color-${name}`);
  const v = m[1].trim();
  const ref = v.match(/^var\(--color-([a-z-]+)\)/);
  if (ref) return token(ref[1]);
  const hex = v.match(/#[0-9a-fA-F]{6}/);
  if (!hex) throw new Error(`--color-${name} is not a plain colour: ${v}`);
  return [1, 3, 5].map((i) => parseInt(hex[0].slice(i, i + 2), 16));
}
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (over: number[], under: number[], share: number) => over.map((v, i) => v * share + under[i] * (1 - share));

const stage = token("stage");
const deep = token("stage-deep");
const cream = token("surface");
const lit = mix(token("primary-fixed"), stage, 0.15);

describe("the panel is the arrival stage's ground, not a copy", () => {
  it("one rule paints both shapes", () => {
    expect(css).toMatch(/\.ground,\s*\.panel \{[^}]*background-color: var\(--color-stage\);/);
    expect(css.match(/linear-gradient\(/g)).toHaveLength(1);
    expect(panel).toContain("styles.panel");
    expect(panel).not.toMatch(/canvas|requestAnimationFrame|animate-/);
  });
  it("nothing in the waiting room bounces, and the emoji is gone", () => {
    expect(client).not.toMatch(/animate-bounce|animate-pulse|animate-ping/);
    expect(client).not.toMatch(/☕/);
    expect(client).not.toMatch(/linear-gradient|#[0-9a-fA-F]{6}/);
    expect(client).not.toMatch(/<main/);
  });
});

describe("text on the panel (AA, from the tokens), at its darkest and at the light", () => {
  for (const [name, ground] of Object.entries({ stage, deep, lit })) {
    it(`on ${name}`, () => {
      // the title, the session's name, the reference line: cream
      expect(contrast(cream, ground)).toBeGreaterThanOrEqual(7);
      // the description and the waiting line: cream at 80 %
      expect(client).toContain("text-surface/80");
      expect(contrast(mix(cream, ground, 0.8), ground)).toBeGreaterThanOrEqual(4.5);
      // "connection lost": cream text, with the stage's terracotta as a mark (a graphic)
      expect(client).toContain('<p role="status" className="text-caption text-surface">');
      expect(contrast(token("secondary-container"), ground)).toBeGreaterThanOrEqual(3);
      // the reference pill's edge (cream at 60 %) and the waiting mark (mint): graphics, 3 : 1
      expect(client).toContain("border-surface/60");
      expect(contrast(mix(cream, ground, 0.6), ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(token("primary-fixed"), ground)).toBeGreaterThanOrEqual(3);
    });
  }
  it("the drawing's dots stand out from the ground (3 : 1)", () => {
    for (const ground of [stage, deep, lit]) {
      expect(contrast(token("primary-fixed"), ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(token("secondary-container"), ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(mix(cream, ground, 0.7), ground)).toBeGreaterThanOrEqual(3);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Package S8 (audit K-01, K-05, D-11): the arrival stage. Every text and control
// pair of the shell and of the card is computed from the tokens, as
// tests/warmup-stage.test.ts does for the warm-up's dark stage.

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const globals = read("app/globals.css");
/** The source without its comments: a guard reads code, not prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const stageCss = code(read("components/arrival/ArrivalStage.module.css"));
const stageTsx = code(read("components/arrival/ArrivalStage.tsx"));
const cardTsx = code(read("components/arrival/ArrivalCard.tsx"));

/** A colour token's hex from app/globals.css (following one `var()` hop). */
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
/** `share` of `over` laid on `under` (color-mix with transparent, then composited). */
const mix = (over: number[], under: number[], share: number) => over.map((v, i) => v * share + under[i] * (1 - share));

const stage = token("stage");
const deep = token("stage-deep");
const cream = token("surface");
// The lightest point of the ground: the mint pool (primary-fixed at 15 %) over the stage.
const lit = mix(token("primary-fixed"), stage, 0.15);


describe("the arrival ground is the landing's stage", () => {
  it("is painted from the stage tokens, and is not `.stage-ground`", () => {
    expect(stageCss).toContain("background-color: var(--color-stage);");
    expect(stageCss).toContain("var(--color-stage-deep)");
    // `.stage-ground` tells globals.css "this is the landing" and turns off the
    // paper focus ring, the paper heading rule and the one reduced-motion reset.
    expect(stageTsx).not.toMatch(/stage-ground/);
    expect(stageCss).not.toMatch(/\.stage-ground/);
  });
  it("has no canvas, no script loop and nothing that moves", () => {
    expect(stageTsx).not.toMatch(/canvas|Constellation|requestAnimationFrame|"use client"/);
    expect(stageCss).not.toMatch(/animation|@keyframes|transition/);
  });
  it("uses tokens only (no hex)", () => {
    expect(stageCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cardTsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it("holds the mark, the language, one solid card and the legal links", () => {
    expect(stageTsx).toMatch(/<Wordmark href=\{localeHref\(loc, "\/"\)\} tone="stage" \/>/);
    expect(stageTsx).toMatch(/<LocaleSwitchLink/);
    expect(stageTsx).toMatch(/surface-solid/);
    expect(stageTsx).toMatch(/LEGAL_PAGES_PUBLISHED \?/);
    expect(stageTsx.match(/<main/g)).toHaveLength(1);
  });
});

describe("text and controls on the ground (AA, computed from the tokens)", () => {
  // The bar (mark, language) sits above the light: on the stage's two depths.
  for (const [name, ground] of Object.entries({ stage, deep })) {
    it(`the bar, on ${name}`, () => {
      expect(contrast(cream, ground)).toBeGreaterThanOrEqual(7);
      // the mark's ".ai" (aria-hidden decoration), held to the text bar anyway
      expect(contrast(token("secondary-container"), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(mix(cream, ground, 0.82), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("primary-fixed"), ground)).toBeGreaterThanOrEqual(3);
    });
  }
  it("the light starts under the 60 px bar", () => {
    expect(stageCss).toMatch(/\.bar \{[^}]*height: 60px;/);
    expect(stageCss).toMatch(/\.light \{[^}]*top: 72px;/);
  });
  // The footer's links and separators may sit on any point of the ground, the light included.
  for (const [name, ground] of Object.entries({ stage, deep, lit })) {
    it(`the footer, on ${name}`, () => {
      expect(stageCss).toContain("color: color-mix(in srgb, var(--color-surface) 82%, transparent);");
      expect(contrast(mix(cream, ground, 0.82), ground)).toBeGreaterThanOrEqual(4.5);
      expect(stageCss).toContain("color: color-mix(in srgb, var(--color-surface) 72%, transparent);");
      expect(contrast(mix(cream, ground, 0.72), ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("primary-fixed"), ground)).toBeGreaterThanOrEqual(3);
    });
  }
  it("the ring is mint on the ground and the paper green inside the card", () => {
    expect(stageCss).toMatch(/\.ground :focus-visible[^{]*\{\s*outline: 2px solid var\(--color-primary-fixed\);\s*outline-offset: 2px;/);
    expect(stageCss).toMatch(/\.card :focus-visible[^{]*\{\s*outline-color: var\(--color-primary-container\);/);
    expect(contrast(token("primary-container"), cream)).toBeGreaterThanOrEqual(3);
  });
  it("the card stands apart from the ground", () => {
    expect(contrast(cream, deep)).toBeGreaterThanOrEqual(3);
  });
});

describe("text and controls on the card (cream)", () => {
  const card = cream;
  const white = token("surface-container-lowest");
  it("ink, the muted line and the primary button", () => {
    expect(contrast(token("on-surface"), card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("on-surface-variant"), card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("on-primary"), token("primary-container"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("primary-container"), card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("error"), card)).toBeGreaterThanOrEqual(4.5);
  });
  it("a field's edge and a secondary button's edge (3 : 1 for a control's outline)", () => {
    expect(contrast(token("outline"), white)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("outline"), card)).toBeGreaterThanOrEqual(3);
  });
  it("each tone's mark: its icon on its own fill", () => {
    expect(contrast(token("primary-container"), token("surface-container"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("on-warning-container"), token("warning-container"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("on-error-container"), token("error-container"))).toBeGreaterThanOrEqual(3);
    expect(cardTsx).toContain('info: { box: "bg-surface-container text-primary-container"');
    expect(cardTsx).toContain('warning: { box: "bg-warning-container text-on-warning-container"');
    expect(cardTsx).toContain('error: { box: "bg-error-container text-on-error-container"');
  });
});

describe("one shell and one card for every arrival screen", () => {
  const screens = [
    "app/[locale]/auth/login/page.tsx",
    "app/[locale]/auth/confirm/page.tsx",
    "app/[locale]/auth/claim/page.tsx",
    "app/[locale]/join/[token]/page.tsx",
    "app/[locale]/join/coffee/[token]/page.tsx",
  ];
  it("each screen renders inside ArrivalStage and writes no card or <main> of its own", () => {
    for (const p of screens) {
      const src = read(p);
      expect(src, p).toMatch(/<ArrivalStage locale=/);
      expect(src, p).not.toMatch(/<main|rounded-card border border-outline-variant|text-error">\{/);
    }
  });
  it("every state is drawn with ArrivalCard (or ArrivalMark): no hand-made title", () => {
    for (const p of [...screens, "app/[locale]/auth/confirm/ConfirmClient.tsx", "components/auth/ClaimCard.tsx"]) {
      expect(read(p), p).not.toMatch(/className="page-title/);
    }
  });
  it("the shell and the landing share one wordmark", () => {
    expect(read("components/brand/Wordmark.tsx")).toContain('export const WORDMARK = "cafesensible";');
  });
});

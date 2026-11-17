import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { L1_GROUP_COLOR } from "@/lib/constants";

// One palette for the nine flavour families (package RP, RESULTS-DESIGN.md 6c,
// decided 2026-11-16: "retune once, but align with the color wheel"). The
// `--color-flavor-*` tokens of app/globals.css and `L1_GROUP_COLOR` of
// lib/constants.ts (what the picker, the results and the PDF read) hold the
// SAME nine values. The values are parsed from the CSS file itself, so the file
// is what is checked, not a copy.

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Token suffix -> family id of lib/constants.ts. The names differ (`sour` is
 *  the family `sour_fermented`, `green` is `green_veg`, `nutty` is `nutty_cocoa`). */
const TOKEN_TO_FAMILY = {
  floral: "floral",
  fruity: "fruity",
  sweet: "sweet",
  sour: "sour_fermented",
  green: "green_veg",
  nutty: "nutty_cocoa",
  spice: "spice",
  roasted: "roasted",
  other: "other",
} as const satisfies Record<string, keyof typeof L1_GROUP_COLOR>;

/** The declarations of one top-level block (`:root {` or `@theme inline {`). */
function block(opener: string): Map<string, string> {
  const start = CSS.indexOf(`\n${opener} {`);
  expect(start, `${opener} block in app/globals.css`).toBeGreaterThanOrEqual(0);
  const end = CSS.indexOf("\n}", start + 1);
  const body = CSS.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const ROOT_TOKENS = block(":root");
const THEME_TOKENS = block("@theme inline");

function hex(name: string, from: Map<string, string>): string {
  const v = from.get(name);
  expect(v, `${name} is defined`).toBeDefined();
  expect(v, `${name} is a plain hex`).toMatch(/^#[0-9a-fA-F]{6}$/);
  return v!.toLowerCase();
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("flavour family palette: one palette, the wheel's", () => {
  it("maps every token to a family and covers all nine families", () => {
    expect(Object.values(TOKEN_TO_FAMILY).sort()).toEqual(Object.keys(L1_GROUP_COLOR).sort());
  });

  for (const [token, family] of Object.entries(TOKEN_TO_FAMILY)) {
    const name = `--color-flavor-${token}`;

    it(`${name} equals L1_GROUP_COLOR.${family} in :root and in @theme inline`, () => {
      const want = L1_GROUP_COLOR[family].toLowerCase();
      expect(hex(name, ROOT_TOKENS)).toBe(want);
      expect(hex(name, THEME_TOKENS)).toBe(want);
    });

    it(`${name} reaches 3 : 1 as a drawn shape on surface and surface-container-lowest`, () => {
      const c = hex(name, ROOT_TOKENS);
      for (const bg of ["--color-surface", "--color-surface-container-lowest"]) {
        expect(contrast(c, hex(bg, ROOT_TOKENS)), `${name} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${name} is not the error colour`, () => {
      expect(hex(name, ROOT_TOKENS)).not.toBe(hex("--color-error", ROOT_TOKENS));
    });
  }

  it("the landing constellation's fallback snapshot mirrors the tokens", () => {
    const src = readFileSync(path.join(ROOT, "components/landing/journey/ConstellationCanvas.tsx"), "utf8");
    for (const token of Object.keys(TOKEN_TO_FAMILY)) {
      const name = `--color-flavor-${token}`;
      const m = src.match(new RegExp(`"${name}":\\s*"(#[0-9a-fA-F]{6})"`));
      expect(m, `${name} in TOKEN_FALLBACK`).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(hex(name, ROOT_TOKENS));
    }
  });

  it("DESIGN.md's Flavor Family Colors table carries the same nine values", () => {
    const doc = readFileSync(path.join(ROOT, "DESIGN.md"), "utf8");
    const start = doc.indexOf("### Flavor Family Colors");
    const table = doc.slice(start, doc.indexOf("\n### ", start + 1));
    const listed = [...table.matchAll(/`(#[0-9a-fA-F]{6})`/g)].map((m) => m[1].toLowerCase()).sort();
    const tokens = Object.keys(TOKEN_TO_FAMILY).map((t) => hex(`--color-flavor-${t}`, ROOT_TOKENS)).sort();
    expect(listed).toEqual(tokens);
  });
});

import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, View, renderToBuffer } from "@react-pdf/renderer";
import { L1_GROUP_COLOR } from "@/lib/constants";
import { WHEEL_FAMILY_ORDER, countedDescriptors, countedFamilies, type WheelPeople } from "@/lib/flavorWheel";
import { PdfCountedList, PdfFlavorCompare, PdfFlavorWheel, type PdfCompareCoffee } from "@/lib/pdf/charts";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { PDF_FLAVOR_FAMILY_COLORS, PDF_PALETTE, type PdfFlavorFamilyColors } from "@/lib/pdf/palette";
import { WHEEL_FIXTURES, wheelFamilyLabels, wheelNodeLabels, type WheelFixtureName } from "@/lib/dev/wheelFixtures";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

// Package R5a: the flavour wheel and its comparison drawn with react-pdf.
// What they LOOK like is checked by a person (scripts/render-wheel-preview.tsx);
// here: they render for every fixture, and the colours come from one place.

registerPdfFonts();

const ES = wheelFamilyLabels("es");
const EN = wheelFamilyLabels("en");
const NAMES = Object.keys(WHEEL_FIXTURES) as WheelFixtureName[];
const coffee = (tag: string, people: WheelPeople, name = `Muestra ${tag}`): PdfCompareCoffee => ({
  id: tag,
  tag,
  name,
  counts: people.rollup,
  n: people.n,
});

/** Render a list of drawings, one per page, and return the PDF's bytes. */
async function render(children: ReactElement[]): Promise<Buffer> {
  const pages = children.map((child, i) =>
    createElement(Page, { key: i, size: "A4", style: { padding: 36 } }, createElement(View, null, child)),
  );
  return renderToBuffer(createElement(Document, null, pages));
}
const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString("latin1") === "%PDF-" && buffer.length > 1500;

describe("the family colours come from one place", () => {
  it("the map covers exactly the nine families of the wheel", () => {
    expect(Object.keys(PDF_FLAVOR_FAMILY_COLORS).sort()).toEqual([...WHEEL_FAMILY_ORDER].sort());
    expect(Object.keys(PDF_FLAVOR_FAMILY_COLORS)).toHaveLength(9);
    for (const colour of Object.values(PDF_FLAVOR_FAMILY_COLORS)) expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("it is today's flavour-family colours, family by family, with no second copy", () => {
    for (const family of WHEEL_FAMILY_ORDER) expect(PDF_FLAVOR_FAMILY_COLORS[family]).toBe(L1_GROUP_COLOR[family]);
    const src = readFileSync(path.resolve(__dirname, "..", "lib/pdf/palette.ts"), "utf8");
    const block = src.slice(src.indexOf("export const PDF_FLAVOR_FAMILY_COLORS"));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // derived, not retyped
  });

  it("no hex literal outside lib/pdf/palette.ts: the drawings, the fixtures and the preview hold none", () => {
    for (const file of ["lib/pdf/charts.tsx", "lib/flavorWheel.ts", "lib/dev/wheelFixtures.ts", "scripts/render-wheel-preview.tsx"]) {
      const src = readFileSync(path.resolve(__dirname, "..", file), "utf8");
      expect(src, file).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/);
    }
  });

  it("the palette's own entries were not edited", () => {
    // the values the existing reports draw with (lib/pdf/palette.ts on main)
    expect(PDF_PALETTE.mine).toBe("#2c4c3b");
    expect(PDF_PALETTE.community).toBe("#9d4326");
    expect(PDF_PALETTE.grid).toBe("#c1c8c2");
    expect(PDF_PALETTE.reference).toBe("#727973");
    expect(PDF_PALETTE.ink).toBe("#111111");
    expect(Object.keys(PDF_PALETTE)).toHaveLength(12);
  });
});

describe("the drawings hold no words of their own", () => {
  it("lib/pdf/charts.tsx takes every label as a prop", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "lib/pdf/charts.tsx"), "utf8");
    const added = src.slice(src.indexOf("PdfFlavorWheel, PdfFlavorCompare, PdfCountedList (package R5a)"));
    expect(added.length).toBeGreaterThan(1000);
    // no Spanish or English word of the interface inside a string or JSX text of the new block
    const code = added.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/["'`>](de|of|Floral|Frutal|Fruity|catadores|cuppers|Familias|Families)["'`<]/);
    // ... nor the "de" / "of" between a count and its total, typed into a template
    expect(code).not.toMatch(/["'`>}]\s*(de|of)\s+[$"'`{]/);
    expect(code).toMatch(/\$\{ofWord\}/);
    expect(code).not.toMatch(/label_es|label_en|getTranslations|next-intl/);
  });
});

describe("they render for every fixture", { timeout: HEAVY_TEST_TIMEOUT_MS }, () => {
  it("the wheel, full and small, in both languages", async () => {
    const drawings = NAMES.flatMap((name) => {
      const p = WHEEL_FIXTURES[name];
      return [
        createElement(PdfFlavorWheel, { counts: p.rollup, n: p.n, familyLabels: ES }),
        createElement(PdfFlavorWheel, { counts: p.rollup, n: p.n, familyLabels: EN, width: 250 }),
        createElement(PdfFlavorWheel, { counts: p.rollup, n: p.n, familyLabels: ES, size: "mini" as const }),
      ];
    });
    expect(isPdf(await render(drawings))).toBe(true);
  });

  it("the wheel with awkward input: no counts, counts over n, a width under the minimum, names with emoji", async () => {
    const odd = { ...ES, fruity: "Frutal 🍓 con un nombre muy muy largo/Y otra parte también larga", other: "" };
    const drawings = [
      createElement(PdfFlavorWheel, { counts: {}, n: 0, familyLabels: ES }),
      createElement(PdfFlavorWheel, { counts: { fruity: 99, floral: -3 }, n: 5, familyLabels: odd, width: 40 }),
      createElement(PdfFlavorWheel, { counts: { fruity: 2 }, n: 2, familyLabels: odd, size: "mini" as const, width: 20 }),
      createElement(PdfFlavorWheel, {
        counts: WHEEL_FIXTURES.ambar.rollup,
        n: 7,
        familyLabels: ES,
        colors: Object.fromEntries(WHEEL_FAMILY_ORDER.map((f) => [f, PDF_PALETTE.ink])) as PdfFlavorFamilyColors,
      }),
    ];
    expect(isPdf(await render(drawings))).toBe(true);
  });

  it("the comparison: one, two and three coffees alone", async () => {
    const { ambar, musgo, cedro, niebla, tres, cuatro, doce, nadie, vacio } = WHEEL_FIXTURES;
    const drawings = [
      createElement(PdfFlavorCompare, { others: [coffee("G", ambar)], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { others: [coffee("G", ambar), coffee("D", musgo)], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { others: [coffee("G", ambar), coffee("D", musgo), coffee("H", cedro)], familyLabels: EN, ofWord: "of", width: 250 }),
      // a fourth is not drawn (the geometry's limit), and nothing breaks
      createElement(PdfFlavorCompare, { others: [coffee("A", niebla), coffee("T", tres), coffee("B", cuatro), coffee("P", doce)], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { others: [coffee("X", nadie), coffee("V", vacio)], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { others: [], familyLabels: ES, ofWord: "de" }),
    ];
    expect(isPdf(await render(drawings))).toBe(true);
  });

  it("the comparison over a coffee's petals, with panels of different sizes", async () => {
    const { ambar, musgo, cedro, cuatro, doce, niebla, nadie } = WHEEL_FIXTURES;
    const drawings = [
      createElement(PdfFlavorCompare, { base: coffee("G", ambar), others: [coffee("D", musgo)], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { base: coffee("G", ambar), others: [coffee("H", cedro), coffee("B", cuatro)], familyLabels: ES, ofWord: "de", width: 250 }),
      createElement(PdfFlavorCompare, { base: coffee("A", niebla), others: [coffee("P", doce)], familyLabels: EN, ofWord: "of" }),
      createElement(PdfFlavorCompare, { base: coffee("X", nadie), others: [coffee("G", ambar, "Ámbar 🍒 (natural)")], familyLabels: ES, ofWord: "de" }),
      createElement(PdfFlavorCompare, { base: coffee("G", ambar), others: [], familyLabels: ES, ofWord: "de" }),
    ];
    expect(isPdf(await render(drawings))).toBe(true);
  });

  it("the counted list: families and descriptors, with and without marks", async () => {
    const labels = wheelNodeLabels("es");
    const drawings = NAMES.flatMap((name) => {
      const p = WHEEL_FIXTURES[name];
      const descriptors = countedDescriptors(p.direct, p.n);
      return [
        createElement(PdfCountedList, { items: countedFamilies(p.rollup, p.n), labels, ofWord: "de", width: 220 }),
        createElement(PdfCountedList, {
          items: descriptors,
          labels: {}, // a missing name falls back to the id, it does not throw
          ofWord: "of",
          width: 160,
          maxRows: 4,
          marked: descriptors.slice(0, 2).map((d) => d.id),
          markLabel: "elegido por ti",
        }),
      ];
    });
    expect(isPdf(await render(drawings))).toBe(true);
  });

  it("the counted list with one row, and with none", async () => {
    const labels = wheelNodeLabels("en");
    const one = countedFamilies({ fruity: 3 }, 3);
    expect(one).toHaveLength(1);
    const drawings = [
      createElement(PdfCountedList, { items: one, labels, ofWord: "of", width: 200, marked: ["fruity"], markLabel: "chosen by you" }),
      createElement(PdfCountedList, { items: [], labels, ofWord: "of", width: 200, markLabel: "chosen by you" }),
    ];
    expect(isPdf(await render(drawings))).toBe(true);
  });
});

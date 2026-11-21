import { describe, it, expect } from "vitest";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FlavorCompare, type CompareCoffee } from "@/components/results/FlavorCompare";
import { FlavorWheel, WheelCaption } from "@/components/results/FlavorWheel";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { captionParts, wheelCaptionText } from "@/components/results/wheelCaption";
import { L1_GROUP_COLOR } from "@/lib/constants";
import { WHEEL_FIXTURES, wheelFamilyLabels, type WheelFixtureName } from "@/lib/dev/wheelFixtures";
import { fillPattern } from "@/lib/fillPattern";
import {
  WHEEL_FAMILY_ORDER,
  WHEEL_FRAMES,
  compareGeometry,
  familyCounts,
  wheelGeometry,
  type WheelFrame,
} from "@/lib/flavorWheel";
import { wheelHeadline } from "@/lib/flavorWheelLayout";
import { WHEEL_GROUND_SHARE, familyGrounds, petalTipPath, wheelShape } from "@/lib/flavorWheelShape";
import { PdfFlavorCompare, PdfFlavorWheel } from "@/lib/pdf/charts";
import { PDF_FLAVOR_FAMILY_COLORS, PDF_FLAVOR_FAMILY_GROUNDS, PDF_PALETTE, pdfPaleTint } from "@/lib/pdf/palette";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

// Package R1d: the owner chose the wheel with a pale ground per family
// ("option C") for the large AND the small wheel, and asked for the large one to
// lose its inner lines and be the mirror of the small one. What it LOOKS like is
// checked by a person (the dev page, scripts/render-wheel-preview.tsx); here:
// the wheel draws no inner ring, the two sizes share one drawing rule, the tint
// is never text, and the page and the PDF draw the same list of shapes.

const LOCALES = ["es", "en"] as const;
const MESSAGES = { es, en } as const;
const NAMES = Object.keys(WHEEL_FIXTURES) as WheelFixtureName[];
const SIZES = ["full", "mini"] as const;
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);

function stringsOf(locale: (typeof LOCALES)[number]) {
  const parts = MESSAGES[locale].results.parts as Record<string, string>;
  return buildResultsPartsStrings({ raw: (key: string) => parts[key.replace(/^parts\./, "")] });
}
const frameOf = (size: (typeof SIZES)[number]): WheelFrame => (size === "mini" ? WHEEL_FRAMES.mini : WHEEL_FRAMES.full);

/** What a piece of page markup draws: every path and circle, in order, by kind. */
type Mark = { kind: string; d?: string; r?: string };
function pageMarks(markup: string): Mark[] {
  const svg = markup.slice(markup.indexOf("<svg"), markup.indexOf("</svg>"));
  return [...svg.matchAll(/<(path|circle)\b([^>]*)>/g)].map((m) => {
    const cls = (m[2].match(/class="([^"]*)"/) ?? ["", ""])[1];
    const kind = (cls.match(/_(ground|petal|tip|ringOuter|ring|territory|under|centre|tagDisc|tagRing|fillA\d)_/) ?? ["", `?${cls}`])[1];
    const d = (m[2].match(/\bd="([^"]*)"/) ?? [])[1];
    const r = (m[2].match(/\br="([^"]*)"/) ?? [])[1];
    return m[1] === "path" ? { kind, d } : { kind, r };
  });
}
const wheelMarkup = (name: WheelFixtureName, size: (typeof SIZES)[number], locale: (typeof LOCALES)[number] = "es") =>
  html(
    createElement(FlavorWheel, {
      counts: WHEEL_FIXTURES[name].rollup,
      n: WHEEL_FIXTURES[name].n,
      familyLabels: wheelFamilyLabels(locale),
      strings: stringsOf(locale).wheel,
      size,
    }),
  );

/** Every element of a react-pdf tree, flattened. */
function pdfElements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(pdfElements);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...pdfElements(el.props.children as ReactNode)];
}
/** What a PDF wheel draws inside its labels, by the same kinds as the page. */
function pdfMarks(node: ReactNode): (Mark & { fill?: unknown; stroke?: unknown })[] {
  return pdfElements(node)
    .filter((el) => el.type === "PATH" || el.type === "CIRCLE")
    .map((el) => {
      const key = String(el.key ?? "");
      const kind = key.startsWith("ground-")
        ? "ground"
        : key.startsWith("petal-")
          ? "petal"
          : key.startsWith("tip-")
            ? "tip"
            : key === "ring-outer"
              ? "ringOuter"
              : `?${key}`;
      return el.type === "PATH"
        ? { kind, d: String(el.props.d), fill: el.props.fill, stroke: el.props.stroke }
        : { kind, r: String(el.props.r), fill: el.props.fill, stroke: el.props.stroke };
    });
}

// WCAG relative luminance and contrast, to state the measured ratios.
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("wheelShape: what one wheel draws", () => {
  it("nine grounds for a panel, none without one; a petal per family found; a tip where a petal stops short", () => {
    for (const name of NAMES) {
      for (const size of SIZES) {
        const p = WHEEL_FIXTURES[name];
        const g = wheelGeometry(p.rollup, p.n, frameOf(size));
        const shape = wheelShape(g);
        const counts = familyCounts(p.rollup, p.n);
        expect(shape.grounds.map((x) => x.family), name).toEqual(g.n > 0 ? [...WHEEL_FAMILY_ORDER] : []);
        expect(shape.petals.map((x) => x.family), name).toEqual(WHEEL_FAMILY_ORDER.filter((_, i) => counts[i] > 0));
        expect(shape.tips.map((x) => x.family), name).toEqual(
          WHEEL_FAMILY_ORDER.filter((_, i) => counts[i] > 0 && counts[i] < g.n),
        );
        expect(shape.ring, name).toBe(frameOf(size).R);
      }
    }
  });

  it("a ground is the petal of everyone, and a petal's length is still its count (the geometry is untouched)", () => {
    const frame = WHEEL_FRAMES.full;
    const p = WHEEL_FIXTURES.cedro; // one family found by all six
    const g = wheelGeometry(p.rollup, p.n, frame);
    const shape = wheelShape(g);
    const full = g.petals.filter((x) => x.count === g.n);
    expect(full.length).toBeGreaterThan(0);
    for (const petal of full) {
      expect(shape.grounds.find((x) => x.family === petal.family)?.d).toBe(petal.d);
      expect(shape.tips.some((x) => x.family === petal.family)).toBe(false); // the ring is its edge
    }
    // equal steps per person, from the centre (0) to the ring (everyone)
    const step = (frame.R - frame.r0) / g.n;
    for (const petal of g.petals) expect(petal.radius).toBeCloseTo(frame.r0 + step * petal.count, 1);
    expect(familyGrounds(frame, 0)).toEqual([]);
  });

  it("a tip lies exactly on the outer edge of its petal", () => {
    for (const name of NAMES) {
      for (const size of SIZES) {
        const p = WHEEL_FIXTURES[name];
        const frame = frameOf(size);
        const g = wheelGeometry(p.rollup, p.n, frame);
        for (const tip of wheelShape(g).tips) {
          const petal = g.petals.find((x) => x.family === tip.family);
          expect(petal?.d?.startsWith(`${tip.d} L `), `${name} ${tip.family}`).toBe(true);
          expect(petalTipPath(frame, petal?.index ?? 0, petal?.radius ?? 0)).toBe(tip.d);
        }
      }
    }
  });
});

describe("the wheel on the page", () => {
  it("draws no inner ring: one circle, the outer ring, in every fixture and both sizes", () => {
    for (const name of NAMES) {
      for (const size of SIZES) {
        const markup = wheelMarkup(name, size);
        const circles = pageMarks(markup).filter((m) => m.r !== undefined);
        expect(circles, `${name} ${size}`).toEqual([{ kind: "ringOuter", r: String(frameOf(size).R) }]);
        expect(markup, `${name} ${size}`).not.toMatch(/clipPath|clip-path/);
      }
    }
    const src = read("components", "results", "FlavorWheel.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/\.rings\b|wheelRings|styles\.ring\b|styles\.cut\b|useId/);
    const css = read("components", "results", "FlavorWheel.module.css");
    expect(css).not.toMatch(/\.cut\b|\.track\b/);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("the small wheel and the large one share one drawing rule: the same shapes, in the same order", () => {
    const src = read("components", "results", "FlavorWheel.tsx");
    expect((src.match(/<WheelMarks /g) ?? []).length).toBe(2); // the two sizes, nothing else
    for (const name of NAMES) {
      const p = WHEEL_FIXTURES[name];
      const kinds = (size: (typeof SIZES)[number]) => pageMarks(wheelMarkup(name, size)).map((m) => m.kind);
      expect(kinds("full"), name).toEqual(kinds("mini"));
      // and each is exactly wheelShape, in its own frame
      for (const size of SIZES) {
        const shape = wheelShape(wheelGeometry(p.rollup, p.n, frameOf(size)));
        expect(pageMarks(wheelMarkup(name, size)), `${name} ${size}`).toEqual([
          ...shape.grounds.map((x) => ({ kind: "ground", d: x.d })),
          ...shape.petals.map((x) => ({ kind: "petal", d: x.d })),
          ...shape.tips.map((x) => ({ kind: "tip", d: x.d })),
          { kind: "ringOuter", r: String(shape.ring) },
        ]);
      }
    }
  });

  it("the large wheel says, in words, what the rings no longer show: the headline, every count, the panel's size", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      const labels = wheelFamilyLabels(locale);
      for (const name of NAMES) {
        const p = WHEEL_FIXTURES[name];
        const markup = wheelMarkup(name, "full", locale);
        const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\u00a0/g, " ");
        expect(markup, name).toContain(s.wheel.mostFoundLabel);
        const caption = wheelCaptionText(wheelHeadline(p.rollup, p.n), labels, s.caption);
        expect(text.replace(/ · /g, " "), name).toContain(caption.replace(/ · /g, " ").replace(/\s+/g, " "));
        expect(markup, name).toMatch(new RegExp(`<figcaption[^>]*>${fillPattern(s.wheel.cuppers, { n: p.n })}</figcaption>`));
      }
      const one = html(
        createElement(FlavorWheel, { counts: { fruity: 1 }, n: 1, familyLabels: labels, strings: s.wheel }),
      );
      expect(one).toContain(`>${s.wheel.cuppersOne}</figcaption>`);
      const bare = html(
        createElement(FlavorWheel, {
          counts: WHEEL_FIXTURES.ambar.rollup,
          n: 7,
          familyLabels: labels,
          strings: s.wheel,
          headline: false,
        }),
      );
      expect(bare).not.toContain(s.wheel.mostFoundLabel);
      expect(bare).toContain("<figcaption"); // the panel's size is not optional
    }
  });

  it("a caption wraps at its names, never inside its tally", () => {
    expect(captionParts("Verde/Vegetal y Tostado · 5 de 7 cada una")).toEqual({
      names: "Verde/Vegetal y Tostado",
      tally: "5 de 7 cada una",
    });
    expect(captionParts("Nadie eligió un sabor.")).toEqual({ names: "Nadie eligió un sabor.", tally: null });
    for (const locale of LOCALES) {
      const s = stringsOf(locale).caption;
      for (const pattern of [s.mostFound, s.mostFoundEach, s.mostFoundMany]) {
        expect(pattern.split(" · ").length, pattern).toBe(2); // the mark the cut relies on
      }
    }
    const line = html(createElement(WheelCaption, { text: "Frutal y Dulce · 12 de 12 cada una" }));
    expect(line).toMatch(/^Frutal y Dulce\u00a0· <span class="[^"]*tally[^"]*">12 de 12 cada una<\/span>$/);
    expect(html(createElement(WheelCaption, { text: "Nadie eligió un sabor." }))).toBe("Nadie eligió un sabor.");
    expect(read("components", "results", "FlavorWheel.module.css")).toMatch(/\.tally\s*\{\s*white-space:\s*nowrap;/);
  });
});

describe("the tint", () => {
  const css = read("components", "results", "FlavorWheel.module.css");
  const rule = (name: string) => (css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`)) ?? ["", ""])[1];

  it("is the family's tone at WHEEL_GROUND_SHARE, on the page and in the PDF", () => {
    expect(rule("ground")).toMatch(/fill:\s*var\(--family-tone\)/);
    expect(Number((rule("ground").match(/fill-opacity:\s*([\d.]+)/) ?? ["", "NaN"])[1])).toBe(WHEEL_GROUND_SHARE);
    for (const family of WHEEL_FAMILY_ORDER) {
      const tone = channels(PDF_FLAVOR_FAMILY_COLORS[family]);
      const mixed = tone.map((v) => Math.round(v * WHEEL_GROUND_SHARE + 255 * (1 - WHEEL_GROUND_SHARE)));
      expect(channels(PDF_FLAVOR_FAMILY_GROUNDS[family]), family).toEqual(mixed);
      expect(PDF_FLAVOR_FAMILY_GROUNDS[family]).toBe(pdfPaleTint(PDF_FLAVOR_FAMILY_COLORS[family]));
    }
    expect(pdfPaleTint("#000", 0.5)).toBe("#808080");
    expect(pdfPaleTint("#102030", 1)).toBe("#102030");
    expect(pdfPaleTint("#102030", 0)).toBe("#ffffff");
    expect(pdfPaleTint("tomato")).toBe(PDF_PALETTE.white); // no ground rather than a wrong one
    // ONE place: the drawings never mix a colour themselves
    const charts = read("lib", "pdf", "charts.tsx");
    expect(charts).not.toMatch(/fillOpacity=\{[^}]*GROUND|WHEEL_GROUND_SHARE/);
    expect((charts.match(/pdfPaleTint\(/g) ?? []).length).toBe(1);
  });

  it("is never used for text: it paints the ground of a wheel and nothing else", () => {
    expect(rule("ground")).not.toMatch(/(^|[;\s])color\s*:/);
    // no rule but .ground lowers a family tone, and no text rule reads the tone at all
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      if (/fill-opacity/.test(body) && /--family-tone/.test(body)) expect(selector.trim()).toBe(".ground");
      if (/\.(count|countMuted|name|nameMuted|headline|eyebrow|caption|tally|tagText|legend|table)\b/.test(selector)) {
        expect(body, selector).not.toContain("--family-tone");
      }
    }
    // on the page, a family's tone class is only ever on a ground or a petal of the wheel
    for (const name of NAMES) {
      const markup = wheelMarkup(name, "full");
      for (const tag of markup.matchAll(/<(\w+)\b[^>]*class="([^"]*)"/g)) {
        const toned = WHEEL_FAMILY_ORDER.some((family) => new RegExp(`_${family}_`).test(tag[2]));
        if (toned) expect(`${tag[1]} ${tag[2]}`, name).toMatch(/^path .*_(ground|petal)_/);
      }
    }
  });

  it("stays clearly apart from the tone; where it cannot reach 3 : 1, the petal's paper edge does", () => {
    const ratios = WHEEL_FAMILY_ORDER.map((family) => ({
      family,
      ground: contrast(PDF_FLAVOR_FAMILY_COLORS[family], PDF_FLAVOR_FAMILY_GROUNDS[family]),
      paper: contrast(PDF_FLAVOR_FAMILY_COLORS[family], "#ffffff"),
    }));
    // the measured ratios of the nine tones (L1_GROUP_COLOR) at this share
    expect(Math.min(...ratios.map((r) => r.ground))).toBeGreaterThan(2.6);
    expect(ratios.filter((r) => r.ground >= 2.95).length).toBeGreaterThanOrEqual(7);
    // two tones are too light for ANY visible tint of themselves to sit 3 : 1 under them
    const light = ratios.filter((r) => r.ground < 2.95).map((r) => r.family);
    expect(light.sort()).toEqual(["sour_fermented", "sweet"]);
    for (const r of ratios) expect(r.paper, r.family).toBeGreaterThanOrEqual(3); // the tip is paper
    expect(rule("tip")).toMatch(/stroke:\s*var\(--color-surface-container-lowest\)/);
    for (const family of WHEEL_FAMILY_ORDER) expect(PDF_FLAVOR_FAMILY_COLORS[family]).toBe(L1_GROUP_COLOR[family]);
  });
});

describe("the page and the PDF draw the same wheel", () => {
  it("the same shapes, the same paths, in the same order, in every fixture and both sizes", () => {
    for (const name of NAMES) {
      for (const size of SIZES) {
        const p = WHEEL_FIXTURES[name];
        const pdf = pdfMarks(PdfFlavorWheel({ counts: p.rollup, n: p.n, familyLabels: wheelFamilyLabels("es"), size }));
        const page = pageMarks(wheelMarkup(name, size));
        expect(pdf.map(({ kind, d, r }) => (d !== undefined ? { kind, d } : { kind, r })), `${name} ${size}`).toEqual(page);
        for (const mark of pdf) {
          if (mark.kind === "ground") expect(Object.values(PDF_FLAVOR_FAMILY_GROUNDS)).toContain(mark.fill);
          if (mark.kind === "petal") expect(Object.values(PDF_FLAVOR_FAMILY_COLORS)).toContain(mark.fill);
          if (mark.kind === "tip") expect(mark.stroke).toBe(PDF_PALETTE.white);
        }
      }
    }
  });

  it("neither wheel reads the rings of the geometry", () => {
    const charts = read("lib", "pdf", "charts.tsx");
    const wheel = charts.slice(charts.indexOf("export function PdfFlavorWheel"), charts.indexOf("// ── The comparison"));
    expect(wheel.length).toBeGreaterThan(400);
    expect(wheel).toContain("wheelMarkElements(wheelShape(g)");
    expect(wheel).not.toMatch(/ringElements|\.rings\b/);
  });
});

describe("the comparison follows the wheel: the dim family shades and the outer ring alone", () => {
  const coffee = (name: WheelFixtureName, tag: string): CompareCoffee => ({
    id: name,
    tag,
    name: `Café ${tag}`,
    counts: WHEEL_FIXTURES[name].rollup,
    n: WHEEL_FIXTURES[name].n,
  });
  const sets = [
    { base: null, others: [coffee("ambar", "A"), coffee("musgo", "C")] },
    { base: coffee("ambar", "A"), others: [coffee("cedro", "D")] },
    { base: coffee("niebla", "B"), others: [coffee("doce", "G")] },
  ];
  const render = (set: (typeof sets)[number]) =>
    html(
      createElement(FlavorCompare, {
        ...set,
        familyLabels: wheelFamilyLabels("es"),
        strings: stringsOf("es").compare,
      }),
    );

  it("nine grounds and the outer ring alone on the page; the PDF keeps both grounds", () => {
    for (const set of sets) {
      const marks = pageMarks(render(set));
      expect(marks.filter((m) => m.kind === "ground").length).toBe(9);
      expect(marks.filter((m) => m.kind === "ring").length).toBe(0);
      expect(marks.filter((m) => m.kind === "ringOuter").length).toBe(1);
      const pdf = (ground?: "rings" | "families") =>
        pdfElements(
          PdfFlavorCompare({ ...set, familyLabels: wheelFamilyLabels("es"), ofWord: "de", ...(ground ? { ground } : {}) }),
        );
      const rings = (els: ReturnType<typeof pdfElements>) => els.filter((el) => String(el.key).startsWith("ring-")).length;
      const grounds = (els: ReturnType<typeof pdfElements>) => els.filter((el) => String(el.key).startsWith("ground-")).length;
      expect(rings(pdf("families"))).toBe(1);
      expect(grounds(pdf("families"))).toBe(9);
      expect(rings(pdf())).toBeGreaterThan(1);
      expect(grounds(pdf())).toBe(0);
      // as on the page, no ring is drawn across the base coffee's petals: the
      // inner rings come before the petals, and only the outer ring after them
      const keys = pdf().map((el) => String(el.key));
      const petalAt = keys.findIndex((key) => key.startsWith("petal-"));
      if (petalAt >= 0) {
        const after = keys.slice(petalAt).filter((key) => key.startsWith("ring-"));
        expect(after.length, "rings after the petals").toBe(1);
        expect(keys.slice(0, petalAt).filter((key) => key.startsWith("ring-")).length).toBe(rings(pdf()) - 1);
      }
    }
  });
});

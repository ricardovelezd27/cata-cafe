import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CountedList } from "@/components/results/CountedList";
import { FlavorCompare, type CompareCoffee } from "@/components/results/FlavorCompare";
import { FlavorWheel } from "@/components/results/FlavorWheel";
import { RESULTS_PARTS_KEYS, buildResultsPartsStrings } from "@/components/results/partsStrings";
import { RankStrip } from "@/components/results/RankStrip";
import { joinNames, wheelCaptionText } from "@/components/results/wheelCaption";
import { CountBar } from "@/components/ui/CountBar";
import { DotPlot } from "@/components/ui/DotPlot";
import { ScoreWithContext, formatSigned } from "@/components/ui/ScoreWithContext";
import {
  SCORE_FIXTURES,
  intensityFixture,
  qualityFixture,
  rankFixtures,
  type FixtureLocale,
} from "@/lib/dev/resultsPartsFixtures";
import { WHEEL_FIXTURES, wheelFamilyLabels, wheelNodeLabels, type WheelFixtureName } from "@/lib/dev/wheelFixtures";
import { fillPattern } from "@/lib/fillPattern";
import {
  WHEEL_FAMILY_ORDER,
  WHEEL_FRAMES,
  compareGeometry,
  countedDescriptors,
  countedFamilies,
  familyCounts,
} from "@/lib/flavorWheel";
import {
  WHEEL_LABEL_METRICS,
  WHEEL_SCALE_LIMITS,
  fitWheelLabels,
  wheelHeadline,
} from "@/lib/flavorWheelLayout";
import { INTENSITY_SCALE, QUALITY_SCALE, SCORE_SCALE, countBar, tieBars, tiesWithNext } from "@/lib/resultsScales";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Package R1b: the results parts on screen. What they LOOK like is checked by a
// person on the dev page (app/[locale]/dev/results-parts); here: every part
// renders every fixture, its text equivalent carries the numbers of its drawing,
// and no part restates a colour, a threshold or a piece of geometry.

const LOCALES: FixtureLocale[] = ["es", "en"];
const MESSAGES = { es, en } as const;
const NAMES = Object.keys(WHEEL_FIXTURES) as WheelFixtureName[];
const html = (el: ReactElement) => renderToStaticMarkup(el);
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

function stringsOf(locale: FixtureLocale) {
  const parts = MESSAGES[locale].results.parts as Record<string, string>;
  return buildResultsPartsStrings({ raw: (key: string) => parts[key.replace(/^parts\./, "")] });
}
const coffee = (name: WheelFixtureName, tag: string): CompareCoffee => ({
  id: name,
  tag,
  name: `Café ${tag}`,
  counts: WHEEL_FIXTURES[name].rollup,
  n: WHEEL_FIXTURES[name].n,
});
/** The text of every SVG <text> of a piece of markup. */
const svgTexts = (markup: string) => [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const ariaLabel = (markup: string) => (markup.match(/aria-label="([^"]*)"/) ?? ["", ""])[1];

describe("the messages of the parts (results.parts)", () => {
  it("hold exactly the keys the builder reads, in both languages", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale].results.parts)).toEqual([...RESULTS_PARTS_KEYS]);
    }
  });
  it("carry the same placeholders in Spanish and in English", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of RESULTS_PARTS_KEYS) {
      expect(holes(en.results.parts[key]), key).toEqual(holes(es.results.parts[key]));
    }
  });
  it("leave no placeholder unfilled in anything a part prints", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      const f = wheelFamilyLabels(locale);
      const all = [
        html(createElement(FlavorWheel, { counts: WHEEL_FIXTURES.ambar.rollup, n: 7, familyLabels: f, strings: s.wheel })),
        html(createElement(FlavorCompare, { base: coffee("ambar", "A"), others: [coffee("cedro", "D")], familyLabels: f, strings: s.compare })),
        ...rankFixtures(locale).map((r) =>
          html(createElement(RankStrip, { items: r.rows, reference: r.reference, strings: s.rank, scoreStrings: s.score })),
        ),
        html(createElement(DotPlot, { scale: QUALITY_SCALE, items: qualityFixture(locale), strings: s.dotPlot })),
        ...SCORE_FIXTURES.map((x) => html(createElement(ScoreWithContext, { context: x.context, strings: s.score }))),
      ].join("\n");
      expect(all).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(all).not.toContain("undefined");
    }
  });
});

describe("fillPattern", () => {
  it("fills what it is given and leaves a missing placeholder as written", () => {
    expect(fillPattern("{count} de {n}", { count: 6, n: 7 })).toBe("6 de 7");
    expect(fillPattern("{a} y {b}", { a: "x" })).toBe("x y {b}");
    expect(fillPattern("sin huecos", {})).toBe("sin huecos");
  });
});

describe("fitWheelLabels", () => {
  const widths = [240, 256, 288, 320, 343, 420, 640];
  const cases = LOCALES.flatMap((locale) =>
    NAMES.flatMap((name) =>
      widths.flatMap((width) => [
        { locale, name, width, numbers: true },
        { locale, name, width, numbers: false },
      ]),
    ),
  );
  const layoutOf = (c: (typeof cases)[number]) => {
    const frame = c.numbers ? WHEEL_FRAMES.full : WHEEL_FRAMES.compare;
    const labels = wheelFamilyLabels(c.locale);
    const counts = familyCounts(WHEEL_FIXTURES[c.name].rollup, WHEEL_FIXTURES[c.name].n);
    return {
      frame,
      layout: fitWheelLabels({
        frame,
        width: c.width,
        texts: WHEEL_FAMILY_ORDER.map((f, i) => ({ name: labels[f], number: c.numbers ? String(counts[i]) : null })),
      }),
    };
  };

  it("keeps every word inside the drawing, for every fixture, width and language", () => {
    const m = WHEEL_LABEL_METRICS;
    for (const c of cases) {
      const { layout } = layoutOf(c);
      const vb = layout.viewBox;
      const inside = (anchor: string, x: number, width: number) => {
        const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
        return left >= vb.x - 0.02 && left + width <= vb.x + vb.width + 0.02;
      };
      for (const label of layout.labels) {
        for (const line of label.name.lines) {
          const width = line.text.length * layout.nameSize * m.nameCharEm;
          expect(inside(label.name.anchor, label.name.x, width), JSON.stringify({ ...c, line: line.text })).toBe(true);
          expect(line.y - layout.nameSize * 0.8).toBeGreaterThanOrEqual(vb.y - 0.02);
          expect(line.y).toBeLessThanOrEqual(vb.y + vb.height + 0.02);
        }
        if (label.number) {
          const width = label.number.text.length * layout.numberSize * m.numberCharEm;
          expect(inside("middle", label.number.x, width)).toBe(true);
        }
      }
    }
  });

  it("paints the words at the same size whatever the width (the wheel shrinks, never the text)", () => {
    for (const c of cases) {
      const { layout } = layoutOf(c);
      expect(layout.k).toBeGreaterThanOrEqual(WHEEL_SCALE_LIMITS.min);
      expect(layout.k).toBeLessThanOrEqual(WHEEL_SCALE_LIMITS.max);
      expect(layout.nameSize * layout.k).toBeCloseTo(WHEEL_LABEL_METRICS.namePx, 0);
      expect(WHEEL_LABEL_METRICS.namePx).toBeGreaterThanOrEqual(12);
      // the viewBox is exactly as wide as the container at that scale
      expect(layout.viewBox.width * layout.k).toBeCloseTo(c.width, 0);
    }
  });

  it("cuts no name from 288 px up (the content of a 320 px phone)", () => {
    for (const c of cases.filter((x) => x.width >= 288)) {
      const { layout } = layoutOf(c);
      const labels = wheelFamilyLabels(c.locale);
      layout.labels.forEach((label) => {
        const printed = label.name.lines.map((l) => l.text).join("");
        expect(printed, JSON.stringify(c)).toBe(labels[label.family]);
      });
    }
  });

  it("splits a two-part name only where one line would not fit", () => {
    const labels = wheelFamilyLabels("es");
    const fit = (width: number) =>
      fitWheelLabels({
        frame: WHEEL_FRAMES.full,
        width,
        texts: WHEEL_FAMILY_ORDER.map((f) => ({ name: labels[f], number: "7" })),
      });
    const narrow = fit(288).labels.find((l) => l.family === "sour_fermented");
    expect(narrow?.name.lines.map((l) => l.text)).toEqual(["Ácido/", "Fermentado"]);
    // a name with no slash is never split
    fit(288).labels.filter((l) => !labels[l.family].includes("/")).forEach((l) => expect(l.name.lines).toHaveLength(1));
  });

  it("is deterministic, and falls back to the frame's width before the first measure", () => {
    const labels = wheelFamilyLabels("es");
    const input = { frame: WHEEL_FRAMES.full, texts: WHEEL_FAMILY_ORDER.map((f) => ({ name: labels[f], number: "3" })) };
    expect(fitWheelLabels({ ...input, width: 300 })).toEqual(fitWheelLabels({ ...input, width: 300 }));
    expect(fitWheelLabels({ ...input, width: 0 })).toEqual(fitWheelLabels({ ...input, width: WHEEL_FRAMES.full.width }));
    expect(fitWheelLabels({ ...input, width: Number.NaN })).toEqual(fitWheelLabels({ ...input, width: 0 }));
  });
});

describe("wheelHeadline and its caption", () => {
  it("names the family most people found, with its count and its n", () => {
    const h = wheelHeadline(WHEEL_FIXTURES.ambar.rollup, WHEEL_FIXTURES.ambar.n);
    expect(h).toEqual({ n: 7, count: 7, families: ["fruity"], found: 6 });
    expect(wheelCaptionText(h, wheelFamilyLabels("es"), stringsOf("es").caption)).toBe("Frutal · 7 de 7");
  });
  it("lists every family tied at the top, in the wheel's order, and counts them when they are many", () => {
    const h = wheelHeadline(WHEEL_FIXTURES.niebla.rollup, WHEEL_FIXTURES.niebla.n);
    expect(h?.count).toBe(2);
    expect(h?.families).toEqual(["floral", "fruity", "green_veg", "nutty_cocoa", "sweet"]);
    expect(wheelCaptionText(h, wheelFamilyLabels("es"), stringsOf("es").caption)).toBe("5 familias · 2 de 7 cada una");
    const two = wheelHeadline(WHEEL_FIXTURES.musgo.rollup, WHEEL_FIXTURES.musgo.n);
    expect(wheelCaptionText(two, wheelFamilyLabels("es"), stringsOf("es").caption)).toBe("Verde/Vegetal y Tostado · 5 de 7 cada una");
    expect(wheelCaptionText(two, wheelFamilyLabels("en"), stringsOf("en").caption)).toBe("Green/Vegetative and Roasted · 5 of 7 each");
  });
  it("is null when nobody picked a flavour, and the caption says so", () => {
    expect(wheelHeadline(WHEEL_FIXTURES.nadie.rollup, 7)).toBeNull();
    expect(wheelHeadline(WHEEL_FIXTURES.vacio.rollup, 0)).toBeNull();
    expect(wheelCaptionText(null, wheelFamilyLabels("es"), stringsOf("es").caption)).toBe("Nadie eligió un sabor.");
  });
  it("judges nothing: no threshold, the same sentence for a clear panel and a flat one", () => {
    const src = read("lib", "flavorWheelLayout.ts");
    const body = src.slice(src.indexOf("export function wheelHeadline"));
    expect(body).not.toMatch(/[<>]=?\s*0\.\d|share|flat|agree/i);
    expect(joinNames(["a", "b", "c"], " y ")).toBe("a, b y c");
    expect(joinNames(["a"], " y ")).toBe("a");
  });
});

describe("FlavorWheel", () => {
  it("renders every fixture, full and small, with and without its headline, in both languages", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      const f = wheelFamilyLabels(locale);
      for (const name of NAMES) {
        const p = WHEEL_FIXTURES[name];
        for (const size of ["full", "mini"] as const) {
          for (const headline of [true, false]) {
            const markup = html(
              createElement(FlavorWheel, { counts: p.rollup, n: p.n, familyLabels: f, strings: s.wheel, size, headline }),
            );
            expect(markup).toContain("<svg");
          }
        }
      }
    }
  });

  it("prints the nine counts beside the wheel and says the same nine in its label", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      const f = wheelFamilyLabels(locale);
      for (const name of NAMES) {
        const p = WHEEL_FIXTURES[name];
        const counts = familyCounts(p.rollup, p.n);
        const markup = html(createElement(FlavorWheel, { counts: p.rollup, n: p.n, familyLabels: f, strings: s.wheel }));
        const numbers = svgTexts(markup).filter((t) => /^\d+$/.test(t)).map(Number);
        expect(numbers, name).toEqual(counts);
        const label = ariaLabel(markup);
        if (counts.some((c) => c > 0)) {
          WHEEL_FAMILY_ORDER.forEach((family, i) => expect(label, name).toContain(`${f[family]} ${counts[i]}`));
        }
        expect(label).toContain(String(p.n));
      }
    }
  });

  it("draws a ground per family and one petal per family somebody found, and the small one has no words", () => {
    const s = stringsOf("es");
    const f = wheelFamilyLabels("es");
    for (const name of NAMES) {
      const p = WHEEL_FIXTURES[name];
      const found = familyCounts(p.rollup, p.n).filter((c) => c > 0).length;
      const mini = html(createElement(FlavorWheel, { counts: p.rollup, n: p.n, familyLabels: f, strings: s.wheel, size: "mini" }));
      expect((mini.match(/<path class="[^"]*_petal_/g) ?? []).length, name).toBe(found);
      expect((mini.match(/<path class="[^"]*_ground_/g) ?? []).length, name).toBe(p.n > 0 ? WHEEL_FAMILY_ORDER.length : 0);
      expect(svgTexts(mini)).toEqual([]);
      const decorative = html(
        createElement(FlavorWheel, { counts: p.rollup, n: p.n, familyLabels: f, strings: s.wheel, size: "mini", decorative: true }),
      );
      expect(decorative).toContain('aria-hidden="true"');
      expect(decorative).not.toContain("aria-label");
    }
  });
});

describe("CountedList and CountBar", () => {
  it("prints every row's count and n, the same numbers the bars are drawn from", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      const labels = wheelNodeLabels(locale);
      for (const name of NAMES) {
        const p = WHEEL_FIXTURES[name];
        for (const items of [countedFamilies(p.rollup, p.n), countedDescriptors(p.direct, p.n, 8)]) {
          const markup = html(createElement(CountedList, { items, labels, strings: s.counted }));
          if (items.length === 0) {
            expect(markup).toContain(s.counted.nobody);
            continue;
          }
          expect((markup.match(/<li[ >]/g) ?? []).length).toBe(items.length);
          for (const row of items) {
            expect(markup).toContain(fillPattern(s.counted.countOf, { count: row.bar.count, n: row.bar.n }));
            expect(markup).toContain(`width="${row.bar.pct}%"`);
          }
        }
      }
    }
  });
  it("marks what the reader chose with a ring, its words read out, and one legend line", () => {
    const s = stringsOf("es");
    const p = WHEEL_FIXTURES.ambar;
    const items = countedDescriptors(p.direct, p.n, 6);
    const marked = [items[0].id];
    const markup = html(createElement(CountedList, { items, labels: wheelNodeLabels("es"), strings: s.counted, marked }));
    expect((markup.match(/elegido por ti/g) ?? []).length).toBe(2); // the row's hidden text and the legend
    const plain = html(createElement(CountedList, { items, labels: wheelNodeLabels("es"), strings: s.counted }));
    expect(plain).not.toContain("elegido por ti");
  });
  it("a bar alone draws nothing for nobody and a full track for everyone", () => {
    const none = html(createElement(CountBar, { label: "x", bar: countBar(0, 7), valueText: "0 de 7" }));
    expect((none.match(/<rect/g) ?? []).length).toBe(1);
    const all = html(createElement(CountBar, { label: "x", bar: countBar(7, 7), valueText: "7 de 7" }));
    expect(all).toContain('width="100%"');
    expect(all).toContain("7 de 7");
  });
});

describe("FlavorCompare", () => {
  const sets: { base?: WheelFixtureName; others: WheelFixtureName[] }[] = [
    { others: ["ambar", "musgo"] },
    { others: ["ambar", "musgo", "cedro"] },
    { others: ["niebla", "tres", "cuatro"] },
    { others: ["ambar", "doce"] },
    { others: ["nadie", "vacio"] },
    { base: "ambar", others: ["cedro"] },
    { base: "ambar", others: ["cedro", "cuatro"] },
    { base: "vacio", others: ["nadie"] },
    { others: ["ambar", "musgo", "cedro", "doce"] }, // one more than a comparison draws
  ];
  const tags = "ABCDEFGHI";
  const build = (set: (typeof sets)[number]) => {
    const all = [...(set.base ? [set.base] : []), ...set.others];
    const coffees = all.map((name, i) => coffee(name, tags[i]));
    return { base: set.base ? coffees[0] : null, others: set.base ? coffees.slice(1) : coffees };
  };

  it("renders every set, alone and over a base, in both languages", () => {
    for (const locale of LOCALES) {
      for (const set of sets) {
        const { base, others } = build(set);
        const markup = html(
          createElement(FlavorCompare, { base, others, familyLabels: wheelFamilyLabels(locale), strings: stringsOf(locale).compare }),
        );
        expect(markup).toContain("<svg");
      }
    }
  });

  it("prints no number on the drawing: only names and each coffee's letter", () => {
    for (const set of sets) {
      const { base, others } = build(set);
      const markup = html(
        createElement(FlavorCompare, { base, others, familyLabels: wheelFamilyLabels("es"), strings: stringsOf("es").compare }),
      );
      const drawing = markup.slice(0, markup.indexOf("</svg>"));
      expect(svgTexts(drawing).filter((t) => /\d/.test(t))).toEqual([]);
    }
  });

  it("its table carries exactly the counts the geometry holds, each coffee with its own n", () => {
    for (const set of sets) {
      const { base, others } = build(set);
      const g = compareGeometry({
        base: base ? { id: base.id, counts: base.counts, n: base.n } : null,
        others: others.map((c) => ({ id: c.id, counts: c.counts, n: c.n })),
      });
      const s = stringsOf("es").compare;
      const markup = html(createElement(FlavorCompare, { base, others, familyLabels: wheelFamilyLabels("es"), strings: s }));
      if (g.table.rows.length === 0) {
        expect(markup).not.toContain("<table");
        continue;
      }
      const table = markup.slice(markup.indexOf("<table"));
      const cells = [...table.matchAll(/<td[^>]*>(\d+)<\/td>/g)].map((m) => Number(m[1]));
      expect(cells).toEqual(g.table.rows.flatMap((row) => row.counts));
      expect((table.match(/<th scope="row"/g) ?? []).length).toBe(g.table.rows.length);
      for (const series of g.table.series) expect(table).toContain(fillPattern(s.ofN, { n: series.n }));
      // a coffee beyond the limit is in neither the drawing's legend nor the table
      expect((table.match(/<th scope="col"/g) ?? []).length).toBe(g.table.series.length + 1);
    }
  });

  it("tells the coffees apart by line style as well as colour", () => {
    const css = read("components", "results", "FlavorWheel.module.css");
    const rule = (name: string) => (css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`)) ?? ["", ""])[1];
    expect(rule("lineA0")).not.toContain("dasharray");
    expect(rule("lineA1")).toContain("stroke-dasharray");
    expect(rule("lineA2")).toContain("stroke-dasharray");
    expect(rule("lineA1")).not.toBe(rule("lineA2"));
    expect(rule("lineO0")).not.toContain("dasharray");
    expect(rule("lineO1")).toContain("stroke-dasharray");
  });
});

describe("RankStrip", () => {
  it("renders every ranking and prints every score with two decimals", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale);
      for (const fixture of rankFixtures(locale)) {
        const markup = html(
          createElement(RankStrip, { items: fixture.rows, reference: fixture.reference, strings: s.rank, scoreStrings: s.score }),
        );
        expect((markup.match(/<li[ >]/g) ?? []).length).toBe(fixture.rows.length);
        for (const row of fixture.rows) {
          expect(markup).toContain((row.context.score as number).toFixed(2));
          expect(markup).toContain(row.label);
        }
      }
    }
  });

  it("joins tied neighbours with one bar and says the tie in words for a screen reader", () => {
    const s = stringsOf("es");
    const panel = rankFixtures("es")[0];
    const entries = panel.rows.map((r) => r.tie);
    expect(tieBars(entries)).toEqual([{ from: 0, to: 2 }]);
    const markup = html(
      createElement(RankStrip, { items: panel.rows, reference: panel.reference, strings: s.rank, scoreStrings: s.score }),
    );
    const tied = tiesWithNext(entries);
    panel.rows.forEach((row, i) => {
      const sentence = fillPattern(s.rank.tieWithNext, { label: panel.rows[i + 1]?.label ?? "" });
      if (tied[i]) expect(markup).toContain(sentence);
    });
    expect((markup.match(/Sin diferencia clara con/g) ?? []).length).toBe(tied.filter(Boolean).length);
    expect(markup).toContain(s.rank.legendTie);
    // the words of the tie are the bar's, not a badge on every row
    expect(markup).not.toContain(`>${s.score.noClearGap}<`);
  });

  it("draws the group only where there is one, and a reference as a line with its legend", () => {
    const s = stringsOf("es");
    const [panel, two, solo] = rankFixtures("es").map((f) =>
      html(createElement(RankStrip, { items: f.rows, reference: f.reference, strings: s.rank, scoreStrings: s.score })),
    );
    expect(panel).toContain(s.rank.legendSpread);
    expect(panel).toContain("referencia: Muestra E, 79.00");
    expect(two).toContain(s.rank.legendGroup);
    expect(two).not.toContain(s.rank.legendSpread);
    expect(solo).not.toContain(`>${s.rank.legendGroup}<`);
    expect(solo).not.toContain(s.rank.legendSpread);
    // a score under the scale: its mark sits at the edge, and the row says so
    expect(panel).toContain(fillPattern(s.rank.offScale, { min: SCORE_SCALE.min, max: SCORE_SCALE.max }));
    expect(two).not.toContain("Fuera de la escala");
  });
});

describe("DotPlot", () => {
  it("prints both numbers at the end of every row, and a dash where the group has none", () => {
    for (const locale of LOCALES) {
      const s = stringsOf(locale).dotPlot;
      const rows = qualityFixture(locale);
      const markup = html(createElement(DotPlot, { scale: QUALITY_SCALE, items: rows, strings: s }));
      expect((markup.match(/<li[ >]/g) ?? []).length).toBe(rows.length);
      for (const row of rows) {
        const group = row.group === null ? s.none : row.group.toFixed(1);
        expect(markup).toContain(fillPattern(s.both, { mine: String(row.mine), group }));
      }
      // a missing group value draws no dot: one filled circle fewer than rows
      const dots = (markup.match(/r="5"/g) ?? []).length;
      expect(dots).toBe(rows.filter((r) => r.group !== null).length + 1); // + the legend's
    }
  });
  it("without a group series it prints and draws the reader only", () => {
    const s = stringsOf("es").dotPlot;
    const rows = intensityFixture("es");
    const markup = html(createElement(DotPlot, { scale: INTENSITY_SCALE, items: rows, strings: s, showGroup: false }));
    expect(markup).not.toContain("grupo");
    expect(markup).toContain("tú 15");
    expect(markup).toContain('cx="0%"');
    expect(markup).toContain('cx="100%"');
  });
});

describe("ScoreWithContext", () => {
  const byId = (id: string) => SCORE_FIXTURES.find((f) => f.id === id)?.context;
  const render = (id: string, props: Record<string, unknown> = {}) => {
    const context = byId(id);
    if (!context) throw new Error(id);
    return html(createElement(ScoreWithContext, { context, strings: stringsOf("es").score, ...props }));
  };
  it("renders every fixture and prints the number in ink, with two decimals", () => {
    for (const f of SCORE_FIXTURES) {
      const markup = render(f.id);
      expect(markup).toContain(f.context.score === null ? "–" : f.context.score.toFixed(2));
    }
  });
  it("with one or two cuppers: the n, no spread and no difference", () => {
    for (const id of ["one", "two"]) {
      const markup = render(id);
      expect(markup).toContain("incluidos");
      expect(markup).not.toContain("±");
      expect(markup).not.toContain("diferencia");
      expect(markup).toContain("indicativo");
    }
  });
  it("from three: the spread and the difference, each with its sign", () => {
    const three = render("three");
    expect(three).toContain("±");
    expect(three).toContain("+1.25");
    expect(three).toContain("vs. referencia");
    const six = render("six");
    expect(six).toContain("−2.00");
    expect(six).toContain("sin diferencia clara");
    expect(six).not.toContain("indicativo");
  });
  it("a solo cupper's score carries its own words and nothing of a group", () => {
    const solo = render("solo");
    expect(solo).toContain("tu puntaje");
    expect(solo).not.toContain("incluidos");
    expect(render("none")).toContain("sin puntaje");
  });
  it("brief: only what tells how firm the number is", () => {
    const brief = render("six", { detail: "brief", showScore: false });
    expect(brief).toContain("±");
    expect(brief).toContain("6 de 6 incluidos");
    expect(brief).not.toContain("tú");
    expect(brief).not.toContain("Δ");
    expect(brief).not.toContain("sin diferencia clara");
    expect(brief).not.toContain("88.75");
  });
  it("signs a difference in ink: plus, a real minus, and no sign for zero", () => {
    expect(formatSigned(2)).toBe("+2.00");
    expect(formatSigned(-0.5)).toBe("−0.50");
    expect(formatSigned(0)).toBe("0.00");
    expect(formatSigned(-0.001)).toBe("0.00");
  });
});

// ── What the parts must NOT hold ─────────────────────────────────────────────

const PART_DIRS: [string, RegExp][] = [
  ["components/results", /^(FlavorWheel|FlavorCompare|CountedList|RankStrip|partsStrings|wheelCaption)\./],
  ["components/ui", /^(CountBar|DotPlot|ScoreWithContext|familyTone)\./],
  ["app/[locale]/dev/results-parts", /./],
  ["hooks", /^useElementWidth\./],
];
const partFiles = () =>
  PART_DIRS.flatMap(([dir, match]) =>
    readdirSync(path.join(process.cwd(), dir))
      .filter((f) => match.test(f))
      .map((f) => `${dir}/${f}`),
  );

describe("the parts hold no colour, threshold or geometry of their own", () => {
  it("there are the files this test expects", () => {
    const files = partFiles();
    for (const name of ["FlavorWheel.tsx", "FlavorCompare.tsx", "CountedList.tsx", "RankStrip.tsx", "CountBar.tsx", "DotPlot.tsx", "ScoreWithContext.tsx"]) {
      expect(files.some((f) => f.endsWith(`/${name}`)), name).toBe(true);
    }
    expect(files.filter((f) => f.endsWith(".module.css")).length).toBeGreaterThanOrEqual(7);
  });

  it("no hex colour, rgb() or named colour: every colour is a token", () => {
    for (const file of partFiles()) {
      const src = read(...file.split("/"));
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, file).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
      if (file.endsWith(".css")) {
        const colours = [...src.matchAll(/(?:^|[;{\s])(?:color|fill|stroke|background|border|border-(?:top|bottom|left|right|color)|border-bottom-color|outline)\s*:\s*([^;]+);/g)].map((m) => m[1]);
        for (const value of colours) {
          expect(/var\(--|none|transparent|\b0\b|currentColor|inherit/.test(value), `${file}: ${value}`).toBe(true);
        }
      }
    }
  });

  it("the nine families map to their nine tokens, once", () => {
    const css = read("components", "ui", "familyTone.module.css");
    const rules = [...css.matchAll(/\.([a-z_]+)\s*\{\s*--family-tone:\s*var\(--color-flavor-([a-z]+)\);\s*\}/g)];
    expect(rules.map((r) => r[1])).toEqual([...WHEEL_FAMILY_ORDER]);
    expect(new Set(rules.map((r) => r[2])).size).toBe(WHEEL_FAMILY_ORDER.length);
    const tokens = read("app", "globals.css");
    for (const rule of rules) expect(tokens).toContain(`--color-flavor-${rule[2]}:`);
  });

  it("a family tone paints a shape, never text or the ground behind text", () => {
    for (const file of partFiles().filter((f) => f.endsWith(".css"))) {
      const src = read(...file.split("/"));
      for (const rule of src.matchAll(/([^{}]+)\{([^}]*var\(--family-tone\)[^}]*)\}/g)) {
        const [, selector, body] = rule;
        // only fill / background of a mark; never `color:` (text)
        expect(body, `${file} ${selector}`).not.toMatch(/(^|[;\s])color\s*:\s*var\(--family-tone\)/);
        expect(/\.(dot|fill|petal|ground|familyDot)\b/.test(selector), `${file} ${selector}`).toBe(true);
      }
    }
  });

  it("no threshold, scale end or policy is written in a component", () => {
    for (const file of partFiles().filter((f) => /components\/.*\.tsx?$/.test(f))) {
      const src = read(...file.split("/"));
      expect(src, file).not.toContain("@/lib/reports/ranking");
      expect(src, file).not.toMatch(/RANKING_POLICY|MIN_N\b|minN\b|indicativeBelow/);
      // a number of cuppers is never compared with a literal
      expect(src, file).not.toMatch(/\b(n|included|cuppers|total)\s*(>=|<=|<|>)\s*\d/);
      // the ends and the neutral point of the score scale come from SCORE_SCALE
      expect(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), file).not.toMatch(/\b(58|79)\b/);
    }
  });

  it("no geometry is computed in a component: angles and points come from lib/flavorWheel.ts", () => {
    for (const file of partFiles().filter((f) => /\.tsx?$/.test(f))) {
      const src = read(...file.split("/"));
      expect(src, file).not.toMatch(/Math\.(cos|sin|tan|atan2?|PI)\b/);
      expect(src, file).not.toMatch(/PETAL_HALF_DEG|PLATEAU_HALF_DEG|JOIN_PULL_DEG|SECTOR_DEG|petalPath|petalTipPath/);
    }
  });

  it("the client components take their words as props (no useTranslations), and nothing is stored", () => {
    for (const file of partFiles().filter((f) => /\.tsx?$/.test(f))) {
      const src = read(...file.split("/")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/useTranslations|localStorage|sessionStorage|from "@\/lib\/prisma"|server-only/);
    }
  });

  it("the dev page is a 404 outside development, checked first, and reads no data", () => {
    const page = read("app", "[locale]", "dev", "results-parts", "page.tsx");
    const body = page.slice(page.indexOf("export default async function"));
    expect(body.indexOf('if (process.env.NODE_ENV !== "development") notFound();')).toBeGreaterThan(0);
    expect(body.indexOf("notFound()")).toBeLessThan(body.indexOf("await params"));
    for (const file of partFiles().filter((f) => f.startsWith("app/"))) {
      expect(read(...file.split("/")), file).not.toMatch(/supabase|prisma|cookies\(|fetch\(/);
    }
  });
});

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PanelMatrix, type PanelMatrixStrings } from "@/components/results/PanelMatrix";
import { RESULTS_PANEL_KEYS, buildPanelStrings, pendingSentence } from "@/components/results/panelStrings";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { bandFor, rowStats } from "@/lib/reports/cupperStats";
import {
  PANEL_DISTANCE_MIN_N,
  PANEL_MATRIX_ROWS,
  alignmentBars,
  buildPanelMatrix,
  panelCellValue,
  panelMarks,
  panelPending,
  type AlignmentInput,
  type PanelParticipant,
  type PanelSample,
} from "@/lib/reports/panel";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Package R5: the organizer's Panel. The model arranges what the organizer's
// page already holds (lib/reports/panel.ts); the drawing puts a mark in a cell
// so colour is never alone, and one neutral bar per cupper for the alignment.
// What every control DOES is not this package's: the exclusion, the late
// evaluations and the notes keep their own tests.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const LOCALES = ["es", "en"] as const;
const MESSAGES = { es, en } as const;
const block = (locale: "es" | "en") => (MESSAGES[locale].results as unknown as Record<string, Record<string, string>>).panel;

/** Every quality attribute rated `level` (1 to 9): 5 is 79.00, each step is 5.25 points. */
const rated = (level: number, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  level === 0 ? {} : { ...Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, level])), ...extra };
const total = (level: number) => 0.65625 * 8 * level + 52.75;

const sample = (id: string, level: number, more: Partial<PanelSample> = {}): PanelSample => ({
  id,
  label: `Muestra ${id.toUpperCase()}`,
  revealed: false,
  coffee: null,
  descriptive: {},
  affective: rated(level),
  combined: {},
  ...more,
});

/** Cuppers by name, each with a level per sample ("a", "b", ...). */
const panel = (levels: Record<string, number[]>, excluded: string[] = []): PanelParticipant[] =>
  Object.entries(levels).map(([name, row]) => ({
    id: `id-${name}`,
    name,
    excluded: excluded.includes(name),
    samples: row.map((level, i) => sample(String.fromCharCode(97 + i), level)),
  }));

describe("the matrix (buildPanelMatrix)", () => {
  const participants = panel({
    Ana: [5, 4],
    Beto: [5, 5],
    Caro: [5, 5],
    Dani: [5, 5],
    Eva: [5, 6],
    Fede: [8, 5],
  });
  const matrix = buildPanelMatrix({
    participants,
    format: "affective",
    cupsPerSample: 2,
    groupScores: { a: 81.5, b: 79 },
  });

  it("holds every cupper's total for every coffee, as the matrix always computed it", () => {
    expect(matrix.scored).toBe(true);
    expect(matrix.cuppers.map((c) => c.name)).toEqual(["Ana", "Beto", "Caro", "Dani", "Eva", "Fede"]);
    expect(matrix.coffees.map((c) => c.id)).toEqual(["a", "b"]);
    expect(matrix.cells[0].map((c) => c.value)).toEqual([79, 79, 79, 79, 79, total(8)]);
    expect(matrix.cells[1].map((c) => c.value)).toEqual([total(4), 79, 79, 79, total(6), 79]);
    expect(panelCellValue(participants[5].samples[0], "affective", 2)).toBe(94.75);
    expect(panelCellValue(participants[0].samples[1], "affective", 2)).toBe(73.75);
  });

  it("the group's score is the one it is given (the card's), never a number of its own", () => {
    expect(matrix.coffees.map((c) => c.group)).toEqual([81.5, 79]);
    const without = buildPanelMatrix({ participants, format: "affective", cupsPerSample: 2 });
    expect(without.coffees.map((c) => c.group)).toEqual([null, null]);
  });

  it("the spread and the distance of a cell are rowStats and bandFor, unchanged", () => {
    for (const [si, coffee] of matrix.coffees.entries()) {
      const values = matrix.cells[si].map((c) => c.value);
      const stats = rowStats(values, values.map(() => true));
      expect(coffee.sd).toBeCloseTo(stats.sd, 10);
      expect(coffee.count).toBe(6);
      const expected = { neutral: "none", green: "within", amber: "over1", red: "over2" } as const;
      expect(matrix.cells[si].map((c) => c.distance)).toEqual(values.map((v) => expected[bandFor(v, stats)]));
    }
    // one cupper far from the others: 2 SD or more; the rest within 1 SD
    expect(matrix.cells[0].map((c) => c.distance)).toEqual(["within", "within", "within", "within", "within", "over2"]);
    // two cuppers a step away on each side: 1 SD or more, under 2
    expect(matrix.cells[1].map((c) => c.distance)).toEqual(["over1", "within", "within", "within", "over1", "within"]);
    expect(panelMarks(matrix)).toEqual({ over1: 2, over2: 1 });
  });

  it("an excluded cupper keeps their totals, has no distance and is outside the mean", () => {
    const stored = buildPanelMatrix({ participants: panel({ Ana: [5], Beto: [5], Caro: [5], Fede: [8] }, ["Fede"]), format: "affective", cupsPerSample: 2 });
    expect(stored.cuppers[3].excluded).toBe(true);
    expect(stored.cells[0][3]).toEqual({ value: total(8), partial: false, distance: "none" });
    expect(stored.coffees[0].count).toBe(3);
    expect(stored.coffees[0].sd).toBe(0);
    // no spread among the included: no distance for anyone
    expect(stored.cells[0].map((c) => c.distance)).toEqual(["none", "none", "none", "none"]);
    // the organizer's switch, before the server confirms it
    const optimistic = buildPanelMatrix({
      participants: panel({ Ana: [5], Beto: [5], Caro: [5], Fede: [8] }),
      isExcluded: (p) => p.name === "Fede",
      format: "affective",
      cupsPerSample: 2,
    });
    expect(optimistic.cells).toEqual(stored.cells);
    expect(optimistic.cuppers.map((c) => c.excluded)).toEqual([false, false, false, true]);
  });

  it("under three included totals nobody is near or far: with two, each sits exactly one SD from their mean", () => {
    expect(PANEL_DISTANCE_MIN_N).toBe(3);
    const two = buildPanelMatrix({ participants: panel({ Ana: [5, 7], Beto: [8, 7] }), format: "affective", cupsPerSample: 2 });
    // the band the old matrix drew: both cuppers "over 1 SD", whatever they scored
    const values = two.cells[0].map((c) => c.value);
    const stats = rowStats(values, [true, true]);
    expect(values.map((v) => bandFor(v, stats))).toEqual(["amber", "amber"]);
    // the Panel says nothing about distance there; the spread is still printed
    expect(two.cells.flat().map((c) => c.distance)).toEqual(["none", "none", "none", "none"]);
    expect(two.coffees[0].sd).toBeCloseTo(stats.sd, 10);
    expect(panelMarks(two)).toEqual({ over1: 0, over2: 0 });
    // three is enough
    const three = buildPanelMatrix({ participants: panel({ Ana: [5], Beto: [5], Caro: [8] }), format: "affective", cupsPerSample: 2 });
    expect(three.cells[0].map((c) => c.distance)).toEqual(["within", "within", "over1"]);
  });

  it("a declared partial evaluation has no total and says so; an empty one is just empty", () => {
    const partial = { ...rated(6), [`${AFFECTIVE_ATTRIBUTES[0].id}_ne`]: true };
    delete (partial as Record<string, unknown>)[`${AFFECTIVE_ATTRIBUTES[0].id}_final`];
    const people: PanelParticipant[] = [
      { id: "1", name: "Ana", excluded: false, samples: [sample("a", 0, { affective: partial })] },
      { id: "2", name: "Beto", excluded: false, samples: [sample("a", 0)] },
      { id: "3", name: "Caro", excluded: false, samples: [sample("a", 6)] },
    ];
    const m = buildPanelMatrix({ participants: people, format: "affective", cupsPerSample: 2 });
    expect(m.cells[0]).toEqual([
      { value: null, partial: true, distance: "none" },
      { value: null, partial: false, distance: "none" },
      { value: total(6), partial: false, distance: "none" },
    ]);
    expect(m.coffees[0].sd).toBeNull();
  });

  it("a descriptive session has no totals: the cells only open an evaluation", () => {
    const people = panel({ Ana: [6], Beto: [7] }).map((p) => ({
      ...p,
      samples: p.samples.map((s) => ({ ...s, descriptive: { fragancia_intensidad: 8 } })),
    }));
    const m = buildPanelMatrix({ participants: people, format: "descriptive", cupsPerSample: 2, groupScores: { a: 80 } });
    expect(m.scored).toBe(false);
    expect(m.cells[0].every((c) => c.value === null && c.distance === "none" && !c.partial)).toBe(true);
  });

  it("names a coffee only once it is revealed, and counts the references", () => {
    const people: PanelParticipant[] = [
      {
        id: "1",
        name: "Ana",
        excluded: false,
        samples: [
          sample("a", 5, { revealed: true, coffee: { name: "Ámbar" }, isReference: true, referenceRank: 1 }),
          sample("b", 6, { revealed: false, coffee: { name: "Granate" } }),
        ],
      },
    ];
    const m = buildPanelMatrix({ participants: people, format: "affective", cupsPerSample: 2 });
    expect(m.coffees.map((c) => c.name)).toEqual(["Ámbar", null]);
    expect(m.coffees.map((c) => c.isReference)).toEqual([true, false]);
    expect(m.references).toBe(1);
  });

  it("nobody yet: an empty matrix, not an error", () => {
    const m = buildPanelMatrix({ participants: [], format: "combined", cupsPerSample: 2 });
    expect(m).toEqual({ scored: true, cuppers: [], coffees: [], cells: [], references: 0 });
  });
});

describe("what waits for the organizer (panelPending)", () => {
  it("counts the late evaluations and the notes of other cuppers", () => {
    expect(panelPending({ lateRows: [{}, {}], notesByCupper: { u1: { a: {}, b: {} }, u2: { a: {} } } })).toEqual({ late: 2, notes: 3 });
    expect(panelPending({ lateRows: [{}], notesByCupper: null })).toEqual({ late: 1, notes: 0 });
    expect(panelPending({ lateRows: [], notesByCupper: { u1: { a: {} } } })).toEqual({ late: 0, notes: 1 });
  });

  it("is nothing when nothing waits, and nothing for a page that holds neither list", () => {
    expect(panelPending({ lateRows: [], notesByCupper: {} })).toBeNull();
    expect(panelPending({ lateRows: null, notesByCupper: null })).toBeNull();
    expect(panelPending({ lateRows: undefined, notesByCupper: undefined })).toBeNull();
  });

  it("is said in one sentence, in both languages", () => {
    const t = (locale: "es" | "en") => buildPanelStrings({ raw: (key: string) => block(locale)[key.split(".")[1]] });
    expect(pendingSentence({ late: 1, notes: 1 }, t("es"))).toBe("1 evaluación tardía por decidir y 1 nota después del cierre");
    expect(pendingSentence({ late: 3, notes: 0 }, t("es"))).toBe("3 evaluaciones tardías por decidir");
    expect(pendingSentence({ late: 0, notes: 2 }, t("es"))).toBe("2 notas después del cierre");
    expect(pendingSentence({ late: 2, notes: 5 }, t("en"))).toBe("2 late evaluations to decide and 5 notes after the close");
    expect(pendingSentence({ late: 1, notes: 0 }, t("en"))).toBe("1 late evaluation to decide");
  });
});

describe("alignment: one neutral bar per cupper (alignmentBars)", () => {
  const rows: AlignmentInput[] = [
    { id: "1", name: "Ana", excluded: false, matches: 10, opportunities: 20, bySample: { a: { matches: 1, opportunities: 10 }, b: { matches: 9, opportunities: 10 } } },
    { id: "2", name: "Beto", excluded: false, matches: 15, opportunities: 20, bySample: { a: { matches: 8, opportunities: 10 }, b: { matches: 7, opportunities: 10 } } },
    { id: "3", name: "Caro", excluded: true, matches: 19, opportunities: 20, bySample: { a: { matches: 10, opportunities: 10 }, b: { matches: 9, opportunities: 10 } } },
    { id: "4", name: "Dani", excluded: false, matches: 0, opportunities: 0, bySample: {} },
  ];

  it("included cuppers first, by share; excluded ones last; no share without descriptors to share", () => {
    const bars = alignmentBars(rows, null);
    expect(bars.map((b) => b.name)).toEqual(["Beto", "Ana", "Dani", "Caro"]);
    expect(bars.map((b) => b.percent)).toEqual([75, 50, null, 95]);
    expect(bars[0]).toEqual({ id: "2", name: "Beto", excluded: false, matches: 15, opportunities: 20, percent: 75 });
  });

  it("one coffee: that coffee's split, and its own order", () => {
    const bars = alignmentBars(rows, "b");
    expect(bars.map((b) => [b.name, b.matches, b.opportunities, b.percent])).toEqual([
      ["Ana", 9, 10, 90],
      ["Beto", 7, 10, 70],
      ["Dani", 0, 0, null],
      ["Caro", 9, 10, 90],
    ]);
  });
});

describe("the drawing of the matrix", () => {
  const strings: PanelMatrixStrings = {
    caption: "CAPTION",
    region: "REGION",
    group: "Grupo",
    spread: "Dispersión (DE)",
    spreadShort: "DE",
    noScore: "—",
    partial: "Parcial",
    excludedTag: "(excluido)",
    markWithin: "LEGEND-0",
    markOver1: "LEGEND-1",
    markOver2: "LEGEND-2",
    cell: "{cupper}, {coffee}: {value}",
    distOver1: "a 1 DE o más de la media",
    distOver2: "lejos del grupo, 2 DE o más",
    noTotal: "sin puntaje",
    scrollHint: "HINT",
    pickCoffee: "PICK",
    phoneGroup: "Grupo {score}",
    phoneSpread: "DE {sd}",
  };
  const matrix = buildPanelMatrix({
    participants: panel({ Ana: [5, 4], Beto: [5, 5], Caro: [5, 5], Dani: [5, 5], Eva: [5, 6], Fede: [8, 5], Gil: [9, 9] }, ["Gil"]),
    format: "affective",
    cupsPerSample: 2,
    groupScores: { a: 81.5, b: 79 },
  });
  const draw = (rows: "cuppers" | "coffees", m = matrix) =>
    renderToStaticMarkup(createElement(PanelMatrix, { matrix: m, rows, onOpen: () => {}, referenceBadge: "Referencia", t: strings }));

  for (const rows of ["cuppers", "coffees"] as const) {
    describe(`a row per ${rows === "cuppers" ? "cupper" : "coffee"}`, () => {
      const markup = draw(rows);
      const table = markup.slice(markup.indexOf("<table"), markup.indexOf("</table>"));

      it("is a table with a caption, column headers and row headers (H-10)", () => {
        expect(table).toContain(`data-matrix-rows="${rows}"`);
        expect(table).toContain('<caption class="sr-only">CAPTION</caption>');
        const rowHeaders = (table.match(/<th scope="row"/g) ?? []).length;
        const colHeaders = (table.match(/<th scope="col"/g) ?? []).length;
        // the group's score and the spread are two lines of their own
        expect(rowHeaders).toBe(rows === "cuppers" ? 7 + 2 : 2);
        expect(colHeaders).toBe(rows === "cuppers" ? 2 : 7 + 2);
        expect(markup).toContain('role="region" aria-label="REGION" tabindex="0"');
      });

      it("prints the group's score and the spread beside the cuppers' totals", () => {
        expect(table).toContain(">81.50<");
        expect(table).toContain(">79.00<");
        expect((table.match(/data-line="group"/g) ?? []).length).toBe(rows === "cuppers" ? 1 : 2);
        expect((table.match(/data-line="spread"/g) ?? []).length).toBe(rows === "cuppers" ? 1 : 2);
      });

      it("a far cell carries a mark and says so in its name: colour is never alone (H-09)", () => {
        expect((table.match(/data-mark="over2"/g) ?? []).length).toBe(1);
        expect((table.match(/data-mark="over1"/g) ?? []).length).toBe(2);
        expect(table).toContain('aria-label="Fede, Muestra A: 94.75, lejos del grupo, 2 DE o más"');
        expect(table).toContain('aria-label="Ana, Muestra B: 73.75, a 1 DE o más de la media"');
        expect(table).toContain('aria-label="Beto, Muestra A: 79.00"');
        // an excluded cupper: greyed, named as excluded, no mark
        expect(table).toContain('aria-label="Gil, Muestra A: 100.00, (excluido)"');
        // every cell is a button of 44 px or more
        expect((table.match(/<button/g) ?? []).length).toBe(7 * 2 + 7);
        expect((table.match(/min-h-\[44px\]/g) ?? []).length).toBe(7 * 2 + 7);
      });
    });
  }

  it("both layouts hold the same cells", () => {
    const names = (markup: string) => [...markup.slice(markup.indexOf("<table")).matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names(draw("cuppers"))).toEqual(names(draw("coffees")));
  });

  it("on a phone it is one coffee at a time, a list of cuppers, with the same names and marks", () => {
    const markup = draw(PANEL_MATRIX_ROWS);
    const phone = markup.slice(markup.indexOf("data-matrix-phone"), markup.indexOf("data-matrix-box"));
    expect(markup).toMatch(/class="[^"]*md:hidden[^"]*" data-matrix-phone=""/);
    expect(markup).toMatch(/class="hidden [^"]*md:flex[^"]*"><div role="region"/);
    expect(phone).toContain('aria-label="PICK"');
    expect(phone).toContain("Grupo 81.50");
    expect((phone.match(/<li/g) ?? []).length).toBe(7);
    expect(phone).toContain('aria-label="Fede, Muestra A: 94.75, lejos del grupo, 2 DE o más"');
    expect((phone.match(/data-mark="over2"/g) ?? []).length).toBe(1);
    expect(phone).not.toContain("<table");
  });

  it("the legend explains the three tones and both marks; a descriptive session has neither totals nor a legend", () => {
    const markup = draw("cuppers");
    const legend = markup.slice(markup.indexOf("data-matrix-legend"));
    expect(legend).toContain("LEGEND-0");
    expect((legend.match(/data-mark=/g) ?? []).length).toBe(2);
    expect(legend).toContain("LEGEND-1");
    expect(legend).toContain("LEGEND-2");
    const descriptive = draw(
      "cuppers",
      buildPanelMatrix({ participants: panel({ Ana: [5], Beto: [6] }), format: "descriptive", cupsPerSample: 2 }),
    );
    expect(descriptive).not.toContain("data-matrix-legend");
    expect(descriptive).not.toContain('data-line="group"');
    expect(descriptive).toContain('aria-label="Ana, Muestra A: sin puntaje"');
  });

  it("far is the warning token, never the error red; the alignment is one neutral bar", () => {
    for (const file of ["PanelMatrix.tsx", "CupperAlignment.tsx", "OwnerParticipantSection.tsx", "PanelView.tsx"]) {
      const source = read("components", "results", file);
      expect(source, file).not.toMatch(/(?:bg|text|border)-error|#[0-9a-fA-F]{6}\b/);
    }
    expect(read("components", "results", "PanelMatrix.tsx")).toMatch(/bg-warning /);
    // the alignment bar has one tone for everyone who is included
    const alignment = read("components", "results", "CupperAlignment.tsx");
    expect(alignment).not.toMatch(/pct >= |bg-secondary|bg-primary-container/);
  });
});

describe("the words (results.panel)", () => {
  it("hold exactly the keys the builder reads, in both languages, with the same placeholders", () => {
    const holes = (text: string) => [...new Set(text.match(/\{[a-zA-Z]+\}/g) ?? [])].sort().join(",");
    for (const locale of LOCALES) {
      expect(Object.keys(block(locale))).toEqual([...RESULTS_PANEL_KEYS]);
      for (const key of RESULTS_PANEL_KEYS) expect(holes(block(locale)[key]), `${locale}.${key}`).toBe(holes(block("es")[key]));
    }
  });

  it("far from the group is said as a fact, never as an error", () => {
    for (const locale of LOCALES) {
      const matrix = (MESSAGES[locale].results as unknown as Record<string, Record<string, string>>).matrix;
      expect(matrix.legendRed).toMatch(/No es un error|not an error/i);
      for (const key of RESULTS_PANEL_KEYS) expect(block(locale)[key], `${locale}.${key}`).not.toMatch(/error|mal[oa]\b|wrong|bad\b/i);
    }
  });
});

describe("what reaches a participant", () => {
  const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
  const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");

  it("the page builds the Panel's rows only in the organizer's lens", () => {
    // every cupper's evaluations and the alignment rows: inside `if (ownerRead)`
    expect(page).toMatch(/let participantResults: ParticipantResult\[\] \| null = null;/);
    expect(page).toMatch(/let cupperAlignment: CupperAlignmentRow\[\] \| null = null;/);
    expect(page.match(/participantResults = /g)).toHaveLength(1);
    expect(page.match(/cupperAlignment = /g)).toHaveLength(1);
    const assigned = (name: string) => page.lastIndexOf("if (ownerRead) {", page.indexOf(`${name} = `));
    expect(assigned("participantResults")).toBeGreaterThan(0);
    expect(assigned("cupperAlignment")).toBeGreaterThan(0);
    // the late rows: the owner only (not even the admin's lens)
    expect(page).toMatch(/const lateRows = buildOwnerLateRows\(\{\s*ownerLens: isOwner && !isAdminViewer,/);
    // other cuppers' notes after the close: the owner of a closed session only
    expect(page).toMatch(/const otherNotes: PostCloseNoteEval\[\] =\s*isOwner && !isAdminViewer && session\.status === "closed"/);
  });

  it("with none of those rows there is nothing pending, no Panel tab and no Panel", () => {
    expect(panelPending({ lateRows: null, notesByCupper: null })).toBeNull();
    expect(buildPanelMatrix({ participants: [], format: "combined", cupsPerSample: 2 }).cuppers).toEqual([]);
    expect(client).toMatch(/const effectiveTab: Tab = tab === "panel" && !canViewIndividual \? "resumen" : tab;/);
    expect(client).toMatch(/\.\.\.\(canViewIndividual \? \[\{ id: "panel", label: overview\.cards\.tabPanel \}\] : \[\]\),/);
    // the Panel is drawn in one place, under that same condition
    expect(client.match(/<PanelView/g)).toHaveLength(1);
    expect(client).toMatch(/canViewIndividual && participants \? \(\s*<PanelView/);
    // the tile that announces what waits is built from the same condition
    expect(client).toMatch(/const panelWaiting = canViewIndividual\s*\? panelPending\(\{ lateRows: isAdminViewer \? null : lateRows,/);
    // a late evaluation can never become unreachable: without a Panel it stays on the page
    expect(client).toMatch(/lateRows && lateRows\.length > 0 && lateTranslations && !isAdminViewer && !canViewIndividual && \(\s*<LateEvaluationsPanel/);
  });
});

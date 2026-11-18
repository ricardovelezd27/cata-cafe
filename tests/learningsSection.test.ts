import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";

// The reflection hosts the existing note editor, which needs the app router and
// the toast provider: here it is replaced by a mark, so the section's own
// markup can be read. What the editor does is not this package's.
vi.mock("@/components/results/PostCloseNote", () => ({
  PostCloseNoteEditor: ({ note }: { note: { evaluationId: string } }) =>
    createElement("div", { "data-note-editor": note.evaluationId }),
}));

import { Learnings, Reflection } from "@/components/results/Learnings";
import { RESULTS_LEARNINGS_KEYS, buildLearningsStrings } from "@/components/results/learningsStrings";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL, SENSORY_DEFECTS } from "@/lib/constants";
import {
  LEARNINGS_REPEAT_SCENARIO,
  OVERVIEW_SCENARIOS,
  overviewScenario,
  type OverviewScenario,
} from "@/lib/dev/overviewFixtures";
import { LEARNING_RULES, type Learning, type LearningRule } from "@/lib/reports/learnings";
import { learningsPayload, buildLearningsInput } from "@/lib/reports/learningsInput";
import { LEARNING_SENTENCE_KEYS, learningSentence, learningText, type LearningNames } from "@/lib/reports/learningSentences";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Package R4b: "Aprendizajes" and the reflection on the results page. The rules
// are tested in tests/learnings.test.ts (package R4a). Here: the words (every
// rule has a sentence in both languages, with its numbers and no person in it),
// what reaches each viewer, and the section itself.

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = { es, en } as const;
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const block = (locale: Locale) => (MESSAGES[locale].results as unknown as Record<string, Record<string, string>>).learnings;
const strings = (locale: Locale) => buildLearningsStrings({ raw: (key: string) => block(locale)[key.split(".")[1]] });

const NAMES: LearningNames = {
  sample: (id) => `Muestra ${id}`,
  descriptor: (id) => FLAVOR_WHEEL.find((n) => n.id === id)?.label_es ?? id,
  attribute: (id) => AFFECTIVE_ATTRIBUTES.find((a) => a.id === id)?.label ?? id,
  defectType: (type) => ({ moldy: "mohoso", phenolic: "fenólico", potato: "papa" })[type] ?? type,
};

/** One learning of every rule, and of every variant a rule has. */
const SPECIMENS: Learning[] = [
  { rule: "G0", about: ["G"], params: { descriptor: "fruity:berry", people: 6, of: 7 } },
  { rule: "G1", about: ["A"], params: { spread: 2.1, included: 7, submitted: 8 } },
  { rule: "G1", about: ["A"], params: { spread: 2.1, included: 7, submitted: null } },
  { rule: "G2", about: ["D"], params: { spread: 5.2, included: 7, submitted: 8 } },
  { rule: "G3", about: ["G", "C"], params: { gap: 0.75 } },
  { rule: "G4", about: ["E", "D"], params: { referenceScore: 79, above: 5, of: 7, delta: -8.5 } },
  { rule: "G4", about: ["E", "D"], params: { referenceScore: 79, above: 1, of: 1, delta: 3.25 } },
  { rule: "G4", about: ["E", "D"], params: { referenceScore: 79, above: 1, of: 3, delta: -2 } },
  { rule: "G5", about: ["D"], params: { people: 2, of: 7, cups: 3, types: [{ type: "phenolic", cups: 2 }, { type: null, cups: 1 }] } },
  { rule: "G5", about: ["D"], params: { people: 1, of: 6, cups: 1, types: [{ type: null, cups: 1 }] } },
  { rule: "P1", about: ["D"], params: { mine: 74.25, group: 78.25, difference: -4 } },
  { rule: "P2", about: ["F"], params: { mine: 83, group: 82.75, difference: 0.25 } },
  { rule: "P3", about: ["G", "C"], params: { above: 5, of: 7, meanDifference: -0.46 } },
  { rule: "P3", about: ["G"], params: { above: 1, of: 1, meanDifference: 1.5 } },
  { rule: "P4", about: [], params: { attribute: "acidez_af", meanDifference: 0.75, samples: 6 } },
  { rule: "P4", about: [], params: { attribute: "dulzor_af", meanDifference: -1, samples: 1 } },
  { rule: "P5", about: [], params: { matches: 21, opportunities: 34, percent: 62 } },
  { rule: "P6", about: ["B", "F"], params: { scoreA: 84, scoreB: 83, difference: 1, within: true, tolerance: 2 } },
  { rule: "P6", about: ["B", "F"], params: { scoreA: 88, scoreB: 83.5, difference: 4.5, within: false, tolerance: 2 } },
  { rule: "S1", about: ["A", "C"], params: { highest: 88.5, lowest: 80, range: 8.5 } },
  { rule: "S2", about: ["R"], params: { referenceScore: 82, above: 2, of: 3 } },
  { rule: "S2", about: ["R"], params: { referenceScore: 82, above: 1, of: 3 } },
  { rule: "S2", about: ["R"], params: { referenceScore: 82, above: 1, of: 1 } },
  { rule: "S2", about: ["R"], params: { referenceScore: 82, above: 0, of: 1 } },
];

describe("the words of the learnings (results.learnings)", () => {
  it("hold exactly the keys the builder reads, in both languages, with the same placeholders", () => {
    const holes = (text: string) => [...new Set(text.match(/\{[a-zA-Z]+\}/g) ?? [])].sort().join(",");
    for (const locale of LOCALES) {
      expect(Object.keys(block(locale))).toEqual([...RESULTS_LEARNINGS_KEYS]);
      for (const key of RESULTS_LEARNINGS_KEYS) expect(holes(block(locale)[key]), `${locale}.${key}`).toBe(holes(block("es")[key]));
    }
  });

  it("every rule, and every variant of it, has a sentence that fills all its blanks", () => {
    expect(new Set(SPECIMENS.map((l) => l.rule))).toEqual(new Set<LearningRule>(LEARNING_RULES));
    // a pattern as a shape: its fixed words in place, anything where a blank is
    const shape = (pattern: string) =>
      new RegExp(
        "^" +
          pattern
            .split(/\{[a-zA-Z]+\}/)
            .map((fixed) => fixed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".+") +
          "$",
      );
    const sentenceKeys = LEARNING_SENTENCE_KEYS.slice(0, LEARNING_SENTENCE_KEYS.indexOf("included"));
    for (const locale of LOCALES) {
      const t = strings(locale).sentences;
      const used = new Set<string>();
      for (const l of SPECIMENS) {
        const text = learningText(l, NAMES, t);
        expect(text, `${locale} ${l.rule}`).not.toMatch(/[{}]|undefined|NaN|null/);
        expect(text.endsWith("."), `${locale} ${l.rule}: ${text}`).toBe(true);
        for (const key of sentenceKeys) if (shape(t[key]).test(text)) used.add(key);
      }
      // every sentence pattern was reached by a specimen
      expect(sentenceKeys.filter((key) => !used.has(key)), locale).toEqual([]);
    }
  });

  it("prints the numbers of the learning: scores with two decimals, a spread with one, a difference with its sign", () => {
    const t = strings("es").sentences;
    const text = (rule: LearningRule, n = 0) => learningText(SPECIMENS.filter((l) => l.rule === rule)[n], NAMES, t);
    expect(text("G0")).toBe("Lo más compartido de la cata: Bayas en Muestra G, 6 de 7 catadores.");
    expect(text("G1")).toBe("El panel coincidió más en Muestra A: dispersión ± 2.1 (7 de 8 incluidos).");
    expect(text("G1", 1)).toContain("(7 incluidos)");
    expect(text("G3")).toContain("quedaron a 0.75 puntos");
    expect(text("G4")).toBe(
      "Frente a la referencia (Muestra E, 79.00), 5 de 7 muestras quedaron por encima. La más lejana: Muestra D, Δ −8.50.",
    );
    expect(text("G5")).toBe("En Muestra D, 2 de 7 catadores marcaron una taza con defecto (fenólico: 2 tazas; sin especificar: 1 taza).");
    expect(text("P1")).toBe("Tu puntaje más lejano del grupo fue en Muestra D: tú 74.25, grupo 78.25 (diferencia −4.00).");
    expect(text("P2")).toContain("(diferencia +0.25)");
    expect(text("P3")).toContain("la diferencia media fue de −0.46 puntos");
    expect(text("P4")).toBe("En Acidez puntuaste en promedio 0.75 por encima del grupo (en 6 muestras, escala de 1 a 9).");
    expect(text("P4", 1)).toContain("1.00 por debajo del grupo (en 1 muestra,");
    expect(text("P5")).toBe("Elegiste 21 de los 34 descriptores que eligió la mayoría del panel (62 %).");
    expect(text("P6")).toContain("(diferencia 1.00, dentro de la tolerancia de 2 puntos)");
    expect(text("P6", 1)).toContain("fuera de la tolerancia de 2 puntos");
    expect(text("S1")).toBe("Tu puntaje más alto fue Muestra A (88.50) y el más bajo Muestra C (80.00): 8.50 puntos entre ambos.");
  });

  it("a count of one takes a singular verb, in the sentences where the verb follows the count", () => {
    const t = strings("es").sentences;
    const text = (rule: LearningRule, n: number) => learningText(SPECIMENS.filter((l) => l.rule === rule)[n], NAMES, t);
    expect(text("G4", 2)).toBe(
      "Frente a la referencia (Muestra E, 79.00), 1 de 3 muestras quedó por encima. La más lejana: Muestra D, Δ −2.00.",
    );
    expect(text("G4", 1)).toBe("Frente a la referencia (Muestra E, 79.00), Muestra D quedó a Δ +3.25.");
    expect(text("G5", 1)).toBe("En Muestra D, 1 de 6 catadores marcó una taza con defecto (sin especificar: 1 taza).");
    expect(text("S2", 0)).toBe("Frente a tu referencia (Muestra R, 82.00), 2 de 3 muestras quedaron por encima.");
    expect(text("S2", 1)).toBe("Frente a tu referencia (Muestra R, 82.00), 1 de 3 muestras quedó por encima.");
    expect(text("S2", 2)).toBe("Frente a tu referencia (Muestra R, 82.00), la otra muestra quedó por encima.");
    expect(text("S2", 3)).toBe("Frente a tu referencia (Muestra R, 82.00), la otra muestra no quedó por encima.");
  });

  it("a coffee's name is trimmed: no space before the comma that follows it", () => {
    const t = strings("es");
    const markup = html(
      createElement(Learnings, {
        learnings: { panel: [SPECIMENS[0]], mine: [], panelStatus: "ok" },
        samples: [{ id: "G", label: "Muestra G", revealed: true, coffee: { name: "Ámbar  " } }],
        isGroup: true,
        showMine: false,
        viewerSent: false,
        locale: "es",
        attributes: {},
        defectTypes: {},
        t,
      }),
    );
    expect(markup.replace(/<[^>]+>/g, "")).toContain("Bayas en Muestra G Ámbar, 6 de 7 catadores.");
  });

  it("the subject of a sentence is marked, and only names are: a coffee, a descriptor, an attribute", () => {
    const t = strings("es").sentences;
    for (const l of SPECIMENS) {
      const strong = learningSentence(l, NAMES, t).filter((s) => s.strong).map((s) => s.text);
      for (const text of strong) expect(text, l.rule).toMatch(/^(Muestra [A-Z]|Bayas|Acidez|Dulzor)$/);
    }
  });

  it("nothing is graded: no word of quality for a coffee, and \"error\" only to say that distance is not one", () => {
    for (const locale of LOCALES) {
      const words = block(locale);
      for (const key of RESULTS_LEARNINGS_KEYS) {
        expect(words[key], `${locale}.${key}`).not.toMatch(/mejor|peor|excelente|buen[oa]|mal[oa]|best|worst|excellent|good|bad|fault|falla|equivoc/i);
        if (key !== "closing") expect(words[key], `${locale}.${key}`).not.toMatch(/error/i);
      }
      expect(words.closing).toMatch(/no es un error|is not an error/);
    }
  });
});

describe("no sentence carries a person", () => {
  const payloadOf = (s: OverviewScenario) => s.learnings;

  it("the payload of every scenario holds sample ids, numbers and reference-data ids only", () => {
    const refs = new Set<string>([...FLAVOR_WHEEL.map((n) => n.id), ...AFFECTIVE_ATTRIBUTES.map((a) => a.id), ...SENSORY_DEFECTS, ...LEARNING_RULES]);
    let seen = 0;
    for (const s of OVERVIEW_SCENARIOS) {
      const payload = payloadOf(s);
      if (!payload) continue;
      const json = JSON.stringify(payload);
      expect(s.secrets.filter((secret) => json.includes(secret)), s.id).toEqual([]);
      const sampleIds = new Set(s.samples.map((x) => x.id));
      const walk = (value: unknown): void => {
        if (typeof value === "string") {
          seen += 1;
          expect(sampleIds.has(value) || refs.has(value) || ["not_applicable", "too_few", "ok"].includes(value), `${s.id}: ${value}`).toBe(true);
        } else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") Object.values(value).forEach(walk);
      };
      walk(payload);
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("in Spanish and in English, the sentences of every scenario name coffees and descriptors, never a cupper", () => {
    let sentences = 0;
    for (const locale of LOCALES) {
      const t = strings(locale);
      for (const s of OVERVIEW_SCENARIOS) {
        const payload = payloadOf(s);
        if (!payload) continue;
        const markup = html(
          createElement(Learnings, {
            learnings: payload,
            samples: s.samples,
            isGroup: s.ctx.isGroup,
            showMine: true,
            viewerSent: true,
            locale,
            attributes: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.id, a.label])),
            defectTypes: { moldy: "mohoso", phenolic: "fenólico", potato: "papa" },
            t,
          }),
        );
        sentences += (markup.match(/data-learning="/g) ?? []).length;
        expect(s.secrets.filter((secret) => markup.includes(secret)), `${locale} ${s.id}`).toEqual([]);
        expect(markup, `${locale} ${s.id}`).not.toMatch(/cupper-|Nombre |nota privada|fragmento|Catador \d|Cupper \d/);
        expect(markup, `${locale} ${s.id}`).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
    expect(sentences).toBeGreaterThan(20);
  });
});

describe("what reaches each viewer", () => {
  it("nothing before the close", () => {
    expect(overviewScenario("open").learnings).toBeNull();
  });

  it("closed group, participant: sentences about the panel and of their own", () => {
    const p = overviewScenario("closed").learnings!;
    expect(p.panelStatus).toBe("ok");
    expect(p.panel.length).toBeGreaterThan(0);
    expect(p.panel.every((l) => l.rule.startsWith("G"))).toBe(true);
    expect(p.mine.length).toBeGreaterThan(0);
    expect(p.mine.every((l) => !l.rule.startsWith("G"))).toBe(true);
    // the reference is never the subject of a panel sentence (it may be what G4 compares against)
    const reference = overviewScenario("closed").referenceId;
    for (const l of p.panel) if (l.rule !== "G4") expect(l.about).not.toContain(reference);
  });

  it("two cuppers: no sentence about the panel, and the page says why; none of the viewer's own beside the group", () => {
    const p = overviewScenario("two").learnings!;
    expect(p.panelStatus).toBe("too_few");
    expect(p.panel).toEqual([]);
    expect(p.mine).toEqual([]);
  });

  it("solo: only the cupper's own, from their own scores", () => {
    const p = overviewScenario("solo").learnings!;
    expect(p.panelStatus).toBe("not_applicable");
    expect(p.panel).toEqual([]);
    expect(p.mine.map((l) => l.rule)).toEqual(["S1"]);
  });

  it("the admin's lens gets the panel's sentences and none that says \"tú\"", () => {
    const s = overviewScenario("closed-owner");
    const input = buildLearningsInput({
      closed: true,
      ownerLens: true,
      referencePinned: s.referencePinned,
      samples: s.samples,
      referenceId: s.referenceId,
      ctx: s.ctx,
      data: s.data,
      alignment: s.myAlignment,
      repeats: [{ a: s.samples[1].id, b: s.samples[2].id, scoreA: 90, scoreB: 88 }],
    });
    const organizer = learningsPayload(input, { ownOnes: true })!;
    const admin = learningsPayload(input, { ownOnes: false })!;
    expect(organizer.mine.length).toBeGreaterThan(0);
    expect(admin.mine).toEqual([]);
    expect(admin.panel).toEqual(organizer.panel);
    // the organizer's own never include the attribute sentence: "tú vs. grupo" is not built in their lens
    expect(organizer.mine.map((l) => l.rule)).not.toContain("P4");
  });

  it("a repeated coffee: six sentences of the reader's own, five shown; the switch decides which one is cut", () => {
    const s = LEARNINGS_REPEAT_SCENARIO;
    // built default: the repeated coffee first, the alignment sentence is the one cut
    expect(s.learnings!.mine.map((l) => l.rule)).toEqual(["P6", "P1", "P2", "P3", "P4"]);
    // the alternative: the approved table's order, the repeated coffee is the one cut
    expect(s.learningsApprovedOrder!.mine.map((l) => l.rule)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(s.learningsApprovedOrder!.panel).toEqual(s.learnings!.panel);
    // the same cupping without the repeated pair shows the same five either way
    const plain = overviewScenario("closed");
    expect(plain.learningsApprovedOrder).toEqual(plain.learnings);
  });

  it("the page builds them from what it already has, under its own gate and the session's status", () => {
    const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
    expect(page).toMatch(/closed: session\.status === "closed",/);
    expect(page).toMatch(/ctx: \{ format, isGroup: session\.isGroup, canViewGroup, cupsPerSample: session\.cupsPerSample \},/);
    expect(page).toMatch(/\{ ownOnes: !isAdminViewer \}/);
    expect(page.match(/viewerMayReadGroupResults\(/g)).toHaveLength(1);
    // nothing new is queried for them: the input file reads no database
    const input = read("lib", "reports", "learningsInput.ts");
    expect(input).not.toMatch(/prisma|server-only|from "@\/app\/actions/);
  });
});

describe("the section on the page", () => {
  const props = (s: OverviewScenario, locale: Locale = "es", showMine = true, viewerSent = true) => ({
    learnings: s.learnings!,
    samples: s.samples,
    isGroup: s.ctx.isGroup,
    showMine,
    viewerSent,
    locale,
    attributes: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.id, a.label])),
    defectTypes: { moldy: "mohoso", phenolic: "fenólico", potato: "papa" },
    t: strings(locale),
  });

  it("a closed group cupping: one h2, the panel's column and the reader's, the closing line once", () => {
    const t = strings("es");
    const markup = html(createElement(Learnings, props(overviewScenario("closed"))));
    expect((markup.match(/<h2/g) ?? []).length).toBe(1);
    expect(markup).toMatch(/<h2[^>]*class="section-title/);
    expect(markup).toContain('data-learnings-scope="panel"');
    expect(markup).toContain('data-learnings-scope="mine"');
    expect(markup.split(t.closing).length - 1).toBe(1);
    expect(markup).not.toMatch(/<h1|<h4/);
  });

  it("two cuppers: the panel's column says why it is empty, and no closing line hangs under it", () => {
    const t = strings("es");
    const markup = html(createElement(Learnings, props(overviewScenario("two"))));
    expect(markup).toContain(t.tooFew);
    expect(markup).toContain(t.mineNone);
    expect(markup).not.toContain(t.closing);
    expect(markup).not.toContain("data-learning=");
  });

  it("an empty column is shown only when it explains something; with nothing to say there is no section", () => {
    const t = strings("es");
    const closed = overviewScenario("closed");
    // an organizer who did not cup: the panel's sentences, no column of their own
    const noOwn = { ...props(closed, "es", true, false), learnings: { ...closed.learnings!, mine: [] } };
    const organizer = html(createElement(Learnings, noOwn));
    expect(organizer).toContain('data-learnings-scope="panel"');
    expect(organizer).not.toContain('data-learnings-scope="mine"');
    // a cupper who sent, beside a panel with sentences: their column says there is none
    const sent = html(createElement(Learnings, { ...noOwn, viewerSent: true }));
    expect(sent).toContain(t.mineNone);
    // sentences of their own beside a panel that gave none: the panel's column says so
    const onlyMine = html(createElement(Learnings, { ...props(closed), learnings: { ...closed.learnings!, panel: [] } }));
    expect(onlyMine).toContain(t.panelNone);
    // nothing at all: no section (a group or a solo cupping)
    const nothing = { panel: [], mine: [], panelStatus: "ok" as const };
    expect(html(createElement(Learnings, { ...props(closed), learnings: nothing }))).toBe("");
    expect(html(createElement(Learnings, { ...props(overviewScenario("solo")), learnings: { ...nothing, panelStatus: "not_applicable" as const } }))).toBe("");
    // too few cuppers in the admin's lens: the one line that says why, nothing else
    const lens = html(createElement(Learnings, { ...props(overviewScenario("two"), "es", false) }));
    expect(lens).toContain(t.tooFew);
    expect(lens).not.toContain('data-learnings-scope="mine"');
  });

  it("the admin's lens has no column of its own; a solo cupping has no panel column and no closing line", () => {
    const t = strings("es");
    const admin = html(createElement(Learnings, props(overviewScenario("closed-owner"), "es", false)));
    expect(admin).toContain('data-learnings-scope="panel"');
    expect(admin).not.toContain('data-learnings-scope="mine"');
    const solo = html(createElement(Learnings, props(overviewScenario("solo"))));
    expect(solo).not.toContain('data-learnings-scope="panel"');
    expect(solo).toContain('data-learnings-scope="mine"');
    expect(solo).not.toContain(t.closing);
  });

  it("a score is ink: the section holds no colour of its own", () => {
    const source = read("components", "results", "Learnings.tsx");
    expect(source).not.toMatch(/text-(error|secondary|primary\b)|bg-(error|secondary)|#[0-9a-fA-F]{3,8}\b|style=\{/);
  });

  it("the reflection lists the existing note editor once per coffee the reader may write on, and says who reads it", () => {
    const s = overviewScenario("closed");
    const t = strings("es");
    const notes = Object.fromEntries(
      s.samples.slice(0, 3).map((x) => [x.id, { evaluationId: `ev-${x.id}`, text: null, at: null }]),
    );
    const base = { notes, samples: s.samples, locale: "es", userId: "u", noteT: {} as never, t };
    const group = html(createElement(Reflection, { ...base, onlyReader: false }));
    expect((group.match(/data-note-editor="/g) ?? []).length).toBe(3);
    expect(group).toContain(t.reflectionWho);
    expect(group).toContain(t.reflectionLead);
    expect((group.match(/<h2/g) ?? []).length).toBe(1);
    // a solo cupping, or the organizer's own note: nobody else reads it
    const solo = html(createElement(Reflection, { ...base, onlyReader: true }));
    expect(solo).toContain(t.reflectionWhoSolo);
    expect(solo).not.toContain(t.reflectionWho);
    expect(html(createElement(Reflection, { ...base, notes: {}, onlyReader: false }))).toBe("");
  });

  it("the closing line is under sentences that set something beside the group, not under the repeated coffee alone", () => {
    const t = strings("es");
    const p6 = SPECIMENS.find((l) => l.rule === "P6")!;
    const alone = { panel: [], mine: [p6], panelStatus: "too_few" as const };
    const markup = html(createElement(Learnings, { ...props(overviewScenario("two")), learnings: alone }));
    expect(markup).toContain('data-learning="P6"');
    expect(markup).toContain(t.tooFew);
    expect(markup).not.toContain(t.closing);
  });

  it("one column alone runs its sentences in two text columns from 768 px; two columns do not", () => {
    const lens = html(createElement(Learnings, props(overviewScenario("closed-owner"), "es", false)));
    expect(lens).toContain("md:columns-2");
    expect(html(createElement(Learnings, props(overviewScenario("closed"))))).not.toContain("md:columns-2");
  });

  it("the page shows both only on a closed session, and never the reflection in the admin's lens", () => {
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).toMatch(/\{overview\.learnings \? \(/);
    expect(client).toMatch(/\{sessionClosed && !isAdminViewer && postCloseNotes && noteTranslations \? \(/);
    expect(client).toMatch(/showMine=\{!isAdminViewer\}/);
    expect(client).toMatch(/onlyReader=\{!isGroup \|\| isOwner\}/);
    expect(client).toMatch(/viewerSent=\{cards\.some\(\(c\) => c\.state === "submitted"\)\}/);
  });
});

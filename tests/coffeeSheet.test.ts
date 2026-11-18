import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildCardsStrings } from "@/components/results/cardsStrings";
import { buildOverviewStrings } from "@/components/results/overviewStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { SampleDetail, type SampleDetailTranslations, type SheetCompareTranslations } from "@/components/results/SampleDetail";
import { RESULTS_SHEET_KEYS, buildSheetStrings } from "@/components/results/sheetStrings";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { OVERVIEW_SCENARIOS, overviewScenario, type OverviewScenario } from "@/lib/dev/overviewFixtures";
import { wheelFamilyLabels } from "@/lib/flavorWheelLabels";
import { coffeeCards, compareOptions } from "@/lib/reports/coffeeCards";
import { SHEET_BLOCK_IDS, SHEET_GENERAL, buildSheetData } from "@/lib/reports/coffeeSheet";
import { buildOverviewData } from "@/lib/reports/overview";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { SHEET_PARAM, closeMove, sheetSampleId, withSheet } from "@/lib/sheetAddress";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

// Package R3: a coffee's sheet. What it LOOKS like is checked by a person (the
// real page through the capture tool, the dev board for the states no test
// account can show); here: what the sheet's data may hold for each viewer,
// what the sheet shows state by state, the rules of its address, and that what
// it replaces (the Descriptores tab, the cloud, the roll-up) is gone.

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = { es, en } as const;
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const results = (locale: Locale) => MESSAGES[locale].results as unknown as Record<string, Record<string, string>>;

function words(locale: Locale) {
  const r = results(locale);
  const raw = (key: string) => {
    const [block, name] = key.split(".");
    return r[block][name];
  };
  const attributes = MESSAGES[locale].attributes as unknown as Record<string, string>;
  const flat = MESSAGES[locale].results as unknown as Record<string, string>;
  return {
    parts: buildResultsPartsStrings({ raw }),
    s: buildSheetStrings({ raw }),
    cards: buildCardsStrings(
      { raw },
      {
        inProgress: r.table.inProgress,
        notEvaluated: r.table.notEvaluated,
        inProgressLegend: r.table.inProgressLegend,
        partialLabel: r.partial.label,
        reveal: "Revelar",
        revealed: "Revelada",
        referenceBadge: flat.referenceBadge,
        attributes: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.id, attributes[a.id]])),
      },
    ),
    overview: buildOverviewStrings(
      { raw },
      {
        referenceTitle: r.dashboard.anchorTitle,
        referenceHint: r.dashboard.anchorHint,
        notScored: r.dashboard.notScored,
        rankHelp: r.dashboard.rankHelp,
        communityPending: flat.communityPending,
        defectTypes: { moldy: "mohoso", phenolic: "fenólico", potato: "papa" },
      },
    ),
    detail: {
      ...(r.detail as unknown as SampleDetailTranslations),
      breakdown: r.breakdown as unknown as SampleDetailTranslations["breakdown"],
      inProgress: r.table.inProgress,
      notEvaluated: r.table.notEvaluated,
      partial: r.partial as unknown as SampleDetailTranslations["partial"],
    } as SampleDetailTranslations,
    compare: r.compare as unknown as SheetCompareTranslations,
    blockLabels: MESSAGES[locale].blocks as unknown as Record<string, string>,
  };
}

/** The sheet of one coffee of a scenario, wired as the results page wires it. */
function sheet(s: OverviewScenario, index: number, locale: Locale = "es", cupperName: string | null = null): string {
  const w = words(locale);
  const sample = s.samples[index];
  const { format, isGroup, canViewGroup, cupsPerSample } = s.ctx;
  const cards = coffeeCards({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data: s.data });
  const card = cards.find((c) => c.sample.id === sample.id) ?? null;
  const agg = sample.aggregateScore;
  const options = compareOptions({ closed: s.closed, samples: s.samples, data: s.data });
  const self = options?.find((o) => o.id === sample.id) ?? null;
  const names = Object.fromEntries(s.samples.map((x) => [x.id, x.label]));
  const data = format === "affective" ? sample.affective : format === "descriptive" ? sample.descriptive : sample.combined;
  const own = cupperName === null;
  return html(
    createElement(SampleDetail, {
      data,
      format,
      cupsPerSample,
      locale,
      myEvaluation: own ? sample.myEvaluation : undefined,
      cupperName,
      referenceBadge: sample.referenceRank !== null ? w.cards.referenceBadge : null,
      referencePinned: sample.referenceRank !== null && s.referencePinned,
      card: own ? card : null,
      aggregate:
        own && isGroup && canViewGroup && agg && agg.communityScore != null
          ? { ...agg, avgRawScore: agg.communityScore, totalNonUniform: 0, totalDefective: 0, uniformityPenalty: 0, defectPenalty: 0 }
          : null,
      wheel: own ? (s.data.samples[sample.id]?.wheel ?? null) : null,
      defects: own ? (s.data.samples[sample.id]?.defects ?? null) : null,
      sheet: own ? (s.sheets[sample.id] ?? null) : null,
      comparison: own ? (sample.comparison ?? null) : null,
      compare: own && options && self ? { self, others: options.filter((o) => o.id !== sample.id), names, short: names } : null,
      extrinsic: {},
      familyLabels: wheelFamilyLabels(locale),
      blockLabels: w.blockLabels,
      parts: w.parts,
      cards: w.cards,
      overview: w.overview,
      s: w.s,
      compareT: w.compare,
      t: w.detail,
    }),
  );
}

describe("the words of the sheet (results.sheet)", () => {
  it("hold exactly the keys the builder reads, in both languages, with the same placeholders", () => {
    const holes = (text: string) => (text.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const locale of LOCALES) {
      expect(Object.keys(results(locale).sheet)).toEqual([...RESULTS_SHEET_KEYS]);
      for (const key of RESULTS_SHEET_KEYS) {
        expect(holes(results(locale).sheet[key]), `${locale}.${key}`).toBe(holes(results("es").sheet[key]));
      }
    }
  });

  it("the group's score is the group's everywhere: \"¿Cómo se calculó?\" no longer says community", () => {
    for (const locale of LOCALES) {
      const b = results(locale).breakdown;
      for (const key of ["groupTitle", "communityScore", "groupExplain"]) {
        expect(b[key], `${locale}.${key}`).not.toMatch(/comunidad|community/i);
      }
      expect(Object.values(results(locale).sheet).join(" ")).not.toMatch(/comunidad|community|puntaje cva|cva score/i);
    }
  });

  it("the sheet names the score in full once", () => {
    const markup = sheet(overviewScenario("closed"), 1);
    expect(markup.split(results("es").detail.cvaScore).length - 1).toBe(1);
  });
});

describe("the sheet's lists: only where the group's wheel was given, only reference descriptors", () => {
  it("a coffee gets its lists only when its wheel reached this viewer as the group's counts", () => {
    const closed = overviewScenario("closed");
    expect(Object.values(closed.sheets).every((x) => x !== null)).toBe(true);
    // a participant under the wheel's minimum of cuppers, an open session's participant,
    // a solo cupper and an affective session get none
    for (const id of ["two", "open", "solo", "free"]) {
      expect(Object.values(overviewScenario(id).sheets).every((x) => x === null), id).toBe(true);
    }
    // the same frequencies, a wheel that says "too few": nothing leaves
    const sampleIds = closed.samples.map((x) => x.id);
    const frequencies = sampleIds.map((sampleId) => ({
      sampleId,
      totalEvaluators: 6,
      blocks: { general: [{ id: "fruity", label: "Frutal", count: 6 }] },
    }));
    const hidden = {
      ...closed.data,
      samples: Object.fromEntries(
        sampleIds.map((id) => [id, { ...closed.data.samples[id], wheel: { status: "too_few" as const, included: 2 } }]),
      ),
    };
    expect(Object.values(buildSheetData({ sampleIds, overview: hidden, frequencies })).every((x) => x === null)).toBe(true);
    expect(Object.values(buildSheetData({ sampleIds, overview: closed.data, frequencies: null })).every((x) => x === null)).toBe(true);
  });

  it("serialised, a participant's lists and comparison hold no cupper key, name, note or typed word", () => {
    for (const s of OVERVIEW_SCENARIOS.filter((x) => !["closed-owner", "solo"].includes(x.id))) {
      const text = JSON.stringify({ sheets: s.sheets, comparison: s.samples.map((x) => x.comparison ?? null) });
      expect(s.secrets.filter((secret) => text.includes(secret)), s.id).toEqual([]);
      expect(text, s.id).not.toMatch(/cupperKey|cupperId|cupperName|_notas|nota privada|fragmento|notes"/);
    }
  });

  it("a list holds people per descriptor, with the stage's own n, and nothing else", () => {
    const s = overviewScenario("closed");
    const data = s.sheets[s.samples[1].id]!;
    expect(data.n).toBe(6); // seven sent, one excluded
    expect(data.blocks.map((b) => b.id)).toEqual([...SHEET_BLOCK_IDS]);
    const general = data.blocks.find((b) => b.id === SHEET_GENERAL)!;
    expect(general.items.length).toBeGreaterThan(0);
    for (const block of data.blocks) {
      for (const item of block.items) {
        expect(Object.keys(item).sort()).toEqual(["count", "family", "id", "label"]);
        expect(item.count).toBeGreaterThan(0);
        expect(item.count).toBeLessThanOrEqual(data.n);
      }
    }
  });

  it("only descriptors of the reference data are listed: a typed fragment or an unknown id never is", () => {
    const sampleIds = ["x"];
    const evals = [
      { cupperId: "a", sessionSampleId: "x", combinedData: { sabor_desc: ["fruity:berry", "nu", "nuec"], sabor_desc_notes: { "fruity:berry": ["lulo"] } }, descriptiveData: {} },
      { cupperId: "b", sessionSampleId: "x", combinedData: { sabor_desc: ["fruity:berry", "unmapped:lulo"], gustos: ["sweet"] }, descriptiveData: {} },
      { cupperId: "c", sessionSampleId: "x", combinedData: { sabor_desc: ["fruity:berry", "not-a-descriptor"] }, descriptiveData: {} },
    ];
    const frequencies = computeSampleBlockFrequencies({
      format: "combined",
      samples: [{ id: "x", label: "Muestra A" }],
      evals,
      excludedUserIds: new Set<string>(),
      blockLabel: (id) => id,
      locale: "es",
    });
    const overview = buildOverviewData({
      format: "combined",
      cupsPerSample: 1,
      isGroup: true,
      canViewGroup: true,
      ownerLens: false,
      sampleIds,
      rows: evals.map((e) => ({ cupperKey: e.cupperId, sampleId: "x", excluded: false, data: e.combinedData, cups: 1 })),
      own: { x: null },
      joined: 3,
      sentCuppers: 3,
      excludedParticipants: 0,
    });
    const data = buildSheetData({ sampleIds, overview, frequencies })["x"]!;
    const ids = data.blocks.flatMap((b) => b.items.map((i) => i.id));
    const text = JSON.stringify(data);
    expect(ids).toContain("fruity:berry");
    expect(ids).not.toContain("nu");
    expect(ids).not.toContain("nuec");
    expect(ids).not.toContain("not-a-descriptor");
    expect(ids.some((id) => id.startsWith("unmapped:"))).toBe(false);
    expect(text).not.toMatch(/lulo/);
    // every id listed is a wheel node (it has a family) or belongs to another reference vocabulary (it has a name)
    for (const item of data.blocks.flatMap((b) => b.items)) expect(item.label.length).toBeGreaterThan(0);
  });
});

describe("what the sheet shows, state by state", () => {
  it("closed group, participant: the group's score, the quality plot, the full wheel, the lists, the comparison", () => {
    const s = overviewScenario("closed");
    const w = words("es");
    const markup = sheet(s, 1);
    for (const title of [w.detail.cvaScore, w.s.youAndGroup, w.s.flavourGroup, w.s.compareWith, w.s.notes]) {
      expect(markup, title).toContain(title);
    }
    expect((markup.match(/<details/g) ?? []).length).toBe(1);
    expect(markup).toContain("data-sheet-descriptors");
    expect(markup).toContain(w.parts.counted.chosenByYou);
    // "Comparar con" offers the other coffees, never this one
    expect((markup.match(/aria-pressed="false"/g) ?? []).length).toBe(s.samples.length - 1);
  });

  it("a flavour family's colour is a dot beside a word: no pill is filled with it", () => {
    for (const s of OVERVIEW_SCENARIOS) {
      const markup = sheet(s, s.samples.length > 1 ? 1 : 0);
      expect(markup, s.id).not.toMatch(/style="[^"]*background-color/);
      expect(markup, s.id).not.toMatch(/text-white/);
    }
    const source = read("components", "results", "SampleDetail.tsx");
    expect(source).not.toMatch(/backgroundColor|info\.color|text-white/);
  });

  it("two cuppers: no wheel and no list for a participant, the group's value per quality attribute stays (decision 6)", () => {
    const s = overviewScenario("two");
    const w = words("es");
    const markup = sheet(s, 0);
    expect(markup).toContain(w.s.flavourTooFew);
    expect(markup).not.toContain("data-sheet-descriptors");
    expect(markup).not.toContain(w.s.compareWith);
    expect(markup).toContain(w.s.youAndGroup);
    // three cuppers are needed for the rest of "tú vs. grupo"
    expect(s.samples[0].comparison).toEqual({ status: "too_few", included: 2 });
  });

  it("open group, participant: own marks only, no group number, no total for an unsent draft", () => {
    const s = overviewScenario("open");
    const w = words("es");
    const sent = sheet(s, 0);
    expect(sent).toContain(w.s.flavourOwn);
    expect(sent).not.toContain(w.s.flavourGroup);
    expect(sent).not.toContain(w.s.youAndGroup);
    expect(sent).not.toContain(w.s.compareWith);
    expect(sent).not.toMatch(/1 de 1/);
    const draft = sheet(s, 2);
    expect(draft).toContain(w.detail.inProgress as string);
    expect(draft).toContain(w.parts.score.noScore);
    expect(draft).not.toMatch(/data-score-line/);
  });

  it("a fixed reference: 79.00 alone and a sentence instead of the quality plot", () => {
    const s = overviewScenario("closed");
    const w = words("es");
    const markup = sheet(s, 0);
    expect(markup).toContain("79.00");
    expect(markup).toContain(w.s.qualityPinned);
    expect(markup).not.toContain(w.s.youAndGroup);
    expect(markup).not.toMatch(/±/);
  });

  it("affective: no flavour section at all; descriptive: no score and no quality", () => {
    const w = words("es");
    const affective = sheet(overviewScenario("free"), 1);
    expect(affective).not.toContain(w.s.flavourGroup);
    expect(affective).not.toContain(w.s.flavourOwn);
    expect(affective).toContain(w.s.youAndGroup);
    const descriptive = sheet(overviewScenario("descriptive"), 1);
    expect(descriptive).not.toContain(w.detail.cvaScore);
    expect(descriptive).not.toContain(w.s.quality);
    expect(descriptive).toContain(w.s.flavourGroup);
  });

  it("the organizer reading one cupper sees that cupper's evaluation and nothing of the group", () => {
    const s = overviewScenario("closed-owner");
    const w = words("es");
    const markup = sheet(s, 1, "es", "Catador 7");
    expect(markup).toContain("Catador 7");
    expect(markup).not.toContain(w.s.youAndGroup);
    expect(markup).not.toContain(w.s.flavourGroup);
    expect(markup).not.toContain(w.s.compareWith);
    expect(markup).not.toContain("data-sheet-descriptors");
    expect(markup).not.toContain(w.parts.dotPlot.legendGroup);
  });

  it("renders every coffee of every scenario in both languages, with a name on every button", () => {
    for (const s of OVERVIEW_SCENARIOS) {
      for (const locale of LOCALES) {
        s.samples.forEach((_, index) => {
          const markup = sheet(s, index, locale);
          expect(markup).toContain("data-coffee-sheet");
          expect(markup).not.toMatch(/<h1|<h2/);
          for (const button of markup.match(/<button[^>]*>[^<]*/g) ?? []) {
            expect(/aria-label="[^"]+"/.test(button) || />[^<]+$/.test(button) || /aria-expanded|role="tab"/.test(button), button).toBe(true);
          }
        });
      }
    }
  }, HEAVY_TEST_TIMEOUT_MS);
});

describe("the coffee in the address", () => {
  it("writes and removes one parameter and keeps every other", () => {
    expect(SHEET_PARAM).toBe("sample");
    expect(withSheet("", "abc")).toBe("?sample=abc");
    expect(withSheet("?closed=1", "abc")).toBe("?closed=1&sample=abc");
    expect(withSheet("?closed=1&sample=abc", "def")).toBe("?closed=1&sample=def");
    expect(withSheet("?closed=1&sample=abc", null)).toBe("?closed=1");
    expect(withSheet("?sample=abc", null)).toBe("");
  });

  it("opens only a coffee of this session: anything else opens nothing", () => {
    const ids = ["a1", "b2"];
    expect(sheetSampleId("a1", ids)).toBe("a1");
    expect(sheetSampleId("zz", ids)).toBeNull();
    expect(sheetSampleId("", ids)).toBeNull();
    expect(sheetSampleId(null, ids)).toBeNull();
    expect(sheetSampleId(undefined, ids)).toBeNull();
  });

  it("closing is \"back\" when this visit opened the sheet, and a replace after a reload", () => {
    expect(closeMove(true)).toBe("back");
    expect(closeMove(false)).toBe("replace");
  });

  it("the page reads the open coffee from the address, pushes on open, and keeps the dialog mounted for focus", () => {
    const hook = read("app", "[locale]", "app", "sessions", "[id]", "results", "useSheetAddress.ts");
    expect(hook).toMatch(/useSearchParams\(\)\.get\(SHEET_PARAM\)/);
    expect(hook).toMatch(/window\.history\.pushState\(null, "", urlWith\(id\)\)/);
    expect(hook).toMatch(/window\.history\.back\(\)/);
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).toMatch(/useSheetAddress\(session\.samples\.map\(\(sm\) => sm\.id\)\)/);
    expect(client).toMatch(/open=\{detailSample !== null\}/);
    expect(client).not.toMatch(/useState<\{ sampleId: string; participantId/);
  });
});

describe("what the sheet replaces is gone", () => {
  const gone = [
    ["app", "[locale]", "app", "sessions", "[id]", "results", "DescriptoresTab.tsx"],
    ["components", "results", "WordCloud.tsx"],
    ["components", "results", "FlavorCloud.tsx"],
    ["components", "results", "DescriptorFrequency.tsx"],
    ["components", "results", "SampleComparisons.tsx"],
    ["components", "results", "SampleGroupBlock.tsx"],
    ["lib", "wordCloud.ts"],
  ];

  it("the Descriptores tab, the cloud, the roll-up lists and the temporary group block", () => {
    for (const file of gone) expect(existsSync(path.join(process.cwd(), ...file)), file.join("/")).toBe(false);
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).not.toMatch(/DescriptoresTab|descriptorFrequency|tabDescriptores|"descriptores"|SampleGroupBlock|hideSingles/);
    const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
    // the lists stay on the server (they feed "tú vs. grupo" and the sheet's gated data)
    expect(page).not.toMatch(/descriptorFrequency=\{/);
    expect(page).toMatch(/buildSheetData\(\{/);
  });

  it("the alignment table is still reachable: on the organizer's Panel", () => {
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    // since R5 the Panel is one view, mounted under `canViewIndividual`, and the alignment is one of its parts
    expect(client).toMatch(/canViewIndividual && participants \? \(\s*<PanelView/);
    expect(client).toMatch(/cupperAlignment && cupperAlignment\.length > 0/);
    expect(read("components", "results", "PanelView.tsx")).toMatch(/<CupperAlignment/);
    expect(existsSync(path.join(process.cwd(), "components", "results", "CupperAlignment.tsx"))).toBe(true);
  });

  it("the results folders left the alias allowlist", () => {
    const tokens = read("tests", "appTokens.test.ts");
    const list = tokens.slice(tokens.indexOf("const ALLOWLIST"), tokens.indexOf("};", tokens.indexOf("const ALLOWLIST")));
    expect(list).not.toMatch(/components\/results|sessions\/\[id\]\/results/);
  });
});

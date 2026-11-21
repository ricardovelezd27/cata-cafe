import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RESULTS_OVERVIEW_KEYS, buildOverviewStrings } from "@/components/results/overviewStrings";
import type { CardsStrings } from "@/components/results/cardsStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { SessionOverview } from "@/components/results/SessionOverview";
import { OVERVIEW_SCENARIOS, overviewScenario, type OverviewScenario } from "@/lib/dev/overviewFixtures";
import { wheelFamilyLabels } from "@/lib/flavorWheelLabels";
import { WHEEL_FAMILY_ORDER } from "@/lib/flavorWheel";
import { overviewView } from "@/lib/reports/overview";
import { FLAVOR_WHEEL_MIN_N } from "@/lib/scoreContext";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

// Package R2: the overview of a cupping's results. What it LOOKS like is checked
// by a person (the real page through the capture tool, and the dev board for the
// states no test account can show); here: what each tile shows for every state
// of RESULTS-DESIGN.md section 4, and that a participant's payload carries
// counts and aggregates only.

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = { es, en } as const;
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);

/** The words as the page builds them. */
function stringsOf(locale: Locale) {
  const results = MESSAGES[locale].results as unknown as Record<string, Record<string, string>>;
  const raw = (key: string) => {
    const [block, name] = key.split(".");
    return results[block][name];
  };
  return {
    parts: buildResultsPartsStrings({ raw }),
    t: buildOverviewStrings(
      { raw },
      {
        rankHelp: results.dashboard.rankHelp,
        communityPending: (MESSAGES[locale].results as unknown as Record<string, string>).communityPending,
        defectTypes: { moldy: "Mohoso", phenolic: "Fenólico", potato: "Papa" },
      },
    ),
  };
}
const viewOf = (s: OverviewScenario) =>
  overviewView({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data: s.data });
const render = (s: OverviewScenario, locale: Locale = "es") => {
  const { parts, t } = stringsOf(locale);
  return html(
    createElement(
      SessionOverview,
      {
        samples: s.samples,
        ctx: s.ctx,
        referenceId: s.referenceId,
        data: s.data,
        myAlignment: s.myAlignment,
        preliminary: s.preliminary,
        // "Comparar": drawn only for a closed cupping, as on the page
        compare: {
          closed: s.closed,
          t: MESSAGES[locale].results.cards as unknown as Pick<
            CardsStrings,
            "compare" | "comparePick" | "compareHint" | "compareNeedTwo"
          >,
        },
        familyLabels: wheelFamilyLabels(locale),
        parts,
        t,
        onOpenSample: () => {},
      },
      // the coffees one by one (the cards) sit between the two boxes and "Comparar"
      createElement("div", { "data-cards-slot": "" }),
    ),
  );
};
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the words of the overview (results.overview)", () => {
  it("hold exactly the keys the builder reads, in both languages, with the same placeholders", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale].results.overview)).toEqual([...RESULTS_OVERVIEW_KEYS]);
    }
    for (const key of RESULTS_OVERVIEW_KEYS) {
      expect(holes(MESSAGES.en.results.overview[key]), key).toEqual(holes(MESSAGES.es.results.overview[key]));
    }
  });
  it("name the score in full once, and never by quality", () => {
    expect(MESSAGES.es.results.overview.scoreName).toBe("Puntaje Café Sensible (base CVA).");
    expect(MESSAGES.en.results.overview.scoreName).toBe("Café Sensible score (CVA-based).");
    for (const locale of LOCALES) {
      const all = Object.values(MESSAGES[locale].results.overview).join(" ");
      expect(all).not.toMatch(/mejor|peor|excelente|sobresaliente|best|worst|excellent|outstanding/i);
    }
  });
});

describe("a participant's payload: counts and aggregates only", () => {
  const ALLOWED = new Set([
    "scope", "samples", "who", "wheel", "defects", "status", "reason", "included", "n", "direct", "rollup", "mine",
    "cuppers", "cups", "types", "type", "joined", "sent", "excluded",
  ]);
  it("serialised, it holds no cupper key, name or free text, in any scenario", () => {
    for (const s of OVERVIEW_SCENARIOS) {
      const json = JSON.stringify(s.data);
      for (const secret of s.secrets) expect(json, `${s.id}: ${secret}`).not.toContain(secret);
      expect(json, s.id).not.toMatch(/SECRETO|nota privada|Nombre|cupper-|cupperKey|sabor_notas|_final/);
      const sampleIds = new Set(s.samples.map((x) => x.id));
      const wrong: string[] = [];
      const walk = (v: unknown, parent?: string) => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, parent));
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            if (parent === "samples") {
              if (!sampleIds.has(k)) wrong.push(`samples: "${k}" is not a sample of the session`);
              walk(x, "sample");
            } else if (parent === "direct" || parent === "rollup") {
              if (typeof x !== "number") wrong.push(`${parent}.${k} is not a number`);
            } else {
              if (!ALLOWED.has(k)) wrong.push(`key "${k}" is not allowed`);
              walk(x, k);
            }
          }
        }
      };
      walk(s.data);
      expect(wrong, s.id).toEqual([]);
    }
  });
  it("the number of excluded cuppers is the organizer's: a participant gets null", () => {
    expect(overviewScenario("closed").data.who).toEqual({ joined: 8, sent: 7, included: 6, excluded: null });
    expect(overviewScenario("closed-owner").data.who).toEqual({ joined: 8, sent: 7, included: 6, excluded: 1 });
    expect(text(render(overviewScenario("closed")))).not.toMatch(/Excluidos/);
    expect(text(render(overviewScenario("closed-owner")))).toContain("Excluidos: 1");
  });
  it("an excluded cupper is in no group number", () => {
    const s = overviewScenario("closed");
    for (const sample of s.samples) {
      expect(sample.aggregateScore?.participantCount, sample.label).toBe(6); // seven sent, one excluded
      const wheel = s.data.samples[sample.id].wheel;
      expect(wheel.status === "ok" ? wheel.n : null, sample.label).toBe(6);
    }
    expect(s.data.samples[s.samples[5].id].defects).toMatchObject({ n: 6, cuppers: 2, cups: 2 });
  });
  it("the page passes the group's rows only under its own gate, and builds the data on the server", () => {
    const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
    const call = page.slice(page.indexOf("const overviewData = buildOverviewData("), page.indexOf("joined: totalParticipants"));
    expect(call).toMatch(/rows:\s*canViewGroup && session\.isGroup\s*\?/);
    expect(call).toContain("canViewGroup,");
    expect(call).toContain("ownerLens: ownerRead");
    // the one gate of group data is still the page's single call site
    expect((page.match(/viewerMayReadGroupResults\(/g) ?? []).length).toBe(1);
    const client = read("components", "results", "SessionOverview.tsx");
    expect(client).not.toMatch(/buildOverviewData|prisma|server-only/);
  });
});

describe("what each tile shows, state by state (RESULTS-DESIGN section 4)", () => {
  it("closed group, participant: the first of the ranking, every coffee, the wheels, me against the panel", () => {
    const s = overviewScenario("closed");
    const v = viewOf(s);
    expect(v.scope).toBe("group");
    expect(v.ranked).toBe(true);
    expect(v.first.status).toBe("ok");
    if (v.first.status !== "ok") return;
    expect(v.first.entry.sample.label).toBe("Muestra G");
    expect(v.first.entry.place).toBe(1);
    expect(v.first.entry.context.basis).toBe("community");
    expect(v.first.entry.context.included).toEqual({ n: 6, total: 7 });
    expect(v.first.entry.context.spread).not.toBeNull();
    expect(v.first.entry.context.mine).not.toBeNull();
    expect(v.first.entry.context.difference).not.toBeNull();
    expect(v.first.entry.context.deltaVsReference).not.toBeNull();
    // the reference is outside the ranking, the average and "first"
    expect(v.entries.map((e) => e.sample.label)).not.toContain("Muestra E");
    expect(v.references.map((r) => r.sample.label)).toEqual(["Muestra E"]);
    expect(v.referenceLine?.score).toBe(79);
    expect(v.entries.map((e) => e.place)).toEqual([...v.entries.map((e) => e.place)].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(v.you).toMatchObject({ of: 5 });
    expect(v.defects.map((d) => d.sample.label)).toEqual(["Muestra D"]);
  });

  it("says nothing about how close two neighbours are (owner, 2026-11-21): coffees are compared in Comparar", () => {
    for (const locale of LOCALES) {
      for (const scenario of OVERVIEW_SCENARIOS) {
        expect(text(render(scenario, locale)), scenario.id).not.toMatch(/sin diferencia clara|no clear difference/i);
      }
      expect(JSON.stringify(MESSAGES[locale].results)).not.toMatch(/sin diferencia clara|no clear difference/i);
    }
  }, HEAVY_TEST_TIMEOUT_MS);

  it("two cuppers: no first, no spread, no difference, no wheel for a participant, no 'you and the panel'", () => {
    const s = overviewScenario("two");
    const v = viewOf(s);
    expect(v.first).toEqual({ status: "none", reason: "too_few" });
    for (const e of v.entries) {
      expect(e.context.spread).toBeNull();
      expect(e.context.difference).toBeNull();
      expect(e.context.included).toEqual({ n: 2, total: 2 });
      expect(e.context.suppressed).toBe(true);
    }
    expect(FLAVOR_WHEEL_MIN_N).toBe(3);
    expect(v.you).toBeNull();
    const markup = text(render(s));
    expect(markup).toContain(stringsOf("es").t.firstTooFew);
    // under three cuppers nothing can be compared: no "Comparar" at all
    expect(markup).not.toContain(MESSAGES.es.results.cards.compareHint);
    // "indicativo" is on every row: the ranking says once what it means
    expect(markup).toContain("Indicativo");
    expect(markup.split("hay menos de 6 catadores").length).toBe(2);
    expect(render(s)).not.toMatch(/_petal_|_ground_/); // no wheel is drawn at all
  });

  it("a free reference has its own average and spread, and is still outside the ranking", () => {
    const s = overviewScenario("free");
    const v = viewOf(s);
    expect(s.referencePinned).toBe(false);
    expect(v.references).toHaveLength(1);
    expect(v.references[0].value.basis).toBe("community");
    expect(v.references[0].value.sd).not.toBeNull();
    expect(v.entries.map((e) => e.sample.label)).toEqual(["Muestra A", "Muestra B"]);
    expect(v.referenceLine?.score).toBe(v.references[0].value.score);
    // an affective session: no wheel, and no word about descriptors
    const markup = render(s);
    expect(markup).not.toMatch(/_petal_|_ground_/);
    expect(text(markup)).not.toMatch(/sabor de cada café|marcaste/i);
  });

  it("the reference has no tile of its own: its score is the ranking's dashed line, said once in its legend", () => {
    const markup = render(overviewScenario("closed"));
    const titles = [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(titles.join("|")).not.toMatch(/Referencia/);
    expect(text(markup)).toContain("referencia: Muestra E, 79.00");
    expect(text(markup).split("79.00").length - 1).toBe(1);
  });

  it("open group, participant: own scores in cupping order, no ranking, and no total for an unsent draft", () => {
    const s = overviewScenario("open");
    const v = viewOf(s);
    expect(s.data.scope).toBe("own");
    expect(s.data.who).toBeNull();
    expect(v.ranked).toBe(false);
    expect(v.first.status).toBe("none");
    expect(v.entries.map((e) => e.sample.label)).toEqual(["Muestra A", "Muestra B", "Muestra C", "Muestra D"]);
    expect(v.entries.every((e) => e.place === null)).toBe(true);
    const [a, b, c, d] = v.entries;
    expect(a.context.basis).toBe("mine");
    expect(b.context.score).not.toBeNull();
    expect(c.context.score, "a complete draft has no total (F2)").toBeNull();
    expect(d.context.score).toBeNull();
    expect(v.you).toBeNull();
    // no aggregate of the group is in the samples the page would ship
    expect(s.samples.every((x) => x.aggregateScore === null)).toBe(true);
    const markup = text(render(s));
    expect(markup).toContain(stringsOf("es").t.communityPending);
    expect(markup).toContain(stringsOf("es").t.rankingTitleOpen);
    expect(markup).not.toContain(stringsOf("es").t.firstTitle);
    expect(markup).not.toContain(stringsOf("es").t.whoTitle);
  });

  it("solo: my own ranking and marks, and my own defective cup", () => {
    const s = overviewScenario("solo");
    const v = viewOf(s);
    expect(v.scope).toBe("own");
    expect(v.ranked).toBe(true);
    expect(v.first.status === "ok" ? v.first.entry.context.basis : null).toBe("mine");
    expect(v.who).toBeNull();
    expect(v.defects.map((d) => d.summary.cups)).toEqual([1]);
    const markup = text(render(s));
    expect(markup).toContain(stringsOf("es").t.firstTitleOwn);
    expect(markup).toContain(stringsOf("es").t.rankingTitleOwn);
    expect(markup).not.toMatch(/Catadores que marcaron/); // not "1 de 1 catadores"
  });

  it("descriptive: no scores, so no boxes; the coffees lead and Comparar follows", () => {
    const s = overviewScenario("descriptive");
    const v = viewOf(s);
    expect(v.entries).toEqual([]);
    expect(v.first).toEqual({ status: "none", reason: "descriptive" });
    expect(v.you).toBeNull();
    expect(v.defects).toEqual([]);
    const markup = render(s);
    const titles = [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(titles[0]).toBe(MESSAGES.es.results.cards.compare);
    expect(markup.indexOf("data-cards-slot")).toBeLessThan(markup.indexOf(MESSAGES.es.results.cards.compareHint));
    expect(text(markup)).not.toMatch(/\b\d{2}\.\d{2}\b/); // no score anywhere
  });
});

describe("the view's order, and nothing said twice in it (owner, 2026-11-21)", () => {
  it("the two boxes, then the coffees, then Comparar, then the small facts", () => {
    const markup = render(overviewScenario("closed"));
    const t = stringsOf("es").t;
    const at = (needle: string) => {
      const i = markup.indexOf(needle);
      expect(i, needle).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      at(`>${t.firstTitle}<`),
      at(`>${t.rankingTitle}<`),
      at("data-cards-slot"),
      at(`>${MESSAGES.es.results.cards.compare}<`),
      at(`>${t.youTitle}<`),
      at(`>${t.whoTitle}<`),
      at(`>${t.defectsTitle}<`),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("the first box holds the coffee's name and its score, and no wheel (the wheel is on the card)", () => {
    const markup = render(overviewScenario("closed"));
    const box = markup.slice(markup.indexOf(`>${stringsOf("es").t.firstTitle}<`), markup.indexOf(`>${stringsOf("es").t.rankingTitle}<`));
    expect(text(box)).toContain("Muestra G");
    expect(box).toContain("data-overview-score");
    expect(box).not.toMatch(/<svg|_petal_|_ground_/);
    expect(text(box)).not.toMatch(/incluidos|±|Lo más encontrado/);
  });

  it("no wheel of one coffee is drawn by the view itself: only the territories of Comparar", () => {
    const markup = render(overviewScenario("closed"));
    const beforeCompare = markup.slice(0, markup.indexOf(`>${MESSAGES.es.results.cards.compare}<`));
    expect(beforeCompare).not.toMatch(/_petal_|_ground_/);
    // Comparar: the dim family shades under the territories, and its table
    const compare = markup.slice(markup.indexOf(`>${MESSAGES.es.results.cards.compare}<`));
    expect((compare.match(/_ground_/g) ?? []).length).toBe(9);
    expect(compare).toMatch(/_territory_/);
    expect(compare).toContain("<table");
    expect(compare).toMatch(/_beside_/);
    // every coffee carries its letter on the drawing: no line legend under it
    expect(compare).not.toMatch(/_legend_/);
  });

  it("who cupped: how many joined and sent; the included count is on the ranking's rows, not here", () => {
    const markup = render(overviewScenario("closed"));
    const who = markup.slice(markup.indexOf(`>${stringsOf("es").t.whoTitle}<`));
    const tile = text(who.slice(0, who.indexOf("</section>")));
    expect(tile).toContain("Se unieron: 8");
    expect(tile).toContain("Enviaron: 7");
    expect(tile).not.toMatch(/incluidos|6 de 7/);
    expect(text(markup)).toContain("6 de 7 incluidos");
  });

  it("an open cupping compares nothing yet: no Comparar before the close", () => {
    expect(text(render(overviewScenario("open")))).not.toContain(MESSAGES.es.results.cards.compareHint);
  });
});

describe("the overview on the page", () => {
  it("renders every scenario in both languages, one h2 per tile, no heading of another level", () => {
    for (const locale of LOCALES) {
      for (const s of OVERVIEW_SCENARIOS) {
        const markup = render(s, locale);
        const sections = (markup.match(/<section /g) ?? []).length;
        expect(sections, s.id).toBeGreaterThan(0);
        expect((markup.match(/<h2 /g) ?? []).length, s.id).toBe(sections);
        expect(markup, s.id).not.toMatch(/<h[1345]\b/);
        expect(markup, s.id).not.toContain("undefined");
        expect(markup, s.id).not.toMatch(/\{[a-z]+\}/); // no unfilled placeholder
      }
    }
  }, HEAVY_TEST_TIMEOUT_MS);

  it("the first tile prints the number of the model, and the whole tile opens that coffee", () => {
    const s = overviewScenario("closed");
    const v = viewOf(s);
    if (v.first.status !== "ok") throw new Error("no first");
    const markup = render(s);
    const numeral = (markup.match(/data-overview-score="">([\s\S]*?)<\/p>/) ?? ["", ""])[1].replace(/<[^>]+>/g, "");
    expect(numeral).toBe((v.first.entry.context.score as number).toFixed(2));
    expect(markup).toContain(`aria-label="Muestra G Ámbar"`);
  });

  it("every control has a name, and a button is never inside another", () => {
    for (const s of OVERVIEW_SCENARIOS) {
      const markup = render(s);
      for (const button of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const named = /aria-label="[^"]+"/.test(button[1]) || button[2].replace(/<[^>]+>/g, "").trim().length > 0;
        expect(named, `${s.id}: ${button[0].slice(0, 80)}`).toBe(true);
        expect(button[2], s.id).not.toContain("<button");
      }
    }
  });

  it("a coffee's name is shown only once it is revealed", () => {
    const s = overviewScenario("open"); // no sample of it is revealed
    expect(s.samples.every((x) => !x.revealed && x.coffee === null)).toBe(true);
    const closed = text(render(overviewScenario("closed")));
    expect(closed).toContain("Ámbar");
    const hidden = { ...overviewScenario("closed") };
    hidden.samples = hidden.samples.map((x) => ({ ...x, revealed: false }));
    expect(text(render(hidden))).not.toContain("Ámbar");
  });
});

describe("the overview holds no colour, threshold or gate of its own", () => {
  const css = read("components", "results", "SessionOverview.module.css");
  const src = read("components", "results", "SessionOverview.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const rule = (name: string) => (css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`)) ?? ["", ""])[1];

  it("a score is ink: the numeral takes the text colour, and nothing colours it by its value", () => {
    expect(rule("numeral")).toMatch(/color:\s*var\(--color-on-surface\)/);
    expect(rule("fact")).toMatch(/color:\s*var\(--color-on-surface\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(src).not.toMatch(/style=\{/);
    expect(src).not.toMatch(/score\s*[<>]=?\s*\d|>=\s*8\d|quality|band/i);
  });
  it("the error red appears in one place, the mark of a defective cup; no family tone and no accent in a tile", () => {
    const red = [...css.matchAll(/([^{}]+)\{[^}]*var\(--color-error\)[^}]*\}/g)].map((m) => m[1].trim());
    expect(red).toEqual([".defectMark"]);
    expect(css).not.toMatch(/--family-tone|--color-flavor-|--color-secondary/);
  });
  it("no threshold is restated: the component compares no count of cuppers with a number", () => {
    expect(src).not.toMatch(/RANKING_POLICY|FLAVOR_WHEEL_MIN_N|minN\b/);
    expect(src).not.toMatch(/\b(n|included|cuppers|sent)\s*(>=|<=|<|>)\s*[2-9]/);
    expect(src).not.toMatch(/useTranslations|localStorage|sessionStorage/);
    expect(src).not.toMatch(/animat|transition|@keyframes/i);
    expect(css).not.toMatch(/animation|@keyframes/);
  });
  it("the nine family names come from the wheel's reference data", () => {
    const labels = wheelFamilyLabels("es");
    expect(Object.keys(labels)).toEqual([...WHEEL_FAMILY_ORDER]);
    expect(wheelFamilyLabels("en").fruity).toBe("Fruity");
    expect(labels.fruity).toBe("Frutal");
  });
});

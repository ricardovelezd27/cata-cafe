import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RESULTS_OVERVIEW_KEYS, buildOverviewStrings } from "@/components/results/overviewStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { SessionOverview } from "@/components/results/SessionOverview";
import { OVERVIEW_SCENARIOS, overviewScenario, type OverviewScenario } from "@/lib/dev/overviewFixtures";
import { wheelFamilyLabels } from "@/lib/flavorWheelLabels";
import { WHEEL_FAMILY_ORDER } from "@/lib/flavorWheel";
import { referenceCopySuffix, referenceExplanation } from "@/lib/referenceRules";
import { overviewView } from "@/lib/reports/overview";
import { FLAVOR_WHEEL_MIN_N } from "@/lib/scoreContext";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

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

/** The words as the page builds them: the reference's title and explanation are
 *  chosen by the session's format and reference mode (`referenceExplanation`). */
function stringsOf(locale: Locale, s?: OverviewScenario) {
  const suffix = s
    ? referenceCopySuffix(referenceExplanation({ mode: s.referenceMode, moduleKey: s.ctx.format }))
    : "";
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
        referenceTitle: results.dashboard[`anchorTitle${suffix}`],
        referenceHint: results.dashboard[`anchorHint${suffix}`],
        notScored: results.dashboard.notScored,
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
  const { parts, t } = stringsOf(locale, s);
  return html(
    createElement(SessionOverview, {
      samples: s.samples,
      ctx: s.ctx,
      referenceId: s.referenceId,
      data: s.data,
      myAlignment: s.myAlignment,
      preliminary: s.preliminary,
      referencePinned: s.referencePinned,
      familyLabels: wheelFamilyLabels(locale),
      parts,
      t,
      onOpenSample: () => {},
    }),
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
    expect(v.wheels.status).toBe("ok");
    expect(v.you).toMatchObject({ of: 5 });
    expect(v.defects.map((d) => d.sample.label)).toEqual(["Muestra D"]);
  });

  it("the first two coffees with no clear difference say so, with the gap", () => {
    const v = viewOf(overviewScenario("closed"));
    if (v.first.status !== "ok") throw new Error("no first");
    const [a, b] = v.entries;
    const gap = Math.abs((a.context.score as number) - (b.context.score as number));
    if (a.context.noClearGap && b.context.noClearGap && gap < 1) {
      expect(v.first.tieWith?.sample.label).toBe(b.sample.label);
      expect(v.first.tieWith?.gap).toBeCloseTo(gap, 2);
      expect(text(render(overviewScenario("closed")))).toContain(`Sin diferencia clara con ${b.sample.label}`);
    } else {
      expect(v.first.tieWith).toBeNull();
    }
  });

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
    expect(v.wheels).toEqual({ status: "too_few" });
    expect(v.you).toBeNull();
    const markup = text(render(s));
    expect(markup).toContain(stringsOf("es").t.firstTooFew);
    expect(markup).toContain(stringsOf("es").t.wheelsTooFew);
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
    expect(v.wheels).toEqual({ status: "no_wheel" });
    const markup = render(s);
    expect(markup).not.toMatch(/_petal_|_ground_/);
    expect(text(markup)).not.toMatch(/sabor de cada café|marcaste/i);
  });

  it("a fixed reference prints its number alone: no spread and no n for a rule", () => {
    const markup = render(overviewScenario("closed"));
    const tile = markup.slice(markup.indexOf("Referencia fija"));
    expect(text(tile)).toContain("79.00");
    expect(text(tile.slice(0, tile.indexOf("Quiénes cataron")))).not.toMatch(/±|incluidos/);
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
    expect(v.wheels.status === "ok" ? v.wheels.scope : null).toBe("own");
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

  it("descriptive: no scores, so no ranking and no first; the wheels lead", () => {
    const s = overviewScenario("descriptive");
    const v = viewOf(s);
    expect(v.entries).toEqual([]);
    expect(v.first).toEqual({ status: "none", reason: "descriptive" });
    expect(v.you).toBeNull();
    expect(v.defects).toEqual([]);
    expect(v.wheels.status).toBe("ok");
    const markup = render(s);
    const titles = [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(titles[0]).toBe(stringsOf("es").t.wheelsTitle);
    expect(text(markup)).not.toMatch(/\b\d{2}\.\d{2}\b/); // no score anywhere
  });

  it("a coffee nobody has sent yet is not drawn as an empty wheel", () => {
    const base = overviewScenario("closed");
    const first = base.samples[1].id;
    const data = {
      ...base.data,
      samples: {
        ...base.data.samples,
        [first]: { wheel: { status: "ok" as const, scope: "group" as const, n: 0, direct: {}, rollup: {}, mine: null }, defects: null },
      },
    };
    const v = overviewView({ samples: base.samples, referenceId: base.referenceId, ctx: base.ctx, data });
    expect(v.wheels.status === "ok" ? v.wheels.items.map((i) => i.sample.id) : []).not.toContain(first);
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
  });

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

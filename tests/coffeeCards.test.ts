import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { RESULTS_CARDS_KEYS, buildCardsStrings, type CardsStrings } from "@/components/results/cardsStrings";
import { CoffeeCards } from "@/components/results/CoffeeCards";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { OVERVIEW_SCENARIOS, overviewScenario, type OverviewScenario } from "@/lib/dev/overviewFixtures";
import { wheelFamilyLabels, wheelNodeLabels } from "@/lib/flavorWheelLabels";
import { coffeeCards, compareOptions, qualityRows, sampleTag } from "@/lib/reports/coffeeCards";
import { overviewView } from "@/lib/reports/overview";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Package R2, step 2: one card per coffee under the overview, and "Comparar".
// What it LOOKS like is checked by a person (the real page through the capture
// tool, and the dev board for the states no test account can show); here: what
// a card shows for every state of RESULTS-DESIGN.md section 4, that a
// participant's cards carry counts and aggregates only, and that the table and
// the radars the cards replace are gone from the page.

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = { es, en } as const;
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);

function stringsOf(locale: Locale): { cards: CardsStrings; parts: ReturnType<typeof buildResultsPartsStrings> } {
  const results = MESSAGES[locale].results as unknown as Record<string, Record<string, string>>;
  const raw = (key: string) => {
    const [block, name] = key.split(".");
    return results[block][name];
  };
  const attributes = MESSAGES[locale].attributes as unknown as Record<string, string>;
  return {
    parts: buildResultsPartsStrings({ raw }),
    cards: buildCardsStrings(
      { raw },
      {
        inProgress: results.table.inProgress,
        notEvaluated: results.table.notEvaluated,
        inProgressLegend: results.table.inProgressLegend,
        partialLabel: results.partial.label,
        reveal: "Revelar",
        revealed: "Revelada",
        referenceBadge: (MESSAGES[locale].results as unknown as Record<string, string>).referenceBadge,
        attributes: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.id, attributes[a.id]])),
      },
    ),
  };
}

const cardsOf = (s: OverviewScenario) =>
  coffeeCards({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data: s.data });

function render(s: OverviewScenario, locale: Locale = "es", canReveal = false): string {
  const { cards, parts } = stringsOf(locale);
  return html(
    createElement(CoffeeCards<OverviewScenario["samples"][number]>, {
      cards: cardsOf(s),
      format: s.ctx.format,
      referencePinned: s.referencePinned,
      canReveal,
      onReveal: () => {},
      onOpenSample: () => {},
      familyLabels: wheelFamilyLabels(locale),
      nodeLabels: wheelNodeLabels(locale),
      parts,
      t: cards,
    }),
  );
}

/** A card without the page's own sample (which the page already ships, and
 *  which holds the viewer's own notes): what this step ADDS to the payload. */
const added = (s: OverviewScenario) =>
  cardsOf(s).map(({ sample, ...rest }) => ({ id: sample.id, ...rest }));

describe("the words of the cards (results.cards)", () => {
  it("hold exactly the keys the builder reads, in both languages, with the same placeholders", () => {
    const holes = (text: string) => (text.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const locale of LOCALES) {
      const block = (MESSAGES[locale].results as unknown as Record<string, Record<string, string>>).cards;
      expect(Object.keys(block)).toEqual([...RESULTS_CARDS_KEYS]);
      for (const key of RESULTS_CARDS_KEYS) {
        expect(holes(block[key]), `${locale}.${key}`).toBe(holes((es.results as unknown as Record<string, Record<string, string>>).cards[key]));
      }
    }
  });

  it("never name a score by quality, and never call it the CVA score", () => {
    for (const locale of LOCALES) {
      const text = Object.values((MESSAGES[locale].results as unknown as Record<string, Record<string, string>>).cards).join(" ");
      expect(text).not.toMatch(/puntaje cva|cva score|sca score|excelente|sobresaliente|outstanding|excellent/i);
    }
  });
});

describe("a participant's cards: counts and aggregates only", () => {
  const participant = OVERVIEW_SCENARIOS.filter((s) => !["closed-owner", "solo"].includes(s.id));

  it("serialised, what the cards add holds no cupper key, name or free text, in any scenario", () => {
    expect(participant.length).toBeGreaterThanOrEqual(5);
    for (const s of participant) {
      const text = JSON.stringify(added(s));
      const leaked = s.secrets.filter((secret) => text.includes(secret));
      expect(leaked, s.id).toEqual([]);
      expect(text, s.id).not.toMatch(/cupperKey|cupperId|cupperName|userId|_notas|nota privada/);
    }
  });

  it("a card has only these fields, so a new one cannot ride along unseen", () => {
    const allowed = new Set([
      "id", "place", "isReference", "context", "state", "partial", "wheel", "quality",
      // the context of a score (lib/scoreContext.ts)
      "score", "basis", "spread", "included", "n", "total", "mine", "difference", "deltaVsReference", "indicative",
      "suppressed", "noClearGap", "canBeFirst",
      // the wheel: people per node, the three most chosen, the viewer's own marks
      "status", "scope", "counts", "descriptors", "level", "family", "bar", "count", "share", "pct",
      // a quality row
      "group",
    ]);
    const seen = new Set<string>();
    const walk = (value: unknown, parent: string | null): void => {
      if (Array.isArray(value)) return value.forEach((v) => walk(v, parent));
      if (value && typeof value === "object") {
        for (const [key, v] of Object.entries(value)) {
          // `counts` is keyed by wheel node ids, which are reference data
          if (parent !== "counts") seen.add(key);
          walk(v, key);
        }
      }
    };
    for (const s of OVERVIEW_SCENARIOS) walk(added(s), null);
    expect([...seen].filter((key) => !allowed.has(key))).toEqual([]);
  });

  it("the comparison's options are counts too", () => {
    const s = overviewScenario("closed");
    const options = compareOptions({ closed: true, samples: s.samples, data: s.data });
    expect(options).not.toBeNull();
    const text = JSON.stringify(options);
    expect(s.secrets.filter((secret) => text.includes(secret))).toEqual([]);
  });

  it("the group's value per attribute is given only under the page's gate and from two included cuppers", () => {
    const closed = overviewScenario("closed");
    const sample = closed.samples[1];
    expect(qualityRows(sample, closed.ctx)?.every((row) => row.group !== null)).toBe(true);
    // the gate closed: the same sample, no group value
    expect(qualityRows(sample, { ...closed.ctx, canViewGroup: false })?.every((row) => row.group === null)).toBe(true);
    // one included cupper: that is one person's ratings, not a group's
    const one = { ...sample, aggregateScore: sample.aggregateScore && { ...sample.aggregateScore, participantCount: 1 } };
    expect(qualityRows(one, closed.ctx)?.every((row) => row.group === null)).toBe(true);
    // two: decision 6 keeps it
    const two = overviewScenario("two");
    expect(qualityRows(two.samples[0], two.ctx)?.every((row) => row.group !== null)).toBe(true);
  });

  it("the page builds the cards from the gated overview data, and reads the group's results through its one gate", () => {
    const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
    expect(page.match(/viewerMayReadGroupResults\(/g)).toHaveLength(1);
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).toMatch(/coffeeCards\(\{ samples: session\.samples, referenceId, ctx: rankCtx, data: overview\.data \}\)/);
    // the sheet gets the group's stored numbers only under the same gate
    expect(client).toContain("const aggregate = isGroup && canViewGroup && agg && agg.communityScore != null ? agg : null;");
  });
});

describe("what a card shows, state by state (RESULTS-DESIGN section 4)", () => {
  it("closed group, participant: the reference first and outside the ranking, then the ranking's own order and words", () => {
    const s = overviewScenario("closed");
    const cards = cardsOf(s);
    const view = overviewView({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data: s.data });
    expect(cards[0].isReference).toBe(true);
    expect(cards[0].place).toBeNull();
    const ranked = cards.slice(1);
    expect(ranked.map((c) => c.sample.id)).toEqual(view.entries.map((e) => e.sample.id));
    expect(ranked.map((c) => c.place)).toEqual(view.entries.map((e) => e.place));
    // a card can never disagree with the tile above it: the same context object
    ranked.forEach((card, i) => expect(card.context).toEqual(view.entries[i].context));
    expect(ranked.every((c) => c.context?.included !== null)).toBe(true);
    for (const card of ranked) {
      expect(card.wheel?.status).toBe("ok");
      if (card.wheel?.status !== "ok") continue;
      expect(card.wheel.scope).toBe("group");
      expect(card.wheel.descriptors.length).toBeLessThanOrEqual(3);
      expect(card.wheel.n).toBe(6); // seven sent, one excluded
    }
  });

  it("the three most chosen descriptors carry the viewer's own marks, and only theirs", () => {
    const s = overviewScenario("closed");
    const card = cardsOf(s).find((c) => c.sample.label === "Muestra G");
    expect(card?.wheel?.status).toBe("ok");
    if (card?.wheel?.status !== "ok") return;
    // the viewer (cupper 1) picked berry, citrus and honey
    expect([...card.wheel.mine].sort()).toEqual(["fruity:berry", "fruity:citrus", "sweet:brown_sugar:honey"]);
    const markup = render(s);
    expect(markup).toContain(stringsOf("es").parts.counted.chosenByYou);
  });

  it("two cuppers: no wheel for a participant and no spread or difference; the group's value per attribute stays", () => {
    const s = overviewScenario("two");
    const cards = cardsOf(s);
    expect(cards.every((c) => c.wheel?.status === "too_few")).toBe(true);
    expect(cards.every((c) => c.context?.spread === null && c.context?.difference === null)).toBe(true);
    expect(cards.every((c) => c.quality?.every((row) => row.group !== null))).toBe(true);
    expect(render(s)).toContain(stringsOf("es").cards.tooFew);
  });

  it("open group, participant: cupping order with no places, own values only, and no total for an unsent draft", () => {
    const s = overviewScenario("open");
    const cards = cardsOf(s);
    expect(cards.map((c) => c.sample.id)).toEqual(s.samples.map((x) => x.id));
    expect(cards.every((c) => c.place === null)).toBe(true);
    expect(cards.map((c) => c.state)).toEqual(["submitted", "submitted", "draft", "none"]);
    // F2: a complete draft shows its ratings, never a total
    expect(cards[2].context?.score).toBeNull();
    expect(cards[2].quality?.some((row) => row.mine !== null)).toBe(true);
    expect(cards.every((c) => c.quality?.every((row) => row.group === null))).toBe(true);
    expect(cards.filter((c) => c.wheel?.status === "ok").every((c) => c.wheel?.status === "ok" && c.wheel.scope === "own")).toBe(true);
    const markup = render(s);
    const { cards: t } = stringsOf("es");
    expect(markup).toContain(t.inProgress);
    expect(markup).toContain(t.notEvaluated);
    expect(markup).toContain(t.inProgressLegend);
    // nothing of the comparison before the close
    expect(compareOptions({ closed: s.closed, samples: s.samples, data: s.data })).toBeNull();
  });

  it("a viewer who marked no flavour gets no empty wheel on their own card", () => {
    const s = overviewScenario("open");
    const id = s.samples[0].id;
    const own = s.data.samples[id].wheel;
    expect(own.status === "ok" && own.scope === "own").toBe(true);
    const nothing = { ...own, direct: {}, rollup: {}, mine: [] } as typeof own;
    const data = { ...s.data, samples: { ...s.data.samples, [id]: { ...s.data.samples[id], wheel: nothing } } };
    const cards = coffeeCards({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data });
    expect(cards[0].wheel).toBeNull();
    expect(cards[1].wheel?.status).toBe("ok");
  });

  it("solo: my own ranking and my own marks, no group value anywhere", () => {
    const s = overviewScenario("solo");
    const cards = cardsOf(s);
    expect(cards.map((c) => c.place)).toEqual([1, 2, 3]);
    expect(cards.every((c) => c.context?.basis === "mine" && c.context.included === null)).toBe(true);
    expect(cards.every((c) => c.wheel?.status === "ok" && c.wheel.scope === "own")).toBe(true);
    expect(cards.every((c) => c.quality?.every((row) => row.group === null))).toBe(true);
    // own marks are names, never "1 de 1"
    expect(render(s)).not.toMatch(/1 de 1/);
  });

  it("descriptive: no number on a card, no place, cupping order with the reference first", () => {
    const s = overviewScenario("descriptive");
    const cards = cardsOf(s);
    expect(cards.every((c) => c.context === null && c.quality === null && c.place === null)).toBe(true);
    expect(cards[0].isReference).toBe(true);
    expect(cards.slice(1).map((c) => c.sample.id)).toEqual(s.samples.filter((x) => x.referenceRank === null).map((x) => x.id));
    const markup = render(s);
    expect(markup).not.toMatch(/79\.00/);
    expect(markup).toContain(stringsOf("es").cards.noteDescriptive);
  });

  it("affective: no wheel and no word about descriptors; the eight quality attributes instead", () => {
    const s = overviewScenario("free");
    const cards = cardsOf(s);
    expect(cards.every((c) => c.wheel === null)).toBe(true);
    expect(cards.every((c) => c.quality?.length === AFFECTIVE_ATTRIBUTES.length)).toBe(true);
    const markup = render(s);
    const { cards: t } = stringsOf("es");
    expect(markup).toContain(t.qualityGroup);
    expect(markup).not.toContain(t.mostChosen);
    // a FREE reference was rated like any coffee: its card carries its own average
    expect(cards[0].isReference).toBe(true);
    expect(cards[0].context?.score).not.toBeNull();
    expect((markup.match(/<dl/g) ?? []).length).toBe(cards.length);
  });

  it("a fixed reference prints its number alone, and is marked outside the ranking", () => {
    const s = overviewScenario("closed");
    const markup = render(s);
    const first = markup.slice(markup.indexOf("<li"), markup.indexOf("</li>"));
    const { cards: t, parts } = stringsOf("es");
    expect(first).toContain("79.00");
    expect(first).toContain(t.outsideRanking);
    expect(first).toContain(t.referenceBadge);
    expect(first).not.toContain(parts.score.included.split("{")[0].trim() || "incluidos");
    expect(first).not.toMatch(/±/);
  });
});

describe("\"Comparar\": only once closed, only what this viewer may see", () => {
  it("offers the coffees in the ranking's order, each with the letter of its label", () => {
    const s = overviewScenario("closed");
    const view = overviewView({ samples: s.samples, referenceId: s.referenceId, ctx: s.ctx, data: s.data });
    const order = [...view.entries.map((e) => e.sample.id), ...view.references.map((r) => r.sample.id)];
    const options = compareOptions({ closed: true, samples: s.samples, order, data: s.data });
    expect(options?.map((o) => o.id)).toEqual(order);
    expect(options?.map((o) => o.tag)).toEqual(order.map((id) => s.samples.find((x) => x.id === id)!.label.slice(-1)));
  });

  it("is refused while the session is open, in an affective session, and under the wheel's minimum of cuppers", () => {
    const closed = overviewScenario("closed");
    expect(compareOptions({ closed: false, samples: closed.samples, data: closed.data })).toBeNull();
    const affective = overviewScenario("free");
    expect(compareOptions({ closed: true, samples: affective.samples, data: affective.data })).toBeNull();
    const two = overviewScenario("two");
    expect(compareOptions({ closed: true, samples: two.samples, data: two.data })).toBeNull();
  });

  it("a letter names one coffee: when two labels would share one, every coffee takes its number", () => {
    expect(sampleTag("Muestra G", 3)).toBe("G");
    expect(sampleTag("sample b", 0)).toBe("B");
    expect(sampleTag("Lote de la finca", 2)).toBe("3");
    const s = overviewScenario("closed");
    const samples = s.samples.map((x, i) => (i === 3 ? { ...x, label: "Muestra G" } : x));
    const options = compareOptions({ closed: true, samples, data: s.data });
    expect(new Set(options?.map((o) => o.tag)).size).toBe(options?.length);
    expect(options?.every((o) => /^[0-9]+$/.test(o.tag))).toBe(true);
  });

  it("the ground under the territories is ONE prop, rings by default", () => {
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client.match(/const COMPARE_GROUND: "rings" \| "families" = "rings";/g)).toHaveLength(1);
    expect(read("components", "results", "OverviewCompare.tsx")).toMatch(/ground = "rings"/);
  });
});

describe("the cards on the page", () => {
  it("render every scenario in both languages: one h2, an h3 per card, a named button per card", () => {
    for (const s of OVERVIEW_SCENARIOS) {
      for (const locale of LOCALES) {
        const markup = render(s, locale);
        const cards = cardsOf(s);
        expect((markup.match(/<h2/g) ?? []).length, s.id).toBe(1);
        expect(markup).toMatch(/<h2[^>]*class="section-title/);
        expect((markup.match(/<h3/g) ?? []).length, s.id).toBe(cards.length);
        expect((markup.match(/data-card-open=""/g) ?? []).length, s.id).toBe(cards.length);
        expect(markup).not.toMatch(/<h1|<h4/);
        // every button has a name: its text or an aria-label
        for (const button of markup.match(/<button[^>]*>/g) ?? []) expect(button).toMatch(/aria-label="[^"]+"/);
      }
    }
  });

  it("the row has numbered steps, one per card, the first one current; never dots", () => {
    const s = overviewScenario("closed");
    const markup = render(s);
    const nav = markup.slice(markup.indexOf("<nav"), markup.indexOf("</nav>"));
    const steps = nav.match(/<button[^>]*>/g) ?? [];
    expect(steps).toHaveLength(cardsOf(s).length);
    expect(steps[0]).toMatch(/aria-current="true"/);
    expect(steps.slice(1).every((b) => !/aria-current/.test(b) && /tabindex="-1"/.test(b))).toBe(true);
    expect(nav.replace(/<[^>]+>/g, "")).toBe(cardsOf(s).map((_, i) => String(i + 1)).join(""));
  });

  it("a coffee's name is shown only once it is revealed, and \"Revelar\" only to the organizer of an open cupping", () => {
    const open = overviewScenario("open");
    expect(render(open)).not.toContain("Revelar");
    const asOrganizer = render(open, "es", true);
    expect((asOrganizer.match(/aria-label="Revelar: /g) ?? []).length).toBe(open.samples.length);
    const closed = overviewScenario("closed");
    const hidden = { ...closed, samples: closed.samples.map((x) => ({ ...x, revealed: false })) };
    expect(render(hidden)).not.toContain("Granate");
    expect(render(closed)).toContain("Granate");
  });

  it("a button is never inside another, and the card's cover comes before the organizer's button", () => {
    const markup = render(overviewScenario("open"), "es", true);
    expect(markup).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
    const card = markup.slice(markup.indexOf("<li"), markup.indexOf("</li>"));
    expect(card.indexOf('data-card-open=""')).toBeLessThan(card.indexOf('aria-label="Revelar: '));
  });
});

describe("the styles of the cards hold no colour or grade of their own", () => {
  const css = read("components", "results", "CoffeeCards.module.css");
  const tsx = read("components", "results", "CoffeeCards.tsx");

  it("no hex colour, no legacy alias, no family tone, no error red", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/--color-(error|secondary|family)/);
    for (const source of [tsx, read("components", "results", "OverviewCompare.tsx"), read("components", "results", "SampleDetail.tsx")]) {
      expect(source).not.toMatch(/text-green-dark|text-brown-|bg-cream|amber-warm|red-defect|rounded-(md|lg|xl)\b/);
    }
  });

  it("a step is a 44 px target, the row snaps, and from 768 px it is a grid with no steps", () => {
    const step = css.slice(css.indexOf(".step {"), css.indexOf("}", css.indexOf(".step {")));
    expect(step).toMatch(/width: 44px;/);
    expect(step).toMatch(/height: 44px;/);
    expect(css).toMatch(/scroll-snap-type: x mandatory;/);
    const wide = css.slice(css.indexOf("@media (min-width: 768px)"));
    expect(wide).toMatch(/\.row \{[^}]*display: grid;/);
    expect(wide).toMatch(/\.steps \{ display: none; \}/);
  });

  it("no text under 12.25 px, and nothing moves by itself", () => {
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12.25);
    expect(css).not.toMatch(/animation|@keyframes|transition/);
  });

  it("the row is one Tab stop while it is a sideways scroller: a roving tabindex and the arrow keys", () => {
    expect(tsx).toMatch(/const tabIndexOf = \(index: number\) => \(phone && index !== current \? -1 : 0\);/);
    expect(tsx).toMatch(/ArrowRight/);
    expect(tsx).toMatch(/ArrowLeft/);
    expect(tsx).toMatch(/PHONE_MAX/);
  });
});

describe("what the cards replace is gone", () => {
  it("the table of 17 columns, the radars and the Tabla / Grafico switch are not on the page", () => {
    expect(existsSync(path.join(process.cwd(), "components", "results", "ScoreTable.tsx"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "components", "results", "SampleRadarChart.tsx"))).toBe(false);
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).not.toMatch(/ScoreTable|SampleRadarChart|cata_results_view|viewTable|viewChart/);
    expect(client).not.toMatch(/setTab\("resultados"\)/);
  });

  it("the organizer keeps the matrix, on its own tab, and a viewer with one view gets no tab bar", () => {
    const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
    expect(client).toMatch(/\.\.\.\(canViewIndividual \? \[\{ id: "panel", label: overview\.cards\.tabPanel \}\] : \[\]\)/);
    // since R5 the matrix is one part of the Panel's own view
    expect(client).toMatch(/<PanelView/);
    expect(read("components", "results", "PanelView.tsx")).toMatch(/<OwnerParticipantSection/);
    expect(client).toMatch(/\{tabItems\.length > 1 \? \(/);
  });
});

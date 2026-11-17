import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { CoffeeScoreBlock } from "@/components/coffees/CoffeeScoreBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { historyCommunityScoreShown } from "@/lib/coffeePageDisplay";
import type { LifetimeLines } from "@/lib/coffeeLifetimeLines";
import { readSource as read } from "./helpers/sourceTree";

// Package S9 of the UI/UX audit of 2026-11-15 (I-07, F-13, J-02): coffees, groups, profile.

const coffeePage = read("app/[locale]/app/coffees/[id]/page.tsx");

const ALL_LINES: LifetimeLines = {
  headline: "83.25",
  roundingNote: "ROUNDING",
  accumulated: "ACCUMULATED",
  arithmetic: "ARITHMETIC",
  tally: "TALLY",
  byType: "BYTYPE",
  nonUniform: "NONUNIFORM",
  indicative: { badge: "BADGE", note: "INDICATIVE" },
  anchorNote: "ANCHOR",
  note: "NOTE",
  noBase: "NOBASE",
};

const block = (lines: LifetimeLines, showLines: boolean) =>
  renderToStaticMarkup(
    createElement(
      CoffeeScoreBlock,
      {
        title: "TITLE",
        lines,
        showLines,
        counts: { sessionsLabel: "SESSIONS", sessions: 12, evaluationsLabel: "EVALS", evaluations: 31 },
        detailsLabel: "HOW",
      },
      createElement("p", null, "RECENT"),
    ),
  );

describe("I-07: one score block on the coffee page", () => {
  it("prints every line the lifetime card printed, and the counts, once", () => {
    const html = block(ALL_LINES, true);
    expect(html.split(">TITLE<").length - 1, "TITLE in text").toBe(1);
    for (const s of ["83.25", "ROUNDING", "ACCUMULATED", "ARITHMETIC", "TALLY", "BYTYPE", "NONUNIFORM", "BADGE", "INDICATIVE", "ANCHOR", "NOTE", "NOBASE", "SESSIONS 12", "EVALS 31", "RECENT"]) {
      expect(html.split(s).length - 1, s).toBe(1);
    }
  });
  it("the number, its context and Indicativo are in view; the arithmetic is on demand", () => {
    const html = block(ALL_LINES, true);
    const [before, inside] = html.split("<details");
    for (const s of ["83.25", "ACCUMULATED", "INDICATIVE", "NOBASE"]) expect(before, s).toContain(s);
    for (const s of ["ARITHMETIC", "TALLY", "BYTYPE", "ROUNDING", "SESSIONS 12", "RECENT"]) expect(inside, s).toContain(s);
    expect(html).toMatch(/<summary[^>]*>HOW/);
  });
  it("the score is a number in ink, never the accent colour", () => {
    const number = /<span[^>]*>83\.25<\/span>/.exec(block(ALL_LINES, true))![0];
    expect(number).toMatch(/text-on-surface/);
    expect(number).not.toMatch(/text-secondary|text-primary/);
  });
  it("without a visible closed session it shows only the number and the counts, as before", () => {
    const html = block({ ...ALL_LINES, headline: null }, false);
    for (const s of ["ACCUMULATED", "ARITHMETIC", "TALLY", "NOTE", "NOBASE", "INDICATIVE"]) expect(html, s).not.toContain(s);
    expect(html).toContain("—");
    expect(html).toContain("SESSIONS 12");
  });
  it("the page uses the block once, names the score once, and no stat card repeats it", () => {
    expect(coffeePage).not.toMatch(/LifetimeScoreCard/);
    expect(coffeePage.match(/<CoffeeScoreBlock\b/g)).toHaveLength(1);
    expect(coffeePage.match(/t\("lifetime\.title"\)/g)).toHaveLength(1);
    expect(coffeePage).not.toMatch(/<StatCard[^>]*label=\{t\("statSessions"\)\}/);
    expect(coffeePage).not.toMatch(/<StatCard[^>]*label=\{t\("statEvals"\)\}/);
  });
  it("the attribute bars start at 1 on their 1 to 9 scale", () => {
    expect(coffeePage).not.toMatch(/value \/ 9\)/);
    expect(coffeePage).toMatch(/scalePct\(value, QUALITY_SCALE\.min, QUALITY_SCALE\.max\)/);
  });
  it("the history says a session's community score only when the sessions list does not", () => {
    const listed = new Set(["s1", "s2"]);
    expect(historyCommunityScoreShown("s1", listed)).toBe(false);
    expect(historyCommunityScoreShown("s3", listed)).toBe(true);
    expect(historyCommunityScoreShown(null, listed)).toBe(true); // a deleted session
    expect(historyCommunityScoreShown(undefined, new Set())).toBe(true);
    expect(coffeePage).toMatch(/historyCommunityScoreShown\(h\.sessionId, sessionRowIds\)/);
  });
});

describe("F-13: the coffees table at 768 px", () => {
  const table = read("components/coffees/CoffeesTable.tsx");
  it("origin, process and variety are hidden from 768 to 1023 px, header and cell alike", () => {
    for (const key of ["origin", "process", "variety"]) {
      const col = new RegExp(`key: "${key}",[\\s\\S]*?(?=\\n      \\},)`).exec(table)![0];
      expect(col, key).toMatch(/headerClassName: "hidden lg:table-cell"/);
      expect(col, key).toMatch(/cellClassName: "hidden lg:table-cell"/);
    }
    for (const key of ["name", "sessions", "score", "date"]) {
      const col = new RegExp(`key: "${key}",[\\s\\S]*?(?=\\n      \\},)`).exec(table)![0];
      expect(col, key).not.toMatch(/hidden lg:table-cell/);
    }
  });
});

describe("J-02: empty lists are the kit's EmptyState", () => {
  const sites: [string, RegExp][] = [
    ["app/[locale]/app/groups/page.tsx", /\{t\("(empty|noCoCuppers)"\)\}<\/p>/],
    ["app/[locale]/app/groups/[id]/page.tsx", /\{t\("noSessions"\)\}<\/p>/],
    ["components/groups/GroupActivityFeed.tsx", /\{emptyText\}<\/p>/],
    ["app/[locale]/app/profile/page.tsx", /\{t\("(noOwnedSessions|myCoffeesEmpty)"\)\}<\/p>/],
    ["app/[locale]/app/coffees/[id]/page.tsx", /\{(th\("empty"\)|t\("recentTastingsEmpty"\))\}<\/p>|sessionsOthersNote"\) : t\("noResults"\)\}\s*<\/p>/],
  ];
  it("no plain line is left where a list is empty", () => {
    for (const [file, plain] of sites) {
      const src = read(file);
      expect(src, file).not.toMatch(plain);
      expect(src, file).toMatch(/<EmptyState\b/);
    }
  });
  it("at most one action per empty state, and none where the header already has it", () => {
    const history = read("app/[locale]/app/profile/history/HistoryTable.tsx");
    const empty = history.slice(history.indexOf("emptyState={"), history.indexOf("noResults="));
    expect(empty).toMatch(/<EmptyState\b/);
    expect(empty.match(/<GuestGateLink\b/g)).toHaveLength(1);
    // the coffees list, the groups list and a coffee's history point up in words
    expect(read("components/coffees/CoffeesTable.tsx")).toMatch(/<EmptyState[\s\S]{0,120}?body=\{t\.noDataBody\} \/>/);
    expect(read("app/[locale]/app/groups/page.tsx")).toMatch(/<EmptyState[\s\S]{0,120}?title=\{t\("empty"\)\} body=\{t\("emptyBody"\)\} \/>/);
    expect(coffeePage).toMatch(/<EmptyState title=\{th\("empty"\)\} body=\{t\("historyEmptyBody"\)\} \/>/);
    for (const m of [es, en]) {
      expect(m.coffee.noDataBody).toMatch(m === es ? /Crear café/ : /Create coffee/);
      expect(m.groups.emptyBody).toMatch(m === es ? /Crear grupo/ : /Create group/);
      expect(m.coffee.historyEmptyBody).toMatch(m === es ? /Catar este café/ : /Taste this coffee/);
    }
  });
  it("an action that leads to a gated area is a GuestGateLink (profile)", () => {
    const profile = read("app/[locale]/app/profile/page.tsx");
    expect(profile).toMatch(/<GuestGateLink href=\{`\/\$\{locale\}\/app\/sessions\/express`\}/);
    expect(profile).toMatch(/<GuestGateLink href=\{`\/\$\{locale\}\/app\/coffees\/new`\}/);
  });
  it("the coffees list's empty state, rendered: it points to the header, no link, no button", () => {
    for (const m of [es, en]) {
      const html = renderToStaticMarkup(createElement(EmptyState, { title: m.coffee.noData, body: m.coffee.noDataBody }));
      expect(html).toContain(m.coffee.noData);
      expect(html).not.toMatch(/<a\b|<button\b/);
    }
  });
});

import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { introStartsCollapsed } from "@/lib/dashboardIntro";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Coffee } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { readSource as read } from "./helpers/sourceTree";

// Package S6 of the UI/UX audit of 2026-11-15 (C-01, I-04, D-08, F-15): the dashboard.

const page = read("app/[locale]/app/page.tsx");
const intro = read("components/dashboard/DashboardIntro.tsx");
const sessionsTable = read("app/[locale]/app/sessions/SessionsTable.tsx");

/** Class strings that paint the action fill (a filled green button), hover variants excluded. */
function filledActions(src: string): string[] {
  return [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2])
    .filter((c) => c.split(/\s+/).includes("bg-primary-container"));
}

const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

describe("F-15: the intro starts collapsed for a returning user", () => {
  it("collapsed with a session or after a dismissal; open only for a newcomer who never dismissed it", () => {
    expect(introStartsCollapsed({ sessionCount: 0, dismissed: false })).toBe(false);
    expect(introStartsCollapsed({ sessionCount: 1, dismissed: false })).toBe(true);
    expect(introStartsCollapsed({ sessionCount: 0, dismissed: true })).toBe(true);
    expect(introStartsCollapsed({ sessionCount: 5, dismissed: true })).toBe(true);
  });
  it("the card reads the rule and the dashboard passes it the person's sessions", () => {
    expect(intro).toMatch(/introStartsCollapsed\(\{\s*sessionCount,\s*dismissed\s*\}\)/);
    expect(page).toMatch(/<DashboardIntro[\s\S]*?sessionCount=\{recentSessions\.length\}/);
    // no new kind of storage: the one existing flag
    expect(intro.match(/localStorage\.(setItem|getItem|removeItem)\(([^,)]+)/g)?.every((c) => c.includes("STORAGE_KEY"))).toBe(true);
  });
});

describe("C-01: one ask, one filled button per fold", () => {
  it("the dashboard has exactly one filled action, in its header: Catar ahora", () => {
    const filled = filledActions(page);
    expect(filled).toHaveLength(1);
    // P1a: the page opens with PageHeader; its action slot holds the ask.
    const header = /<PageHeader[\s\S]*?\n {6}\/>/.exec(page)![0];
    expect(filledActions(header)).toHaveLength(1);
    const firstLink = /<GuestGateLink[\s\S]*?<\/GuestGateLink>/.exec(header)![0];
    expect(firstLink).toMatch(/sessions\/express/);
    expect(firstLink).toMatch(/expressCta/);
  });
  it("the intro card repeats no button: it names both ways in words", () => {
    expect(filledActions(intro)).toHaveLength(0);
    expect(intro).not.toMatch(/GuestGateLink|sessions\/new|sessions\/express/);
    expect(es.dashboard.intro.why).toMatch(/Catar ahora/);
    expect(es.dashboard.intro.why).toMatch(/Nueva sesión/);
    expect(en.dashboard.intro.why).toMatch(/Cup now/);
    expect(en.dashboard.intro.why).toMatch(/New session/);
  });
  it("the empty states point to the header's action in words, without a button", () => {
    const empty = /<EmptyState[^>]*\/>/.exec(page);
    expect(empty, "the dashboard's empty state is the kit's EmptyState").not.toBeNull();
    expect(empty![0]).not.toMatch(/action=/);
    const tableEmpty = /emptyState=\{\s*<EmptyState[\s\S]*?\/>/.exec(sessionsTable)![0];
    expect(tableEmpty).not.toMatch(/action=/);
    expect(es.dashboard.emptyBody).toMatch(/Catar ahora/);
    expect(en.dashboard.emptyBody).toMatch(/Cup now/);
  });
});

describe("C-01: the empty dashboard, rendered", () => {
  // No test account reaches the empty dashboard without a write (par2 has no session but meets the
  // onboarding dialog first), so the empty state is rendered here with the dashboard's own words.
  it("says what the list will hold and points to the header in words; no link, no button", () => {
    for (const m of [es, en]) {
      const html = renderToStaticMarkup(
        createElement(EmptyState, {
          icon: createElement(Coffee, { size: 20 }),
          title: m.dashboard.emptyTitle,
          body: m.dashboard.emptyBody,
        }),
      );
      expect(html).toContain(m.dashboard.emptyTitle);
      expect(html).toContain(m.dashboard.emptyBody);
      expect(html).not.toMatch(/<a\b|<button\b/);
      expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("D-08: the dashboard's pills are the kit's", () => {
  it("statuses come from StatusPill with labels from the messages, not a private map", () => {
    expect(page).not.toMatch(/STATUS_STYLES|STATUS_LABELS/);
    expect(page).not.toMatch(/BORRADOR|ABIERTA|CERRADA/);
    expect(page).toMatch(/<StatusPill status=\{s\.status\} labels=\{statusLabels\} \/>/);
    for (const k of ["statusDraft", "statusActive", "statusClosed"]) expect(page).toContain(`tc("${k}")`);
  });
  it("no hand-made pill is left: the participant badge and the average use Badge and ScorePill", () => {
    expect(page).not.toMatch(/rounded-full font-semibold/);
    expect(page).toMatch(/<Badge tone="outline">\{tSession\("table\.participantBadge"\)\}<\/Badge>/);
    expect(page).toMatch(/<ScorePill score=\{avg\} \/>/);
  });
  it("every session link of the dashboard goes through sessionHref()", () => {
    const links = [...page.matchAll(/href=\{([^}]*sessions\/\$\{[^}]*\}[^}]*)\}/g)];
    expect(links).toHaveLength(0);
    expect(page).toMatch(/href=\{sessionHref\(s, /);
  });
});

describe("I-04: no emoji, and the intro within the word budget", () => {
  const pictograph = /\p{Extended_Pictographic}/u;
  it("no emoji in the dashboard's messages or its two source files", () => {
    for (const m of [es, en]) expect(JSON.stringify(m.dashboard)).not.toMatch(pictograph);
    expect(page).not.toMatch(pictograph);
    expect(intro).not.toMatch(pictograph);
  });
  it("a title of at most 7 words and at most 25 more, in both languages", () => {
    for (const m of [es, en]) {
      const i = m.dashboard.intro;
      expect(words(i.title), i.title).toBeLessThanOrEqual(7);
      const rest = [i.whyLabel, i.why, i.whatLabel, i.what, i.howLabel, i.how].join(" ");
      expect(words(rest), rest).toBeLessThanOrEqual(25);
    }
  });
});

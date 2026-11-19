import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Coffee } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { readSource as read } from "./helpers/sourceTree";

// Package S6 of the UI/UX audit of 2026-11-15 (C-01, I-04, D-08, F-15): the dashboard.

const page = read("app/[locale]/app/page.tsx");
// "Cómo funciona" left the dashboard (owner's review, 2026-11-20): it is the onboarding's second step
// and a dialog on the profile. Its words keep their `dashboard.intro` keys.
const intro = read("components/onboarding/HowItWorks.tsx");
const welcome = read("components/onboarding/WelcomeModal.tsx");
const profilePage = read("app/[locale]/app/profile/page.tsx");
const sessionsTable = read("app/[locale]/app/sessions/SessionsTable.tsx");

/** Class strings that paint the action fill (a filled green button), hover variants excluded. */
function filledActions(src: string): string[] {
  return [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2])
    .filter((c) => c.split(/\s+/).includes("bg-primary-container"));
}

const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

describe("F-15 (revised 2026-11-20): \"Cómo funciona\" is part of onboarding, not a floating link", () => {
  it("the dashboard no longer renders the explainer, its link or the warm-up card", () => {
    expect(page).not.toMatch(/DashboardIntro|dashboard\.intro|WarmupFigure|app\/warmup/);
    expect(page).not.toMatch(/intro\.(reopen|eyebrow)/);
  });
  it("the welcome dialog has it as the second of four numbered steps", () => {
    expect(welcome).toMatch(/<HowItWorks t=\{t\.howItWorks\} \/>/);
    expect(welcome).toMatch(/const total = 4;/);
    expect(welcome).toMatch(/\{\[1, 2, 3, 4\]\.map/);
    // completion logic is untouched: the final step still calls completeOnboarding with the same fields
    expect(welcome).toMatch(/completeOnboarding\(\{ displayName, role, country \}\)/);
  });
  it("a returning user reaches it from the profile", () => {
    expect(profilePage).toMatch(/<HowItWorksDialog[\s\S]*?howItWorksStrings\(tDash\)/);
  });
  it("the card keeps no storage of its own", () => {
    expect(intro).not.toMatch(/localStorage|cata_intro_dismissed/);
  });
});

describe("The stat cards sit right under the header, above the lists", () => {
  it("StatCard row comes before Sesiones recientes and Mis mejores cafés", () => {
    const stats = page.indexOf("<StatCard");
    const header = page.indexOf("<PageHeader");
    expect(stats).toBeGreaterThan(0);
    expect(header).toBeGreaterThan(0);
    expect(stats).toBeLessThan(page.indexOf('t("recent")'));
    expect(stats).toBeLessThan(page.indexOf('t("bestCoffees")'));
    expect(stats).toBeLessThan(page.indexOf('t("activityFeed")'));
    // the P1a card rules stay: 240 px cards, two per row on a phone with the average spanning both
    expect(page).toMatch(/grid-cols-2[^"]*\[&>:last-child\]:col-span-2[^"]*md:grid-cols-\[repeat\(3,minmax\(0,240px\)\)\]/);
  });
});

describe("The two ways to start say what they are", () => {
  it("each label names the action, in both languages, and never the old names", () => {
    expect(es.dashboard.expressCta).toBe("Cata rápida");
    expect(es.dashboard.fullWizardCta).toBe("Organizar cata");
    expect(en.dashboard.expressCta).toBe("Quick cupping");
    expect(en.dashboard.fullWizardCta).toBe("Set up a cupping");
    // the same words everywhere the two actions are labelled (sessions list header, express page, wizard title)
    expect(es.session.express.cta).toBe(es.dashboard.expressCta);
    expect(es.session.express.title).toBe(es.dashboard.expressCta);
    expect(es.session.new).toBe(es.dashboard.fullWizardCta);
    expect(en.session.express.cta).toBe(en.dashboard.expressCta);
    expect(en.session.express.title).toBe(en.dashboard.expressCta);
    expect(en.session.new).toBe(en.dashboard.fullWizardCta);
    for (const m of [es, en]) expect(JSON.stringify(m)).not.toMatch(/Catar ahora|Cup now|“New session”|"Nueva sesión"/);
  });
});

describe("C-01: one ask, one filled button per fold", () => {
  it("the dashboard has exactly one filled action, in its header: Cata rápida", () => {
    const filled = filledActions(page);
    expect(filled).toHaveLength(1);
    // P1a: the page opens with PageHeader; its action slot holds the ask.
    const header = /<PageHeader[\s\S]*?\n {6}\/>/.exec(page)![0];
    expect(filledActions(header)).toHaveLength(1);
    const firstLink = /<GuestGateLink[\s\S]*?<\/GuestGateLink>/.exec(header)![0];
    expect(firstLink).toMatch(/sessions\/express/);
    expect(firstLink).toMatch(/expressCta/);
  });
  it("the explainer repeats no button: it names both ways in words", () => {
    expect(filledActions(intro)).toHaveLength(0);
    expect(intro).not.toMatch(/GuestGateLink|sessions\/new|sessions\/express/);
    expect(es.dashboard.intro.why).toMatch(/Cata rápida/);
    expect(es.dashboard.intro.why).toMatch(/Organizar cata/);
    expect(en.dashboard.intro.why).toMatch(/Quick cupping/);
    expect(en.dashboard.intro.why).toMatch(/Set up a cupping/);
  });
  it("the empty states point to the header's action in words, without a button", () => {
    const empty = /<EmptyState[^>]*\/>/.exec(page);
    expect(empty, "the dashboard's empty state is the kit's EmptyState").not.toBeNull();
    expect(empty![0]).not.toMatch(/action=/);
    const tableEmpty = /emptyState=\{\s*<EmptyState[\s\S]*?\/>/.exec(sessionsTable)![0];
    expect(tableEmpty).not.toMatch(/action=/);
    expect(es.dashboard.emptyBody).toMatch(/Cata rápida/);
    expect(en.dashboard.emptyBody).toMatch(/Quick cupping/);
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

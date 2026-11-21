import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The reflection hosts the existing note editor, which needs the app router and
// the toast provider: neither exists in a server render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useActionFeedback: () => ({ run: async () => {}, notifyError: () => {}, notifySuccess: () => {} }),
}));
vi.mock("@/app/actions/community", () => ({ setPostCloseNote: async () => ({ ok: true }) }));

import { PillTabs } from "@/components/ui/PillTabs";
import { Reflection } from "@/components/results/Reflection";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// OR-D (the owner's review of 2026-11-21): the results page has two VIEWS of the
// same cupping, named by their perspective, and nothing is said twice in one.
// The view's own order and contents are in tests/resultsOverview.test.ts.

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");

describe("two views, named by their perspective", () => {
  it("\"Por café\" for everyone, \"Por catador\" for the organizer and the admin's lens", () => {
    expect(es.results.tabs.resultados).toBe("Por café");
    expect(es.results.cards.tabPanel).toBe("Por catador");
    expect(en.results.tabs.resultados).toBe("By coffee");
    expect(en.results.cards.tabPanel).toBe("By cupper");
    // the second view exists only under the page's own condition, and the address key is unchanged
    expect(client).toMatch(/\.\.\.\(canViewIndividual\s*\? \[\s*\{\s*id: "panel",/);
    expect(client).toContain("RESULTS_TAB_PARAM");
    expect(client).toMatch(/\{tabItems\.length > 1 \? \(/);
  });

  it("what waits for the organizer is the count on the \"Por catador\" tab, not a tile", () => {
    expect(client).toMatch(/badge: String\(waiting\), badgeLabel: pendingSentence\(panelWaiting, overview\.panelT\)/);
    expect(client).not.toMatch(/pendingTitle|pendingOpen|data-overview-pending/);
    expect(read("components", "results", "SessionOverview.tsx")).not.toMatch(/data-overview-pending|pending\.onOpen/);
    const markup = renderToStaticMarkup(
      createElement(PillTabs, {
        items: [
          { id: "a", label: "Por café" },
          { id: "b", label: "Por catador", badge: "3", badgeLabel: "1 evaluación tardía por decidir y 2 notas después del cierre" },
        ],
        value: "a",
        onChange: () => {},
        ariaLabel: "Resultados",
      }),
    );
    // the number is for the eye; a screen reader hears what it counts
    expect(markup).toMatch(/<span aria-hidden="true">3<\/span>/);
    expect(markup).toMatch(/<span class="sr-only">, (<!-- -->)?1 evaluación tardía por decidir y 2 notas después del cierre<\/span>/);
  });
});

describe("what the owner removed is gone", () => {
  it("\"Aprendizajes\": no component, no rules, no words", () => {
    for (const file of [
      ["components", "results", "Learnings.tsx"],
      ["components", "results", "learningsStrings.ts"],
      ["lib", "reports", "learnings.ts"],
      ["lib", "reports", "learningsInput.ts"],
      ["lib", "reports", "learningSentences.ts"],
    ]) {
      expect(existsSync(path.join(process.cwd(), ...file)), file.join("/")).toBe(false);
    }
    expect(Object.keys(es.results)).not.toContain("learnings");
    expect(Object.keys(en.results)).not.toContain("learnings");
    expect(client).not.toMatch(/Learnings|learnings/);
  });

  it("\"Each coffee\" and its switch: Compare is a section of its own", () => {
    const overview = read("components", "results", "SessionOverview.tsx");
    expect(overview).not.toMatch(/SegmentedControl|wheelMode|compareEach/);
    expect(Object.keys(es.results.cards)).not.toContain("compareEach");
    expect(Object.keys(en.results.cards)).not.toContain("compareEach");
  });

  it("\"no clear difference\": no word of it in the results messages, the page or its parts", () => {
    for (const messages of [es, en]) {
      expect(JSON.stringify(messages.results)).not.toMatch(/sin diferencia clara|no clear difference/i);
    }
    for (const file of [
      ["components", "results", "RankStrip.tsx"],
      ["components", "results", "SessionOverview.tsx"],
      ["components", "results", "CoffeeCards.tsx"],
      ["components", "ui", "ScoreWithContext.tsx"],
      ["lib", "scoreContext.ts"],
      ["lib", "reports", "overview.ts"],
      ["lib", "resultsScales.ts"],
    ]) {
      expect(read(...file), file.join("/")).not.toMatch(/noClearGap|tieWith|tieBars|tiesWithNext/);
    }
  });
});

describe("the reflection keeps its per-coffee editors (until the general one replaces them)", () => {
  it("lists the existing note editor once per coffee the reader may write on, and says who reads it", () => {
    const t = { title: es.results.reflection.title, lead: es.results.reflection.lead, who: es.results.reflection.who, whoSolo: es.results.reflection.whoSolo };
    const note = { evaluationId: "e1", text: null, at: null };
    const base = {
      notes: { a: note, b: { ...note, evaluationId: "e2" } },
      samples: [
        { id: "a", label: "Muestra A", revealed: true, coffee: { name: "Ámbar" } },
        { id: "b", label: "Muestra B", revealed: false, coffee: null },
        { id: "c", label: "Muestra C", revealed: false, coffee: null },
      ],
      locale: "es",
      userId: "u1",
      noteT: es.results.postCloseNote,
      t,
    };
    const group = renderToStaticMarkup(createElement(Reflection, { ...base, onlyReader: false }));
    expect((group.match(/<h3/g) ?? []).length).toBe(2);
    expect(group).toContain(t.who);
    const solo = renderToStaticMarkup(createElement(Reflection, { ...base, onlyReader: true }));
    expect(solo).toContain(t.whoSolo);
    expect(solo).not.toContain(t.who);
    expect(renderToStaticMarkup(createElement(Reflection, { ...base, notes: {}, onlyReader: false }))).toBe("");
    // never in the admin's lens, and only on a closed session
    expect(client).toMatch(/\{sessionClosed && !isAdminViewer && postCloseNotes && noteTranslations \? \(\s*<Reflection/);
  });
});

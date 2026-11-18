import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { readSource as read, walkSource, SCAN_TIMEOUT_MS } from "./helpers/sourceTree";
import { countRecipes, areaOf } from "../scripts/ux-recipes/count.mjs";

// Package P2a of the 2026-11-15 UI/UX audit: the three paper primitives (D-07,
// E-05, B-04). Source rules first, then what each one renders.

const FILES = ["components/ui/Card.tsx", "components/ui/Notice.tsx", "components/ui/PaperSectionHeading.tsx"];
const src = Object.fromEntries(FILES.map((f) => [f, read(f)]));

describe("P2a: the primitives paint with the system", () => {
  it.each(FILES)("%s: role tokens only (no hex, no rgb, no legacy alias, no legacy radius)", (f) => {
    const s = src[f];
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(s).not.toMatch(/\brgba?\(/);
    expect(s).not.toMatch(/(?<![\w-])(text|bg|border)-(green-dark|green-mid|brown-[\w-]+|cream|amber-warm|red-defect|bg)(?![\w-])/);
    expect(s).not.toMatch(/(?<![\w-])rounded-(md|lg|xl|2xl)(?![\w-])/);
  });
  it.each(FILES)("%s: named type sizes only (no text-sm / text-xs / text-[..px])", (f) => {
    expect(src[f]).not.toMatch(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/);
    expect(src[f]).not.toMatch(/text-\[\d/);
  });
  it("a card has no shadow and no terracotta ground; its padding is the paper rhythm in pixels", () => {
    // P2b: the recipe lives in cardRecipe.ts (no "use client") so a server page can call cardClasses().
    const s = src["components/ui/Card.tsx"] + read("components/ui/cardRecipe.ts");
    expect(s).not.toMatch(/shadow-/);
    expect(s).not.toMatch(/bg-secondary/);
    expect(s).toMatch(/regular: "p-\[16px\] md:p-\[20px\]"/);
    expect(s).toMatch(/default: "bg-surface-container-lowest"/);
    expect(s).toMatch(/quiet: "bg-surface-container-low"/);
    expect(s).toMatch(/selected: "bg-primary-fixed"/);
  });
  it("a notice is never terracotta: info, warning and error tones only", () => {
    const s = src["components/ui/Notice.tsx"];
    expect(s).not.toMatch(/(bg|border|text)-secondary/);
    expect(s).toMatch(/info: "bg-surface-container text-on-surface"/);
    expect(s).toMatch(/warning: "bg-warning-container text-on-warning-container"/);
    expect(s).toMatch(/error: "bg-error-container text-on-error-container"/);
  });
  it("the dismiss button is 44 x 44 px", () => {
    expect(src["components/ui/Notice.tsx"]).toMatch(/min-h-\[44px\] min-w-\[44px\]/);
  });
});

describe("P2a: one paper heading, one stage heading, never mixed up", () => {
  const appFiles = [
    ...walkSource("app", "p2a", { include: /\.tsx$/, skip: (n, d) => d && ["node_modules", ".next", "generated"].includes(n) }),
    ...walkSource("components", "p2a", { include: /\.tsx$/, skip: (n, d) => d && ["node_modules"].includes(n) }),
  ];
  it(
    "only the landing imports the stage's SectionHeading, and the landing never imports the paper one",
    () => {
      const offenders: string[] = [];
      for (const f of appFiles) {
        const s = read(f);
        const isStage = f.startsWith("components/landing/") || /app\/\[locale\]\/page\.tsx$/.test(f);
        if (!isStage && /from ["']@\/components\/landing\/SectionHeading["']/.test(s)) offenders.push(`${f}: stage heading on paper`);
        if (isStage && /PaperSectionHeading/.test(s)) offenders.push(`${f}: paper heading on the stage`);
      }
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});

describe("PaperSectionHeading renders the level it is given, with the role's look", () => {
  it("level 2 (default) is an h2 with the section title's class", () => {
    const html = renderToStaticMarkup(h(PaperSectionHeading, { title: "Cafés" }));
    expect(html).toMatch(/^<div[^>]*><div[^>]*><div[^>]*><h2 class="min-w-0 section-title text-section">Cafés<\/h2>/);
    expect(html).not.toMatch(/<h3/);
  });
  it("level 3 is an h3 with the card heading's size and ink, not the section green", () => {
    const html = renderToStaticMarkup(h(PaperSectionHeading, { title: "Notas", level: 3 }));
    expect(html).toMatch(/<h3 class="min-w-0 text-card text-on-surface">Notas<\/h3>/);
    expect(html).not.toMatch(/section-title/);
  });
  it("the name is an uppercase label above, the assertion a caption under, the action at the end", () => {
    const html = renderToStaticMarkup(
      h(PaperSectionHeading, { title: "T", name: "N", assertion: "A", action: h("button", { type: "button" }, "Ver"), id: "x" }),
    );
    expect(html).toMatch(/<p class="text-label font-semibold uppercase tracking-widest text-on-surface-variant mb-1">N<\/p>/);
    expect(html).toMatch(/<h2 id="x"/);
    expect(html).toMatch(/<p class="mt-1 text-caption text-on-surface-variant">A<\/p>/);
    expect(html.indexOf("Ver")).toBeGreaterThan(html.indexOf("A</p>"));
    expect(html).toMatch(/mb-\[12px\] md:mb-\[16px\]/);
  });
  it("flush drops the gap to the content", () => {
    expect(renderToStaticMarkup(h(PaperSectionHeading, { title: "T", flush: true }))).not.toMatch(/mb-\[12px\]/);
  });
});

describe("Notice: the right role per tone, never colour alone, a named dismiss", () => {
  it("an error is an alert; info and warning are a status", () => {
    expect(renderToStaticMarkup(h(Notice, { tone: "error", children: "x" }))).toMatch(/^<div role="alert"/);
    expect(renderToStaticMarkup(h(Notice, { tone: "warning", children: "x" }))).toMatch(/^<div role="status"/);
    expect(renderToStaticMarkup(h(Notice, { children: "x" }))).toMatch(/^<div role="status"/);
  });
  it("live={false} drops the role (a notice that is part of the page, not news)", () => {
    expect(renderToStaticMarkup(h(Notice, { live: false, children: "x" }))).not.toMatch(/role=/);
  });
  it("every tone draws its own icon, hidden from screen readers", () => {
    const icons = (["info", "warning", "error"] as const).map((tone) => {
      const html = renderToStaticMarkup(h(Notice, { tone, children: "x" }));
      expect(html).toMatch(/<span class="mt-\[3px\] shrink-0" aria-hidden="true"><svg/);
      return /lucide-([\w-]+)/.exec(html)?.[1];
    });
    expect(new Set(icons).size).toBe(3);
  });
  it("a word can lead the sentence", () => {
    expect(renderToStaticMarkup(h(Notice, { label: "Aviso:", children: "x" }))).toMatch(/<strong class="font-semibold">Aviso: <\/strong>x/);
  });
  it("a dismissible notice has one close button with its name; a fixed one has none", () => {
    const html = renderToStaticMarkup(h(Notice, { children: "x", onDismiss: () => {}, dismissLabel: "Cerrar aviso" }));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" aria-label="Cerrar aviso"/);
    expect(renderToStaticMarkup(h(Notice, { children: "x" }))).not.toMatch(/<button/);
  });
});

describe("Card: one frame, real controls, no nesting", () => {
  it("a static card is the tag it is given, framed once, with no shadow", () => {
    const html = renderToStaticMarkup(h(Card, { as: "section", title: "T", children: "c" }));
    expect(html).toMatch(/^<section class="rounded-card border border-outline-variant text-on-surface bg-surface-container-lowest p-\[16px\] md:p-\[20px\]/);
    expect(html).toMatch(/<h3 class="text-card text-on-surface">T<\/h3>/);
    expect(html).not.toMatch(/shadow/);
  });
  it("an href makes the whole card ONE link (no control inside it)", () => {
    const html = renderToStaticMarkup(h(Card, { href: "/es/app/groups/1", title: "G", children: "c" }));
    expect(html).toMatch(/^<a [^>]*href="\/es\/app\/groups\/1"/);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/hover:bg-surface-container-high/);
    expect(html).not.toMatch(/<button/);
  });
  it("as li + href is a list item holding the link", () => {
    expect(renderToStaticMarkup(h(Card, { as: "li", href: "/x", title: "G" }))).toMatch(/^<li><a /);
  });
  it("an onClick makes the whole card one button", () => {
    const html = renderToStaticMarkup(h(Card, { onClick: () => {}, title: "B" }));
    expect(html).toMatch(/^<button type="button" class="rounded-card/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it("a card inside a card renders without a second frame (and says so in development)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(h(Card, { title: "Outer", children: h(Card, { title: "Inner", children: "c" }) }));
    expect(html.match(/rounded-card/g)).toHaveLength(1);
    expect(html).toMatch(/Inner/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("eyebrow, action and footer sit where the anatomy says", () => {
    const html = renderToStaticMarkup(
      h(Card, { eyebrow: "E", title: "T", action: h("button", { type: "button" }, "A"), footer: "F", children: "c" }),
    );
    expect(html.indexOf(">E<")).toBeLessThan(html.indexOf(">T<"));
    expect(html.indexOf(">T<")).toBeLessThan(html.indexOf(">A<"));
    expect(html).toMatch(/<div class="mt-\[16px\] border-t border-outline-variant pt-\[12px\]">F<\/div>/);
  });
  it("a stat card is capped at 240 px", () => {
    expect(renderToStaticMarkup(h(Card, { stat: true, children: "1" }))).toMatch(/max-w-\[240px\]/);
  });
});

describe("the recipe count (what the later P2 steps take to zero)", () => {
  it(
    "counts by the plan's areas and leaves the primitives and the dev boards out",
    () => {
      const { table, total, hits } = countRecipes();
      expect(table.map((r: { area: string }) => r.area)).toEqual(["cupping", "results", "lists", "arrival", "insights", "kit", "shell and other"]);
      expect(total.card + total.banner + total.notice + total.heading).toBeGreaterThan(0);
      for (const h2 of hits as { file: string }[]) {
        expect(h2.file).not.toMatch(/components\/ui\/(Card|Notice|PaperSectionHeading)\.tsx$/);
        expect(h2.file).not.toMatch(/\/dev\//);
      }
    },
    SCAN_TIMEOUT_MS,
  );
  it("the adopted places are no longer counted", () => {
    const { hits } = countRecipes();
    const at = (f: string) => (hits as { file: string; kind: string }[]).filter((x) => x.file === f).map((x) => x.kind);
    expect(at("components/groups/GroupEmailOptOutNotice.tsx")).toEqual([]);
    expect(at("app/[locale]/app/groups/page.tsx")).toEqual([]);
  });
  it("sorts a path into its area", () => {
    expect(areaOf("app/[locale]/app/sessions/[id]/cup/CupClient.tsx")).toBe("cupping");
    expect(areaOf("components/results/CoffeeCards.tsx")).toBe("results");
    expect(areaOf("app/[locale]/app/groups/page.tsx")).toBe("lists");
    expect(areaOf("app/[locale]/auth/login/page.tsx")).toBe("arrival");
    expect(areaOf("components/insights/ChatPanel.tsx")).toBe("insights");
  });
});

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readSource as read, walkSource, SCAN_TIMEOUT_MS } from "./helpers/sourceTree";

// Package P1a of the 2026-11-15 UI/UX audit: the page frame (F-09, F-10, B-03, D-06, F-11).
// Every paper page sits in PageContainer; the ones not moved yet are listed below, and that
// list may only shrink: a page that moves leaves it, and a page on it may not use the frame.

const APP = "app/[locale]/app";

/** Pages outside this package's area: other surfaces or other packages. */
const OUT_OF_AREA = [
  /sessions\/\[id\]\/(cup|print|results|waiting)\//, // the cupping screen, the print sheet, results, the waiting room
  /\/dev-[\w-]+\/page\.tsx$/, // dev boards (app/dev-waiting, warmup/dev-*)
  /\/team\/page\.tsx$/, // a redirect
];

/** Paper pages of the area NOT in the frame yet (P1a ships the list areas first). Only shrinks. */
const NOT_YET_FRAMED = [
  `${APP}/coffees/[id]/edit/page.tsx`,
  `${APP}/coffees/new/page.tsx`,
  `${APP}/insights/access/page.tsx`,
  `${APP}/insights/benchmark/page.tsx`,
  `${APP}/insights/chat/page.tsx`,
  `${APP}/insights/explorer/page.tsx`,
  `${APP}/insights/page.tsx`,
  `${APP}/insights/users/page.tsx`,
  `${APP}/profile/history/page.tsx`,
  `${APP}/profile/page.tsx`,
  `${APP}/sessions/[id]/edit/page.tsx`,
  `${APP}/sessions/[id]/invite/page.tsx`,
  `${APP}/sessions/express/page.tsx`,
  `${APP}/sessions/new/page.tsx`,
  `${APP}/warmup/[slug]/page.tsx`,
  `${APP}/warmup/page.tsx`,
];

const FRAMED = [
  `${APP}/page.tsx`,
  `${APP}/sessions/page.tsx`,
  `${APP}/coffees/page.tsx`,
  `${APP}/coffees/[id]/page.tsx`,
  `${APP}/groups/page.tsx`,
  `${APP}/groups/[id]/page.tsx`,
];

describe("P1a: every paper page is in the frame, or on a list that only shrinks", () => {
  it(
    "each page of the area uses PageContainer or is listed as not yet framed",
    () => {
      const pages = walkSource(APP, "p1a", {
        include: /(^|\/)page\.tsx$/,
        skip: (n, d) => d && ["node_modules"].includes(n),
      }).filter((f) => !OUT_OF_AREA.some((re) => re.test(f)));
      const offenders = pages.filter((f) => !read(f).includes("<PageContainer") && !NOT_YET_FRAMED.includes(f));
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
  it("the not-yet list only holds pages that exist and are not framed (a moved page leaves it)", () => {
    for (const f of NOT_YET_FRAMED) {
      expect(existsSync(f), f).toBe(true);
      expect(read(f).includes("<PageContainer"), f).toBe(false);
    }
  });
});

describe("P1a: the framed pages open the same way", () => {
  it.each(FRAMED)("%s: in PageContainer, with no page-level wrapper of its own", (f) => {
    const s = read(f);
    expect(s).toContain("<PageContainer");
    // the old page wrappers set their own width and section gaps
    expect(s).not.toMatch(/max-w-3xl space-y-/);
    expect(s).not.toMatch(/return \(\s*<div className="space-y-\d+">/);
  });
  it("one h1 per page: the list pages through PageHeader, never a hand-written h1", () => {
    for (const f of [`${APP}/page.tsx`, `${APP}/sessions/page.tsx`, `${APP}/coffees/page.tsx`, `${APP}/groups/page.tsx`]) {
      const s = read(f);
      expect(s.match(/<PageHeader\b/g), f).toHaveLength(1);
      expect(s, f).not.toMatch(/<h1\b/);
    }
  });
  it("the group page: the member view through PageHeader, the owner view through its editable name, one back link each", () => {
    const s = read(`${APP}/groups/[id]/page.tsx`);
    expect(s.match(/<PageHeader\b/g)).toHaveLength(1);
    expect(s).toMatch(/<PageBackLink\b/);
    expect(s).not.toMatch(/<h1\b/);
    expect(read("components/groups/GroupNameControls.tsx").match(/<h1\b/g)).toHaveLength(1);
  });
  it("the coffee page keeps its single h1 in its identity card", () => {
    expect(read(`${APP}/coffees/[id]/page.tsx`).match(/<h1\b/g)).toHaveLength(1);
  });
});

describe("P1a: the rhythm is the classes'", () => {
  const css = read("app/globals.css");
  it("defines the frame and the rhythm once (16 / 24 / 32 px margin; 24 / 32 and 32 / 40 px gaps; 12 / 16 px head)", () => {
    expect(css).toMatch(/\.paper-container \{\s*padding: 16px 16px 0;/);
    expect(css).toMatch(/\.paper-page \{\s*display: flex;\s*flex-direction: column;\s*row-gap: 32px;/);
    expect(css).toMatch(/\.paper-page > :first-child \{\s*margin-bottom: -8px;/);
    expect(css).toMatch(/\.paper-section-head \{\s*margin-bottom: 12px;/);
    expect(css).toMatch(/padding: 24px 24px 0;[\s\S]*row-gap: 40px;[\s\S]*margin-bottom: 16px;/);
    expect(css).toMatch(/padding: 32px 32px 0;/);
  });
  it("the shell steps aside only for a framed page, and keeps its bottom padding", () => {
    expect(css).toMatch(/main\.app-main:has\(\.paper-container\) \{\s*padding-left: 0;\s*padding-right: 0;\s*padding-top: 0;\s*\}/);
    expect(read(`${APP}/layout.tsx`)).toMatch(/className="app-main [^"]*pb-20 lg:pb-6"/);
  });
  it("the paper heading takes its gap from the class, not from its own margin", () => {
    const s = read("components/ui/PaperSectionHeading.tsx");
    expect(s).toContain('"paper-section-head"');
    expect(s).not.toMatch(/mb-\[12px\]/);
  });
  it("PageContainer has three widths and one alignment (never centred inside the frame)", () => {
    const s = read("components/ui/PageContainer.tsx");
    expect(s).toMatch(/wide: "max-w-\[1200px\]"/);
    expect(s).toMatch(/form: "max-w-\[640px\]"/);
    expect(s).toMatch(/narrow: "max-w-\[400px\]"/);
    expect(s).toMatch(/className=\{`paper-page \$\{COLUMN\[width\]\}`\}/);
  });
});

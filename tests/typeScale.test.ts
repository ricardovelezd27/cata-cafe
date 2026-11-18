import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readSource as read } from "./helpers/sourceTree";

// T4a (findings B-02 and B-05 of the 2026-11-15 audit; decision 1): the paper
// type scale is six named sizes, at the sizes the screen paints at the 14 px
// root, defined once in app/globals.css. The kit (components/ui) uses them and
// paints nothing under the 11 px floor. The rest of the app follows by area in
// the next steps of T4.

const css = read("app/globals.css");
const design = read("DESIGN.md");

/** The scale as DESIGN.md's type table writes it (painted px). */
const SCALE: Record<string, number> = {
  "text-page": 26.25,
  "text-section": 21,
  "text-card": 17.5,
  "text-body": 14,
  "text-caption": 12.25,
  "text-label": 11,
};

const FLOOR = 11;

/** Kit files left for a later step of T4, with the reason. May only SHRINK. */
const KIT_ALLOWLIST: Record<string, string> = {
  // The cupping screen: another session is changing it, and its text is T4's
  // last step ("the cup page checked on a phone").
  SessionShell: "the cupping screen (T4, last step)",
  CanvasFooter: "the cupping screen (T4, last step)",
  SampleTabs: "the cupping screen (T4, last step)",
  ModuleSwitcher: "the cupping screen (T4, last step)",
  AffectiveBubbles: "the cupping screen (T4, last step)",
  IntensitySlider: "the cupping screen (T4, last step)",
  CATAPills: "the cupping screen (T4, last step)",
  CupToggleGrid: "the cupping screen (T4, last step)",
  MasterControls: "the cupping screen (T4, last step)",
  FormSection: "the cupping screen (T4, last step)",
  // The results parts living in the kit: the results route is being rebuilt,
  // and these were written at 12 px and above.
  CountBar: "a results part (results route, being rebuilt)",
  DotPlot: "a results part (results route, being rebuilt)",
  ScoreWithContext: "a results part (results route, being rebuilt); its numerals are display sizes outside the six roles",
};

const KIT = "components/ui";
const kitFiles = readdirSync(join(process.cwd(), KIT)).filter((f) => /\.(tsx?|css)$/.test(f));
const allowed = (f: string) => Object.keys(KIT_ALLOWLIST).some((k) => f === `${k}.tsx` || f.startsWith(`${k}.`));

const ARBITRARY = /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g;
const UNDER_FLOOR = /(?<![\w-])text-xs(?![\w-])/g;
const BARE_SIZE = /(?<![\w-])(?:[a-z]+:)?text-(?:sm|base|lg|xl|2xl|3xl|4xl|5xl)(?![\w-])/g;

describe("T4a: the paper type scale, named once", () => {
  it("app/globals.css defines the six roles at the painted sizes of DESIGN.md", () => {
    for (const [cls, px] of Object.entries(SCALE)) {
      const token = cls.replace("text-", "--text-");
      const m = new RegExp(`${token}:\\s*([0-9.]+)px;`).exec(css);
      expect(m, token).not.toBeNull();
      expect(Number(m![1]), token).toBe(px);
      expect(css, `${token}--line-height`).toMatch(new RegExp(`${token}--line-height:\\s*[0-9.]+;`));
    }
  });

  it("DESIGN.md's type table names each role's class, with the same painted size", () => {
    for (const [cls, px] of Object.entries(SCALE)) {
      const row = design.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${cls}\``));
      expect(row, cls).toBeDefined();
      expect(row!.replace(/\s/g, ""), cls).toContain(`|${px}px|`);
    }
  });

  it("the page and section titles take the page and section sizes by default", () => {
    expect(css).toMatch(/\.page-title\s*\{[^}]*@apply text-page;/);
    expect(css).toMatch(/\.section-title\s*\{[^}]*@apply text-section;/);
  });

  it("the page header paints the page size", () => {
    expect(read("components/ui/PageHeader.tsx")).toMatch(/className="page-title text-page\b/);
  });
});

describe("T4a: the kit paints nothing under the floor", () => {
  it("there are kit files to scan", () => {
    expect(kitFiles.length).toBeGreaterThan(30);
  });

  it("no arbitrary font size and no text-xs in a kit component (outside the allowlist)", () => {
    const offenders: string[] = [];
    for (const f of kitFiles.filter((f) => f.endsWith(".tsx") && !allowed(f))) {
      const src = read(`${KIT}/${f}`);
      for (const m of src.matchAll(ARBITRARY)) offenders.push(`${f}: ${m[0]}`);
      for (const m of src.matchAll(UNDER_FLOOR)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("a kit component names its size by role (no bare text-sm, text-base, text-xl…)", () => {
    const offenders: string[] = [];
    for (const f of kitFiles.filter((f) => f.endsWith(".tsx") && !allowed(f))) {
      for (const m of read(`${KIT}/${f}`).matchAll(BARE_SIZE)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no CSS module of the kit holds a font size under the floor (outside the allowlist)", () => {
    const offenders: string[] = [];
    for (const f of kitFiles.filter((f) => f.endsWith(".module.css") && !allowed(f))) {
      for (const m of read(`${KIT}/${f}`).matchAll(/font-size:\s*([0-9.]+)px/g)) {
        if (Number(m[1]) < FLOOR) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist only shrinks: every entry still names a kit file", () => {
    for (const k of Object.keys(KIT_ALLOWLIST)) {
      const exists = existsSync(join(process.cwd(), KIT, `${k}.tsx`)) || kitFiles.some((f) => f.startsWith(`${k}.`));
      expect(exists, k).toBe(true);
    }
  });
});

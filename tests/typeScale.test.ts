import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readSource as read, walkSource } from "./helpers/sourceTree";

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
  // CountBar, DotPlot and ScoreWithContext left with T4d: they are swept with
  // the results (SWEPT_AREAS below, CSS modules included).
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

// ── T4b onward: the area sweeps ─────────────────────────────────────────────
// Each sweep of T4 adds its areas to SWEPT_AREAS (one line each). In a swept
// area every size is a named role: no arbitrary size, no bare Tailwind size,
// nothing under the 11 px floor, and the uppercase label is the one recipe
// `.label-caps`. The allowlist may only SHRINK.

const SWEPT_AREAS: { area: string; paths: string[] }[] = [
  {
    area: "T4b: sessions + dashboard, arrival + onboarding, profile, the shell",
    paths: [
      "app/[locale]/app/page.tsx",
      "components/dashboard",
      "app/[locale]/app/sessions/page.tsx",
      "app/[locale]/app/sessions/SessionsTable.tsx",
      "app/[locale]/app/sessions/new",
      "app/[locale]/app/sessions/express",
      "app/[locale]/app/sessions/[id]/edit",
      "app/[locale]/app/sessions/[id]/invite",
      "app/[locale]/app/sessions/[id]/waiting",
      "app/[locale]/auth",
      "app/[locale]/join",
      "components/join",
      "components/auth",
      "components/guest",
      "components/onboarding",
      "app/[locale]/app/profile",
      "components/profile",
      "components/layout",
      "components/offline",
      "components/errors",
      "components/session",
      "components/DuplicateButton.tsx", // the sessions list's duplicate action (also on coffees and groups)
    ],
  },
  {
    area: "T4c: coffees, groups, Insights, the paper parts of the warm-up",
    paths: [
      "app/[locale]/app/coffees",
      "components/coffees",
      "app/[locale]/app/groups",
      "components/groups",
      "app/[locale]/app/insights",
      "components/insights",
      "app/[locale]/app/warmup/page.tsx", // the library (paper); the player and the stage are the stage mode
      "app/[locale]/app/warmup/[slug]", // the exercise page outside the player, and the reflections list
    ],
  },
  {
    // S8: the arrival shell and the mark. What sits on the dark ground (the bar,
    // the footer) is set in ArrivalStage.module.css from the same named tokens
    // (var(--text-caption)); the card's content is paper and is scanned as paper.
    area: "S8: the arrival stage and the wordmark",
    paths: ["components/arrival", "components/brand"],
  },
  {
    area: "T4d: the results route and its parts, CSS modules included",
    paths: [
      "app/[locale]/app/sessions/[id]/results",
      "components/results",
      "components/ui/CountBar.tsx",
      "components/ui/CountBar.module.css",
      "components/ui/DotPlot.tsx",
      "components/ui/DotPlot.module.css",
      "components/ui/ScoreWithContext.tsx",
      "components/ui/ScoreWithContext.module.css",
    ],
  },
];

/** A size outside the six roles that a swept file keeps, and why. May only shrink. */
const SWEPT_ALLOWLIST: Record<string, { token: string; reason: string }[]> = {
  "components/results/SampleDetail.tsx": [{ token: "text-[42px]", reason: "the coffee sheet's score, a display numeral" }],
  "components/dashboard/StatCard.tsx": [{ token: "text-4xl", reason: "a stat's numeral, a display size outside the six roles (31.5 px)" }],
  "app/[locale]/app/sessions/express/ExpressForm.tsx": [{ token: "text-4xl", reason: "the sample counter's numeral, a display size (31.5 px)" }],
  "components/onboarding/WelcomeModal.tsx": [{ token: "text-5xl", reason: "the welcome's coffee-cup emoji, used as a picture (42 px)" }],
  "components/coffees/CoffeeScoreBlock.tsx": [{ token: "text-4xl", reason: "the coffee's lifetime score, a display numeral (31.5 px)" }],
  "app/[locale]/app/warmup/page.tsx": [
    { token: "text-[28px]", reason: "an exercise's minutes on the library card, a display numeral" },
    { token: "md:text-[32px]", reason: "the same numeral from 768 px" },
  ],
};

const SIZE_ANY = /(?<![\w-])(?:[a-z-]+:)?text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|\[\d+(?:\.\d+)?(?:px|rem|em)\])(?![\w\]-])/g;
const HANDMADE_LABEL = /(?<![\w-])uppercase(?![\w-])/;

/**
 * A CSS module of a swept area names its sizes by the scale's variables
 * (`font-size: var(--text-caption)`); a pixel value stays only here, with its
 * reason. May only shrink.
 */
const SWEPT_CSS_PX: Record<string, { px: string; reason: string }[]> = {
  "components/results/SessionOverview.module.css": [
    { px: "31.5px", reason: "a tile's fact numeral, a display size" },
    { px: "72px", reason: "the overview's score numeral (phone), a display size" },
    { px: "46px", reason: "the score numeral's decimals (phone)" },
    { px: "88px", reason: "the overview's score numeral (from 768 px)" },
    { px: "56px", reason: "the score numeral's decimals (from 768 px)" },
  ],
  "components/results/RankStrip.module.css": [
    { px: "12px", reason: "the axis tick inside the drawing: CHART_TICK_PX (lib/chartText.ts)" },
    { px: "24px", reason: "a rank's score from 768 px, a display numeral" },
  ],
  "components/ui/DotPlot.module.css": [{ px: "12px", reason: "the axis tick inside the drawing: CHART_TICK_PX (lib/chartText.ts)" }],
  "components/ui/ScoreWithContext.module.css": [
    { px: "31.5px", reason: "the medium score numeral, a display size" },
    { px: "42px", reason: "the large score numeral, a display size" },
  ],
};

function sweptCss(): string[] {
  const out: string[] = [];
  for (const { paths } of SWEPT_AREAS) {
    for (const p of paths) {
      if (p.endsWith(".module.css")) out.push(p);
      else if (!/\.\w+$/.test(p)) out.push(...walkSource(p, `typescale-css-${p}`, { include: /\.module\.css$/ }));
    }
  }
  return [...new Set(out)];
}

function sweptFiles(): string[] {
  const out: string[] = [];
  for (const { paths } of SWEPT_AREAS) {
    for (const p of paths) {
      if (p.endsWith(".tsx")) out.push(p);
      else if (/\.\w+$/.test(p)) continue;
      else out.push(...walkSource(p, `typescale-${p}`, { include: /\.tsx$/ }));
    }
  }
  return [...new Set(out)];
}

describe("T4b: the swept areas paint only the named sizes", () => {
  const files = sweptFiles();

  it("every swept path exists, and there are files to scan", () => {
    for (const { paths } of SWEPT_AREAS) for (const p of paths) expect(existsSync(join(process.cwd(), p)), p).toBe(true);
    expect(files.length).toBeGreaterThan(40);
  });

  it("no bare or arbitrary size in a swept file (outside the allowlist)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const allowed = new Set((SWEPT_ALLOWLIST[f] ?? []).map((a) => a.token));
      for (const m of read(f).matchAll(SIZE_ANY)) if (!allowed.has(m[0])) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the uppercase label is the one recipe: no hand-written `uppercase` in a swept file", () => {
    const offenders = files.filter((f) => HANDMADE_LABEL.test(read(f).replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });

  it("app/globals.css holds the label recipe: the label size, 600, capitals, the widest tracking", () => {
    expect(css).toMatch(/\.label-caps\s*\{[^}]*@apply text-label;[^}]*font-weight:\s*600;[^}]*text-transform:\s*uppercase;[^}]*letter-spacing:\s*0\.1em;/);
  });

  it("a chart's text in a swept file is at least 12 px (Recharts sizes are props, not classes)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/fontSize(?::\s*|=\{)(\d+(?:\.\d+)?)/g)) {
        if (Number(m[1]) < 12) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    const sizes = read("lib/chartText.ts");
    expect(Number(/CHART_TICK_PX = ([\d.]+)/.exec(sizes)![1])).toBeGreaterThanOrEqual(12);
    expect(Number(/CHART_CAPTION_PX = ([\d.]+)/.exec(sizes)![1])).toBe(SCALE["text-caption"]);
    expect(sizes).toMatch(/CHART_HTML_PX = CHART_CAPTION_PX;/);
  });

  it("a swept CSS module names its font sizes by the scale's variables (outside its allowlist)", () => {
    const css = sweptCss();
    expect(css.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const f of css) {
      const allowed = new Set((SWEPT_CSS_PX[f] ?? []).map((a) => a.px));
      for (const m of read(f).matchAll(/font-size:\s*([^;]+);/g)) {
        const v = m[1].trim();
        if (/^var\(--text-(page|section|card|body|caption|label)\)$/.test(v)) continue;
        if (!allowed.has(v)) offenders.push(`${f}: ${v}`);
      }
    }
    expect(offenders).toEqual([]);
    const tick = Number(/CHART_TICK_PX = ([\d.]+)/.exec(read("lib/chartText.ts"))![1]);
    for (const f of ["components/results/RankStrip.module.css", "components/ui/DotPlot.module.css"]) {
      expect(read(f), f).toMatch(new RegExp(`\\.tickText\\s*\\{[^}]*font-size:\\s*${tick}px;`));
    }
    for (const [f, entries] of Object.entries(SWEPT_CSS_PX)) {
      for (const e of entries) expect(read(f), `${f} ${e.px}`).toContain(`font-size: ${e.px}`);
    }
  });

  it("the swept allowlist only shrinks: every entry still holds its token", () => {
    for (const [f, entries] of Object.entries(SWEPT_ALLOWLIST)) {
      const src = read(f);
      for (const e of entries) expect(src, `${f} ${e.token}`).toContain(e.token);
    }
  });
});

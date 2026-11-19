import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readSource as read } from "./helpers/sourceTree";

// Q2 (audit H-01, E-04): text is never painted in a flavour family's colour, the
// pairs the paper uses for text pass 4.5 : 1 computed from the tokens, and design
// values are tokens, not literals. Allowlists may only SHRINK.

const css = read("app/globals.css");

function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`no token --color-${name}`);
  return m[1];
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("H-01: text pairs from the tokens", () => {
  // The pairs this package's area paints text with (ink and its quiet tone on the
  // paper surfaces; the fills' "on" colours on the fills).
  const pairs: [string, string][] = [
    ["on-surface", "surface"],
    ["on-surface", "surface-container-lowest"],
    ["on-surface", "surface-container-high"],
    ["on-surface-variant", "surface"],
    ["on-surface-variant", "surface-container-lowest"],
    ["on-surface-variant", "surface-container-high"],
    ["on-primary", "primary-container"],
    ["on-error", "error"],
  ];
  it.each(pairs)("%s on %s is at least 4.5 : 1", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("H-01: a family's colour is a dot beside a word in ink", () => {
  it("the coffee page's flavour cloud: neutral pills, the colour as a dot, the count in ink", () => {
    const src = read("components/coffees/FlavorCloud.tsx");
    expect(src).not.toMatch(/text-white/);
    expect(src).not.toMatch(/style=\{\{\s*color:/);
    expect(src).toMatch(/rounded-full" style=\{\{ backgroundColor: d\.color \}\}/);
  });
  it("the dashboard's rank numerals are ink and tabular (B-06), not the muted green (1.7 : 1)", () => {
    const src = read("app/[locale]/app/page.tsx");
    expect(src).toMatch(/font-display text-section tabular-nums text-on-surface-variant w-6 text-center shrink-0/);
    expect(src).not.toMatch(/text-primary-muted w-6/);
  });
  it("B-06: the numbers left proportional after Q1 are tabular (dates, attribute values, counts, the level)", () => {
    expect(read("app/[locale]/app/page.tsx")).toMatch(/<span className="tabular-nums">\s*\{new Date\(s\.date\)\.toLocaleDateString\(locale\)\}/);
    expect(read("app/[locale]/app/coffees/[id]/page.tsx")).toMatch(/w-8 text-right text-caption font-semibold tabular-nums/);
    expect(read("components/groups/CoCupperCard.tsx")).toMatch(/font-semibold tabular-nums">\{cupper\.sessionCount\}/);
    expect(read("components/groups/CoCupperCard.tsx")).toMatch(/font-semibold tabular-nums">\{cupper\.evaluationCount\}/);
    expect(read("components/profile/LevelBadge.tsx")).toMatch(/text-caption font-bold tabular-nums shrink-0/);
  });
  it("the coffees list's process cell is a dot and an ink word (T5)", () => {
    expect(read("components/coffees/CoffeesTable.tsx")).toMatch(/rounded-full" style=\{\{ backgroundColor: processToneVar\(type\) \}\}/);
  });
  it("no text in the area takes a colour from data through `style={{ color }}`", () => {
    // A colour token (`var(--color-…)`) is ink by name and allowed; a colour from data is not.
    const offenders = files.filter((f) => f.endsWith(".tsx") && /style=\{\{\s*color:(?!\s*"var\(--color-)/.test(read(f)) && !COLOR_ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });
});

// ── E-04: the literal scan ──────────────────────────────────────────────────
// Out of the area, each with its reason: the stage (landing, arrival, journey,
// brand: the dark ground's own rules), the warm-up player and stage, the dev pages,
// the printed form (lib/pdf's pixels), the social image (its own pixel space).
const OUT = /components\/(landing|journey|arrival|brand|warmup|dev)\/|\/dev\/|\/print\/|opengraph-image|app\/\[locale\]\/page\.tsx/;
// The later package, by name: the cupping screen (P5b) and the kit modules only it uses.
// Their counts are pinned below and may only shrink. (The shell, `components/layout`, and
// the dashboard joined the scan once P4a merged.)
const LATER = /components\/cupping\/|\/cup\/|components\/ui\/(SessionShell|CanvasFooter|SampleTabs|ModuleSwitcher|AffectiveBubbles|IntensitySlider|CATAPills|CupToggleGrid|MasterControls|FormSection|Notes)\./;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`;
    if (name === "generated" || name === "node_modules") continue;
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(rel);
  }
  return out;
}
const all = [...walk("app"), ...walk("components")];
const files = all.filter((f) => !OUT.test(f) && !LATER.test(f) && f !== "app/globals.css");
const later = all.filter((f) => LATER.test(f));

const TSX: Record<string, RegExp> = {
  white: /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border)-white(?:\/\d+)?(?![\w-])/g,
  shadow: /(?<![\w-])(?:[a-z-]+:)*shadow-(?:md|lg|xl|2xl)(?![\w-])/g,
  radius: /rounded(?:-[a-z]+)?-\[\d+px\]/g,
  inline: /style=\{\{[^}]*?(?:#[0-9a-fA-F]{3,8}\b|\b(?:fontSize|borderRadius|boxShadow|padding|margin|gap)\s*:\s*['"]?\d)/g,
};
const CSS: Record<string, RegExp> = {
  boxShadow: /box-shadow:(?!\s*(?:var\(|none))[^;]+;/g,
  radius: /border-radius:\s*\d+px/g,
};
function hits(f: string): string[] {
  const src = read(f);
  const rules = f.endsWith(".css") ? CSS : TSX;
  return Object.entries(rules).flatMap(([k, r]) => [...src.matchAll(r)].map(() => k));
}

/** A literal the area keeps, and why. May only shrink. */
const ALLOWED: Record<string, { kind: string; n: number; reason: string }[]> = {
  "components/results/RankStrip.module.css": [{ kind: "radius", n: 1, reason: "the 2 px corners of a tie's mark, a mark's corner and not a component radius" }],
  "components/ui/Avatar.tsx": [{ kind: "inline", n: 1, reason: "the initials' size follows the avatar's size (size x 0.35); DESIGN.md does not size them yet" }],
};
/** Text coloured through `style={{ color }}` that stays, and why. May only shrink. */
const COLOR_ALLOWED = new Set<string>([]);

/** The later packages' remaining hits, by file. May only shrink (P5b: the cupping screen). */
const LATER_COUNTS: Record<string, number> = {
  "components/cupping/CloseSessionDialog.tsx": 1,
  "components/cupping/EditSampleMetadataForm.tsx": 1,
  "components/cupping/EvaluationGuardModal.tsx": 1,
  "components/cupping/ExtrinsicForm.tsx": 1,
  "components/cupping/FlavorPicker.tsx": 1,
  "components/cupping/PhaseStepper.tsx": 3,
  "components/cupping/PhysicalEvalForm.tsx": 1,
  "components/ui/AffectiveBubbles.module.css": 2,
  "components/ui/CATAPills.module.css": 1,
  "components/ui/FormSection.module.css": 2,
  "components/ui/IntensitySlider.module.css": 2,
  "components/ui/SessionShell.module.css": 1,
};

describe("E-04: design values are tokens, not literals", () => {
  it("there are files to scan", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("no literal in the area outside the allowlist", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const kinds = hits(f);
      const allowed = ALLOWED[f] ?? [];
      const left = [...kinds];
      for (const a of allowed) for (let i = 0; i < a.n; i++) { const j = left.indexOf(a.kind); if (j >= 0) left.splice(j, 1); }
      for (const k of left) offenders.push(`${f}: ${k}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist only shrinks: each entry still has its hits", () => {
    for (const [f, entries] of Object.entries(ALLOWED)) {
      const kinds = hits(f);
      for (const e of entries) expect(kinds.filter((k) => k === e.kind).length, `${f} ${e.kind}`).toBeGreaterThanOrEqual(e.n);
    }
  });

  it("the cupping screen's and the shell's hits are named and may only shrink", () => {
    const now: Record<string, number> = {};
    for (const f of later) { const n = hits(f).length; if (n) now[f] = n; }
    for (const [f, n] of Object.entries(now)) expect(n, f).toBeLessThanOrEqual(LATER_COUNTS[f] ?? 0);
  });
});

// E-02 / E-03 (package T3 of the 2026-11-15 audit): the app paints with role
// tokens. No legacy alias colour class (`text-brown-mid`, `bg-cream`, …) or
// alias variable (`var(--color-green-dark)`, …) and no legacy radius class
// (`rounded-md`, `rounded-lg`, `rounded-xl`: "Legacy: not for paper" in
// DESIGN.md) outside the folders listed in ALLOWLIST. The alias block of
// app/globals.css holds only what the allowlisted folders still read.
import { describe, expect, it } from "vitest";
import { readSource, walkSource, SCAN_TIMEOUT_MS } from "./helpers/sourceTree";

/**
 * Folders that may still use an alias, each with its reason. This list may
 * only ever SHRINK: a folder leaves it when its own package moves it to the
 * role tokens. Never add one.
 */
const ALLOWLIST: Record<string, string> = {
  "app/[locale]/app/sessions/[id]/results": "results route, being rebuilt by the results redesign (R packages)",
  "components/results": "results parts, being rebuilt by the results redesign (R packages)",
  "components/landing": "the landing's own stage rules and tests",
  "components/warmup": "the warm-up player's own stage rules and tests",
  "components/legal": "the legal pages paint exactly as published",
  "lib/pdf": "react-pdf documents: hex is sanctioned there (DESIGN.md)",
};

const ALIASES = [
  "green-dark", "green-mid", "green-light", "amber-warm", "amber", "bg", "cream",
  "brown-dark", "brown-mid", "brown-light", "red-defect", "background", "foreground",
];
const PROPS =
  "text|bg|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|to|via|outline|decoration|divide|placeholder|accent|caret|shadow|inset-shadow|drop-shadow";
const ALIAS_CLASS = new RegExp(
  `(?<![\\w\\-/\\[])(?:[\\w\\-\\[\\]&:>*@./]+:)?(?:${PROPS})-(?:${ALIASES.join("|")})(?![\\w\\-])`,
);
// `bg-white` is the one `white` class DESIGN.md lists as an old name
// (surface-container-lowest); `text-white` / `border-white` are Tailwind's own white.
const BG_WHITE = /(?<![\w\-/[])(?:[\w\-[\]&:>*@./]+:)?bg-white(?![\w-])/;
const ALIAS_VAR = new RegExp(`var\\(--color-(?:${[...ALIASES, "white"].join("|")})(?![\\w-])`);
const LEGACY_RADIUS = /(?<![\w-])(?:[\w-]+:)?rounded-(?:md|lg|xl)(?![\w-])/;

const SKIP_DIRS = new Set(["node_modules", ".next", "generated"]);
const allowed = (rel: string) => Object.keys(ALLOWLIST).some((d) => rel === d || rel.startsWith(`${d}/`));
const files = ["app", "components", "lib", "hooks"]
  .flatMap((d) => walkSource(d, "appTokens", { include: /\.(tsx?|css)$/, skip: (n, dir) => dir && SKIP_DIRS.has(n) }))
  .filter((f) => f !== "app/globals.css");

function offenders(re: RegExp): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (allowed(f)) continue;
    readSource(f).split("\n").forEach((line, i) => {
      const m = re.exec(line);
      if (m) out.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  return out;
}

describe("the app paints with role tokens (T3)", () => {
  it("no legacy alias colour class outside the allowlist", () => {
    expect(offenders(ALIAS_CLASS)).toEqual([]);
    expect(offenders(BG_WHITE)).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("no legacy alias variable outside the allowlist", () => {
    expect(offenders(ALIAS_VAR)).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("no legacy radius class (rounded-md / -lg / -xl) outside the allowlist", () => {
    expect(offenders(LEGACY_RADIUS)).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("every allowlisted folder exists (a moved folder is removed from the list, never kept)", () => {
    for (const d of Object.keys(ALLOWLIST)) {
      expect(walkSource(d, "appTokens-exists", { include: /\.(tsx?|css)$/ }).length, d).toBeGreaterThan(0);
    }
  }, SCAN_TIMEOUT_MS);
});

describe("app/globals.css: the alias block holds only what is still read", () => {
  const css = readSource("app/globals.css");
  it("green-mid lives on under its role name, primary-muted, with the same value", () => {
    expect(css).toMatch(/--color-primary-muted:\s*#6b8f71;/);
    expect(css).not.toMatch(/--color-green-mid\s*:/);
  });
  it("only --color-green-light remains of the aliases (the landing's hero still reads it)", () => {
    for (const a of ALIASES.filter((x) => x !== "green-light")) {
      expect(css, a).not.toMatch(new RegExp(`--color-${a}\\s*:`));
    }
    expect(css).not.toMatch(/--color-white\s*:/);
    expect(css).not.toMatch(/(^|[^-])--(background|foreground)\s*:/m);
  });
});

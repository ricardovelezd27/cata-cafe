import { describe, expect, it } from "vitest";
import { createShellLayerStore } from "@/lib/shellLayer";
import { scrollBehaviorFor } from "@/lib/motion";
import { SCAN_TIMEOUT_MS, readSource as read, walkSource } from "./helpers/sourceTree";

// Package T6 of the UI/UX audit of 2026-11-15 (H-03, H-04, H-06, H-07, G-01):
// the accessibility base of the paper app.

const css = read("app/globals.css");

/** Every .tsx / .ts / .css under a folder, as repo-relative paths. */
const walk = (dir: string) =>
  walkSource(dir, "a11yBase", {
    skip: (name, isDirectory) => isDirectory && (name === "generated" || name === "node_modules"),
    include: /\.(tsx|ts|css)$/,
  });
/** The paper app: everything but the landing and the warm-up player, which keep their own tested rules. */
const PAPER = [...walk("app"), ...walk("components")].filter(
  (f) => !f.startsWith("components/landing/") && !f.startsWith("components/warmup/") && f !== "app/[locale]/page.tsx",
);

describe("H-03: the shell layer store", () => {
  it("is covered while at least one layer is mounted, and released by each one", () => {
    const store = createShellLayerStore();
    expect(store.isCovered()).toBe(false);
    const a = store.cover();
    const b = store.cover();
    expect(store.isCovered()).toBe(true);
    a();
    expect(store.isCovered()).toBe(true);
    b();
    expect(store.isCovered()).toBe(false);
  });

  it("a release is idempotent: a double cleanup cannot uncover another layer", () => {
    const store = createShellLayerStore();
    const a = store.cover();
    const b = store.cover();
    a();
    a();
    expect(store.isCovered()).toBe(true);
    b();
    expect(store.isCovered()).toBe(false);
  });

  it("notifies subscribers only when the covered state changes", () => {
    const store = createShellLayerStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const a = store.cover(); // false -> true
    const b = store.cover(); // still true
    b(); // still true
    a(); // true -> false
    expect(calls).toBe(2);
    off();
    store.cover();
    expect(calls).toBe(2);
  });

  it("the cupping layer registers itself and every part of the shell under it reads the store", () => {
    expect(read("components/ui/SessionShell.tsx")).toMatch(/useCoverShell\(\)/);
    for (const f of [
      "components/layout/Sidebar.tsx",
      "components/layout/TopBar.tsx",
      "components/layout/BottomNav.tsx",
      "components/layout/ShellCoverable.tsx",
      "components/layout/SkipLink.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/useShellCovered\(\)/);
      expect(src, f).toMatch(/inert=\{covered\}/);
    }
    // The layout puts the notices inside ShellCoverable, and `<main>` (which
    // holds the cupping layer itself) is never wrapped in it.
    const layout = read("app/[locale]/app/layout.tsx");
    const inside = layout.slice(layout.indexOf("<ShellCoverable>"), layout.indexOf("</ShellCoverable>"));
    expect(inside).toMatch(/<PendingDraftsBadge/);
    expect(inside).toMatch(/<StaleBundleNotice/);
    expect(inside).toMatch(/<IdentityWatcher/);
    expect(inside).not.toMatch(/<main/);
  });
});

describe("H-04: one focus indicator", () => {
  it("is written once, in the base layer: a 2 px primary-container outline, 2 px away", () => {
    const base = css.slice(css.indexOf("@layer base {"));
    expect(base).toMatch(
      /:focus-visible[^{]*\{\s*outline: 2px solid var\(--color-primary-container\);\s*outline-offset: 2px;/,
    );
  });

  it("no control of the paper app turns it off", () => {
    const offenders: string[] = [];
    for (const f of PAPER.filter((p) => p.endsWith(".tsx"))) {
      const src = read(f);
      // `outline-none` alone stays legal on a tabIndex={-1} heading or panel (a
      // programmatic focus target, not a control); the focus: forms never are.
      if (/(?<![\w-])focus(-visible)?:outline-none\b/.test(src)) offenders.push(`${f}: focus:outline-none`);
      if (/(?<![\w-])focus:ring-/.test(src)) offenders.push(`${f}: focus:ring-*`);
    }
    for (const f of PAPER.filter((p) => p.endsWith(".module.css"))) {
      const src = read(f);
      // A rule that removes the outline of a focused control (`:focus` or
      // `:focus-visible`) defeats the base rule. Dialog panels set it on the
      // panel itself, which is not a control.
      for (const m of src.matchAll(/([^{}]*:focus[^{}]*)\{([^}]*)\}/g)) {
        if (/outline:\s*(none|0)\b/.test(m[2])) offenders.push(`${f}: ${m[1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS); // reads every file of the paper app: a full run slows that about tenfold

  it("the intensity slider draws the indicator on what is seen, the thumb", () => {
    expect(read("components/ui/IntensitySlider.module.css")).toMatch(
      /\.track:has\(\.input:focus-visible\) \.thumb \{ outline: 2px solid var\(--color-primary-container\); outline-offset: 2px; \}/,
    );
  });
});

describe("H-06: the shell's landmarks", () => {
  it("has a skip link as the first child of the shell, and labelled navigations with aria-current", () => {
    const layout = read("app/[locale]/app/layout.tsx");
    const shell = layout.slice(layout.indexOf('<div className="flex h-screen overflow-hidden">'));
    expect(shell.indexOf("<SkipLink")).toBeGreaterThan(0);
    expect(shell.indexOf("<SkipLink")).toBeLessThan(shell.indexOf("<Sidebar"));
    expect(layout).toMatch(/<main\s+id=\{MAIN_CONTENT_ID\}/);
    for (const f of ["components/layout/Sidebar.tsx", "components/layout/BottomNav.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/aria-label=\{translations\.nav\.mainNavLabel\}/);
      expect(src, f).toMatch(/aria-current=\{active \? "page" : undefined\}/);
    }
  });

  it("the skip link is not hidden by the unlayered .sr-only (its own class, shown on focus)", () => {
    expect(read("components/layout/SkipLink.tsx")).toMatch(/className="skip-link"/);
    expect(css).toMatch(/\.skip-link:focus \{\s*transform: none;/);
  });

  it("its strings exist in both languages", () => {
    for (const loc of ["es", "en"]) {
      const nav = JSON.parse(read(`messages/${loc}.json`)).nav;
      expect(typeof nav.skipToContent, loc).toBe("string");
      expect(typeof nav.mainNavLabel, loc).toBe("string");
    }
    expect(JSON.parse(read("messages/es.json")).nav.skipToContent).toBe("Saltar al contenido");
  });
});

describe("G-01: reduced motion", () => {
  it("scripted scrolling jumps instead of gliding when reduced motion is asked for", () => {
    expect(scrollBehaviorFor(true)).toBe("auto");
    expect(scrollBehaviorFor(false)).toBe("smooth");
  });

  it("no scripted smooth scroll of the paper app hard-codes 'smooth'", () => {
    const offenders = PAPER.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).filter((f) =>
      /behavior:\s*["']smooth["']/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS); // same files as above (from memory when that test ran first)

  it("one reset covers the paper app and leaves the landing and the warm-up player out", () => {
    const at = css.indexOf("/* G-01");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", at));
    expect(block).toMatch(/animation-duration: 0\.01ms !important;/);
    expect(block).toMatch(/transition-duration: 0\.01ms !important;/);
    expect(block).toMatch(/:root:not\(:has\(\.stage-ground\)\)/);
    expect(block).toMatch(/:not\(section\[data-mode\]\[data-phase\], section\[data-mode\]\[data-phase\] \*\)/);
    // The warm-up player still is that section (its own reduced-motion rules apply there).
    const player = read("components/warmup/WarmupPlayer.tsx");
    expect(player).toMatch(/<section[\s\S]{0,400}data-phase=\{phase\}[\s\S]{0,200}data-mode=\{mode\}/);
    // and the landing still paints .stage-ground
    expect(read("app/[locale]/page.tsx")).toMatch(/stage-ground/);
  });

  it("the results page draws no animated chart: its radar is gone and nothing there uses Recharts", () => {
    // The radar (the one Recharts drawing of the results page, which had to follow
    // the OS setting) went with package R2: the cards and the wheel are plain SVG.
    const rule = { include: /\.tsx?$/ };
    const sources = walkSource("components/results", "a11yBase:results", rule).concat(
      walkSource("app/[locale]/app/sessions/[id]/results", "a11yBase:results", rule),
    );
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.filter((f) => /from "recharts"/.test(read(f)))).toEqual([]);
  });
});

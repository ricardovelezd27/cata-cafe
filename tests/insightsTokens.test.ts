import { describe, expect, it } from "vitest";
import { readSource as read, walkSource } from "./helpers/sourceTree";
import { SERIES_TOKENS } from "@/components/results/chartColors";

// S10 (finding E-01 of the 2026-11-15 audit, the Insights part): Insights
// paints with role tokens. Its charts take their colours from the shared
// getChartColors() (components/results/chartColors.ts, the one sanctioned
// hex snapshot for Recharts), never from a private palette, and the error red
// is never a series colour.

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const files = [
  ...walkSource("components/insights", "insights", { include: /\.(tsx?|css)$/ }),
  ...walkSource("app/[locale]/app/insights", "insights-routes", { include: /\.(tsx?|css)$/ }),
];

/** Token values as app/globals.css writes them (`--color-x: #abcdef;`). */
function tokenValues(): Map<string, string> {
  const css = read("app/globals.css");
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].toLowerCase());
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function mix(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${ca.map((x, k) => Math.round(x + (cb[k] - x) * t).toString(16).padStart(2, "0")).join("")}`;
}

describe("S10: Insights paints with role tokens", () => {
  it("there are Insights files to scan", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("no hex literal in components/insights/** or app/[locale]/app/insights/**", () => {
    const offenders: string[] = [];
    for (const f of files) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (HEX.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
          HEX.lastIndex = 0;
        });
    }
    expect(offenders).toEqual([]);
  });

  it("no white or black by name either: text on a filled control is its on- token", () => {
    const offenders = files.filter((f) => /\b(text|bg|border)-(white|black)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("every chart takes its colours from getChartColors(), with no palette of its own", () => {
    for (const f of [
      "components/insights/InsightChart.tsx",
      "components/insights/PivotChart.tsx",
      "components/insights/TrendChart.tsx",
      "components/insights/OriginContextPanel.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("getChartColors()");
      expect(src, f).not.toMatch(/const (PALETTE|GREEN|AMBER|GRID|AXIS_TEXT)\b/);
    }
  });
});

describe("S10: the shared chart colours", () => {
  const tokens = tokenValues();
  const src = read("components/results/chartColors.ts");

  it("the series are tokens, never the error red, each with a fallback equal to its token", () => {
    expect(SERIES_TOKENS).not.toContain("--color-error");
    expect(SERIES_TOKENS.every((t) => !t.includes("error"))).toBe(true);
    const fallback = /series:\s*\[([\s\S]*?)\]/.exec(src.slice(src.indexOf("const FALLBACK")))![1];
    const hexes = [...fallback.matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(hexes).toHaveLength(SERIES_TOKENS.length);
    SERIES_TOKENS.forEach((t, i) => expect(hexes[i], t).toBe(tokens.get(t)));
  });

  it("every series colour keeps 3 : 1 against the chart's ground (a drawn shape)", () => {
    for (const t of SERIES_TOKENS) {
      const v = tokens.get(t)!;
      expect(contrast(v, tokens.get("--color-surface-container-lowest")!), t).toBeGreaterThanOrEqual(3);
      expect(contrast(v, tokens.get("--color-surface")!), t).toBeGreaterThanOrEqual(3);
    }
  });

  it("the axis text keeps 4.5 : 1 (it is text)", () => {
    expect(contrast(tokens.get("--color-on-surface-variant")!, tokens.get("--color-surface-container-lowest")!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("S10: the pivot heatmap keeps its numbers readable", () => {
  const src = read("components/insights/PivotTable.tsx");
  const tokens = tokenValues();

  it("blends the two tokens up to HEAT_MAX and keeps the text ink, which stays at 4.5 : 1 or more at the darkest cell", () => {
    const max = Number(/const HEAT_MAX = ([0-9.]+);/.exec(src)![1]);
    expect(src).toContain("var(--color-primary-container)");
    expect(src).toContain("var(--color-surface-container-lowest)");
    const darkest = mix(tokens.get("--color-surface-container-lowest")!, tokens.get("--color-primary-container")!, max);
    expect(contrast(tokens.get("--color-on-surface")!, darkest)).toBeGreaterThanOrEqual(4.5);
    // No white text on a mid tone any more.
    expect(src).not.toMatch(/color:\s*t > /);
  });
});

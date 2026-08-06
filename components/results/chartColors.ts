/**
 * SANCTIONED EXCEPTION to the "no hex literals in components" rule
 * (see DESIGN.md / CLAUDE.md). Recharts renders raw SVG — `stroke`/`fill`
 * props take literal color strings, not Tailwind classes — so this file
 * mirrors the flavor-family data-color exception in `lib/constants.ts`.
 *
 * Client-side, `getChartColors()` reads the LIVE CSS custom properties off
 * `document.documentElement`, so it automatically tracks whatever
 * `app/globals.css` currently defines (including the dark-theme overrides)
 * without a rebuild. During SSR (or before the DOM is available) it falls
 * back to the hexes below, which are a snapshot of the `app/globals.css`
 * token values documented in DESIGN.md.
 *
 * IMPORTANT: if the underlying tokens in `app/globals.css` change, update
 * the FALLBACK values below to match — they must never drift from the
 * source of truth.
 */

export type ChartColors = {
  mine: string;
  community: string;
  grid: string;
  axisText: string;
};

// Snapshot of app/globals.css token values (see DESIGN.md "MD3 Color Roles").
const FALLBACK: ChartColors = {
  mine: "#2c4c3b", // --color-primary-container
  community: "#9d4326", // --color-secondary
  grid: "#c1c8c2", // --color-outline-variant
  axisText: "#424843", // --color-on-surface-variant
};

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Live MD3 token values as literal color strings, for Recharts SVG
 * internals only (strokes/fills that can't take a Tailwind class). Never
 * import this pattern into ordinary HTML-side styling — use the token
 * classes there instead.
 */
export function getChartColors(): ChartColors {
  return {
    mine: readToken("--color-primary-container", FALLBACK.mine),
    community: readToken("--color-secondary", FALLBACK.community),
    grid: readToken("--color-outline-variant", FALLBACK.grid),
    axisText: readToken("--color-on-surface-variant", FALLBACK.axisText),
  };
}

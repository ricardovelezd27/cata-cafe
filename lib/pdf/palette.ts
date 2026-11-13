// Single colour source for the PDF chart primitives. Hex literals are
// sanctioned INSIDE lib/pdf only (react-pdf draws raw PDF colours; there is no
// CSS-variable layer). Keep in sync with app/globals.css / DESIGN.md and with
// the SSR fallbacks in components/results/chartColors.ts.

export const PDF_PALETTE = {
  // Mirrors components/results/chartColors.ts FALLBACK.
  mine: "#2c4c3b", // --color-primary-container
  community: "#9d4326", // --color-secondary
  grid: "#c1c8c2", // --color-outline-variant
  axisText: "#424843", // --color-on-surface-variant
  // Third polygon (the reference sample overlay): neutral grey so it never
  // competes with mine/community.
  reference: "#727973", // --color-outline
  // Document ink (pre-existing charts.tsx values, report-sheet specific).
  ink: "#111111",
  soft: "#555555",
  hair: "#d9d3c4",
  brandGreen: "#3D5A3E",
  // Deviation / delta tones (S10 WP3a: a score is never coloured by QUALITY any
  // more; PdfScorePill is neutral). Used by the owner-matrix distance pills
  // (cupperStats bandFor) and the delta chips only. Amber is NOT the
  // --color-warning token.
  band: {
    green: "#2c4c3b", // --color-primary-container
    amber: "#9d4326", // --color-secondary (terracotta)
    red: "#ba1a1a", // --color-error
    neutral: "#727973", // --color-outline
  },
  paper: "#f6f3ec", // warm paper wash for cards / KPI tiles
  white: "#ffffff",
} as const;

export type ScoreBand = keyof typeof PDF_PALETTE.band;

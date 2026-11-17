// Single colour source for the PDF chart primitives. Hex literals are
// sanctioned INSIDE lib/pdf only (react-pdf draws raw PDF colours; there is no
// CSS-variable layer). Keep in sync with app/globals.css / DESIGN.md and with
// the SSR fallbacks in components/results/chartColors.ts.

import { L1_GROUP_COLOR } from "../constants";

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

// ── The nine flavour families (package R5a) ──────────────────────────────────
// The ONE place the PDF drawings take a family's colour from: `PdfFlavorWheel`,
// `PdfFlavorCompare` and `PdfCountedList` (lib/pdf/charts.tsx) default to this
// map and accept another through their `colors` prop.
//
// It is DERIVED from `L1_GROUP_COLOR` (lib/constants.ts), the colours today's
// picker and results paint, instead of being a second copy in hex: unlike the
// chart tokens above (read from CSS at run time, so they need a snapshot here),
// the family colours are a TypeScript constant and can be imported. When the
// family palette is retuned (package RP) the PDF follows with no edit here; if
// print ever needs its own values, replace the right-hand sides in this block.
// A count is never told by colour alone: every drawing prints the number.

export const PDF_FLAVOR_FAMILY_COLORS = {
  floral: L1_GROUP_COLOR.floral,
  fruity: L1_GROUP_COLOR.fruity,
  sour_fermented: L1_GROUP_COLOR.sour_fermented,
  green_veg: L1_GROUP_COLOR.green_veg,
  other: L1_GROUP_COLOR.other,
  roasted: L1_GROUP_COLOR.roasted,
  spice: L1_GROUP_COLOR.spice,
  nutty_cocoa: L1_GROUP_COLOR.nutty_cocoa,
  sweet: L1_GROUP_COLOR.sweet,
} as const;

/** A colour per flavour family id (the nine of `WHEEL_FAMILY_ORDER`). */
export type PdfFlavorFamilyColors = Record<keyof typeof PDF_FLAVOR_FAMILY_COLORS, string>;

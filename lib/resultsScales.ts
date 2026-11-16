// Pure scales and layouts for the results page's small drawings (package R1a of
// docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 2, 3 and 0):
// the ranking strip on the fixed 58 to 100 scale, the single tie bar, the dot
// plot (quality 1 to 9, intensities 0 to 15) and the counted bars.
//
// Numbers in, numbers out. No React, no DOM, no colour, no text: a position is
// a percentage of the track (0..100, two decimals), so a page (`left: 50%`) and
// a PDF (`x = width * pct / 100`) draw the same thing from the same call.
// Same split as lib/pdf/chartMath.ts next to lib/pdf/charts.tsx.
//
// A score is a number only: nothing here names or colours a score by quality.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import {
  RANKING_POLICY,
  hasNoClearGap,
  sampleSdFromPopulation,
  type RankPolicy,
} from "@/lib/reports/ranking";

/** Two decimals, and never "-0" (the PDF and the page must print the same). */
export function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Position of `value` on a [min, max] track, as a percentage clamped to 0..100. */
export function scalePct(value: number, min: number, max: number): number {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(value)) return 0;
  return round2(Math.min(100, Math.max(0, ((value - min) / span) * 100)));
}

// ── The score scale (choice 8: fixed, 58 to 100) ─────────────────────────────

/** 58 = every attribute at 1, 79 = every attribute at 5 (the neutral point),
 *  100 = every attribute at 9. tests/resultsScales.test.ts derives the three
 *  numbers from lib/scoring.ts so the scale can never drift from the formula. */
export const SCORE_SCALE = { min: 58, neutral: 79, max: 100 } as const;

/** Where a score sits on the 58 to 100 track. A score under 58 (deductions)
 *  sits at the left edge; the caller prints its number, as for every row. */
export function scorePct(score: number): number {
  return scalePct(score, SCORE_SCALE.min, SCORE_SCALE.max);
}

/** True when the score is outside the track and was drawn at an edge. */
export function isOffScoreScale(score: number): boolean {
  return score < SCORE_SCALE.min || score > SCORE_SCALE.max;
}

export type AxisTick = { value: number; pct: number };

/** The three numbers printed over the ranking: 58 at 0 %, 79 at 50 %, 100 at 100 %. */
export function scoreAxis(): AxisTick[] {
  return [SCORE_SCALE.min, SCORE_SCALE.neutral, SCORE_SCALE.max].map((value) => ({
    value,
    pct: scorePct(value),
  }));
}

// ── The ranking strip (one row per coffee) ───────────────────────────────────

export type RankStripInput = {
  /** The group's score (the filled dot); null in a solo session or while group results are hidden. */
  group: number | null;
  /** The spread printed as "±" beside the group's score; null when it is not shown. */
  spread: number | null;
  /** The viewer's own score (the ring); null when they have none to show. */
  mine: number | null;
  /** The score of the reference the page compares against (the dashed line); null without one. */
  reference?: number | null;
};

export type RankStripRow = {
  /** The neutral point, 79: always drawn. */
  neutral: number;
  reference: number | null;
  group: number | null;
  mine: number | null;
  /** group - spread .. group + spread, cut at the ends of the track. */
  whisker: { from: number; to: number; cutLow: boolean; cutHigh: boolean } | null;
  /** A mark drawn at an edge because its score is outside 58..100. */
  offScale: { group: boolean; mine: boolean; reference: boolean };
};

/** Positions of everything one ranking row draws. The whisker needs a group
 *  score and a positive spread; the caller has already applied the "fewer than
 *  three cuppers: no spread" rule (lib/scoreContext.ts, `rankFor`). */
export function rankStripRow(input: RankStripInput): RankStripRow {
  const group = isNum(input.group) ? input.group : null;
  const mine = isNum(input.mine) ? input.mine : null;
  const reference = isNum(input.reference) ? input.reference : null;
  const spread = isNum(input.spread) && input.spread > 0 ? input.spread : null;
  const whisker =
    group !== null && spread !== null
      ? {
          from: scorePct(group - spread),
          to: scorePct(group + spread),
          cutLow: group - spread < SCORE_SCALE.min,
          cutHigh: group + spread > SCORE_SCALE.max,
        }
      : null;
  return {
    neutral: scorePct(SCORE_SCALE.neutral),
    reference: reference === null ? null : scorePct(reference),
    group: group === null ? null : scorePct(group),
    mine: mine === null ? null : scorePct(mine),
    whisker,
    offScale: {
      group: group !== null && isOffScoreScale(group),
      mine: mine !== null && isOffScoreScale(mine),
      reference: reference !== null && isOffScoreScale(reference),
    },
  };
}

// ── The single tie bar (choice 7) ────────────────────────────────────────────

/** What the tie rule reads of one ranked row: `RankedEntry` satisfies it. */
export type TieEntry = { score: number | null; sd: number | null; n: number | null };

/**
 * For the ranked rows in order: `true` at i when row i and row i + 1 have no
 * clear difference between THEM. It is THE tie rule of lib/reports/ranking.ts
 * (`hasNoClearGap` over the larger of the two sample SDs), asked per pair, so a
 * row's `noClearGap` flag there equals "tied with the row above or the row
 * below" here (tested against `rankSamples`). Unscored rows never tie.
 */
export function tiesWithNext(
  entries: readonly TieEntry[],
  policy: RankPolicy = RANKING_POLICY,
): boolean[] {
  return entries.map((entry, i) => {
    const next = entries[i + 1];
    if (!next || entry.score === null || next.score === null) return false;
    const a = sampleSdFromPopulation(entry.sd, entry.n);
    const b = sampleSdFromPopulation(next.sd, next.n);
    const spread = a === null ? b : b === null ? a : Math.max(a, b);
    return hasNoClearGap(Math.abs(entry.score - next.score), spread, policy);
  });
}

export type TieBar = { from: number; to: number };

/**
 * The bars drawn beside the ranking: one bar per unbroken run of tied
 * neighbours, from the first row of the run to the last (both inclusive).
 * A bar says "each row on it has no clear difference with the row next to it";
 * it does not say the first and the last row of a long bar are tied.
 */
export function tieBars(
  entries: readonly TieEntry[],
  policy: RankPolicy = RANKING_POLICY,
): TieBar[] {
  const ties = tiesWithNext(entries, policy);
  const bars: TieBar[] = [];
  let from: number | null = null;
  ties.forEach((tied, i) => {
    if (tied && from === null) from = i;
    if (!tied && from !== null) {
      bars.push({ from, to: i });
      from = null;
    }
  });
  return bars;
}

// ── The dot plot (the sheet: "tú y el grupo") ────────────────────────────────

export type DotScale = { min: number; max: number; ticks: readonly number[] };

/** Quality, attribute by attribute: one fixed 1 to 9 scale for every coffee. */
export const QUALITY_SCALE: DotScale = { min: 1, max: 9, ticks: [1, 3, 5, 7, 9] };
/** Intensities: one fixed 0 to 15 scale. */
export const INTENSITY_SCALE: DotScale = { min: 0, max: 15, ticks: [0, 5, 10, 15] };

export function dotPlotAxis(scale: DotScale): AxisTick[] {
  return scale.ticks.map((value) => ({ value, pct: scalePct(value, scale.min, scale.max) }));
}

export type DotPlotRow = {
  /** The viewer's value (the ring), as a position; null when they have none. */
  mine: number | null;
  /** The group's value (the filled dot); null when it is absent or not shown. */
  group: number | null;
};

/** One row of the dot plot. Whether the group's value may be shown at all is
 *  decided before this call (`panelGates` in lib/scoreContext.ts): pass null. */
export function dotPlotRow(
  scale: DotScale,
  values: { mine: number | null | undefined; group: number | null | undefined },
): DotPlotRow {
  return {
    mine: isNum(values.mine) ? scalePct(values.mine, scale.min, scale.max) : null,
    group: isNum(values.group) ? scalePct(values.group, scale.min, scale.max) : null,
  };
}

// ── Counted bars ("6 de 7") ──────────────────────────────────────────────────

export type CountBar = {
  /** People, cut to 0..n. */
  count: number;
  n: number;
  /** count / n, 0 when n is 0. */
  share: number;
  /** The bar's length as a percentage of its track, two decimals. */
  pct: number;
};

/** A bar as long as the share of people: `count` of `n`. */
export function countBar(count: number, n: number): CountBar {
  const total = isNum(n) && n > 0 ? n : 0;
  const c = isNum(count) ? Math.min(total, Math.max(0, count)) : 0;
  const share = total > 0 ? c / total : 0;
  return { count: c, n: total, share, pct: round2(share * 100) };
}

/**
 * Counted bars in the order they are listed: most people first, equal counts in
 * the order given (so the caller's own order, e.g. the flavour wheel's, breaks
 * ties and the list never reshuffles between renders). Items with nobody are
 * dropped; `top` keeps the first few.
 */
export function countBars<T extends { count: number }>(
  items: readonly T[],
  n: number,
  top?: number,
): (T & { bar: CountBar })[] {
  const rows = items
    .map((item, order) => ({ item, order, bar: countBar(item.count, n) }))
    .filter((r) => r.bar.count > 0)
    .sort((a, b) => b.bar.count - a.bar.count || a.order - b.order)
    .map((r) => ({ ...r.item, bar: r.bar }));
  return typeof top === "number" && top >= 0 ? rows.slice(0, top) : rows;
}

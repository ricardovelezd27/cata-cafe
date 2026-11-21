// The organizer's Panel (package R5 of docs/audits/app-ui-ux-2026-11-15/
// RESULTS-DESIGN.md, sections 4 and 11): the model of what it shows.
//
// Pure: no React, no database, no action. It ARRANGES values the results page
// already sends to the organizer (every cupper's evaluation, the late rows, the
// notes after the close, the alignment rows); it decides nothing about who may
// read them. Those gates stay where they are: the page builds `participants`,
// the late rows, the other cuppers' notes and the alignment rows only in the
// organizer's lens, so a participant's page holds none of them and every
// function here returns null or an empty model for it.
//
// The numbers are the ones the matrix has always shown: a cupper's total through
// `calcIndividualScore` under the evaluation's own rule, the row's mean and
// population SD over the INCLUDED cuppers (`rowStats`), and the distance band of
// a cell (`bandFor`: 1 SD, 2 SD). Nothing here is a new rule.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";
import { bandFor, rowStats } from "@/lib/reports/cupperStats";
import { RANKING_POLICY } from "@/lib/reports/ranking";
import type { ScoreRule } from "@/lib/scoreRule";
import { calcIndividualScore } from "@/lib/scoring";

/**
 * Which way the matrix is laid out from 768 px. ONE line to change.
 *   "cuppers": a row per cupper, a column per coffee (built default). A class
 *     of thirty is thirty rows; the coffees of a session rarely pass eight
 *     columns, so the table fits without a sideways scroll in most sessions.
 *   "coffees": a row per coffee, a column per cupper (the orientation the
 *     matrix had, and the one RESULTS-DESIGN.md describes: "a Grupo column").
 *     With eight cuppers or more it scrolls sideways at 768 px.
 * The group's score and the spread are the first two lines in both.
 * The choice is the owner's.
 */
export const PANEL_MATRIX_ROWS: "cuppers" | "coffees" = "cuppers";

/** What the matrix reads of one cupper's evaluation of one sample. */
export type PanelSample = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: { name: string } | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  isReference?: boolean;
  referenceRank?: number | null;
  /** "v1" for a stored evaluation scored before the 2026-11 rule (lib/scoreRule.ts). */
  scoreRule?: ScoreRule;
};

export type PanelParticipant = {
  id: string;
  name: string;
  excluded: boolean;
  samples: PanelSample[];
};

/**
 * How far a cell is from the mean of its coffee, among the included cuppers.
 * `none`: no total, an excluded cupper, fewer than three included totals, or no spread.
 * `within`: under 1 SD. `over1`: 1 SD or more. `over2`: 2 SD or more ("far from
 * the group", which is not an error).
 */
export type PanelDistance = "none" | "within" | "over1" | "over2";

export type PanelCell = {
  /** The cupper's total for this coffee; null without one. */
  value: number | null;
  /** A declared partial evaluation ("no evaluado" in some section): no total. */
  partial: boolean;
  distance: PanelDistance;
};

export type PanelCoffee = {
  id: string;
  label: string;
  /** The coffee's name once revealed. */
  name: string | null;
  isReference: boolean;
  referenceRank: number | null;
  /** The group's score as the page shows it on the coffee's card; null without one. */
  group: number | null;
  /** The spread of the included cuppers' totals; null with fewer than two. */
  sd: number | null;
  /** How many included totals the spread and the bands rest on. */
  count: number;
};

export type PanelMatrix = {
  /** False in a descriptive session: there are no totals, only who sent what. */
  scored: boolean;
  cuppers: { id: string; name: string; excluded: boolean }[];
  coffees: PanelCoffee[];
  /** `cells[coffee][cupper]`. */
  cells: PanelCell[][];
  /** How many references the session has (the badge numbers them from two). */
  references: number;
};

function moduleOf(sample: PanelSample, format: string): Record<string, unknown> {
  return format === "affective" ? sample.affective : format === "descriptive" ? sample.descriptive : sample.combined;
}

function hasData(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0,
  );
}

/** One cupper's total for one sample, or null when there is none to show. */
export function panelCellValue(sample: PanelSample, format: string, cupsPerSample: number): number | null {
  if (format === "descriptive") return null; // no total without quality ratings
  const data = moduleOf(sample, format);
  if (!hasData(data) || isAffectiveDeclaredPartial(data)) return null;
  const total = calcIndividualScore(data, cupsPerSample, { rule: sample.scoreRule });
  return typeof total === "number" ? total : null;
}

/**
 * Included totals from which a cell is said to be near or far. With two totals
 * each one sits exactly one SD from their mean, so a band would mark both and
 * say nothing; the page's own rule already shows no spread-based statement
 * under three included cuppers (`RANKING_POLICY.minN`). The spread itself is
 * still printed from two, as the matrix always did.
 */
export const PANEL_DISTANCE_MIN_N: number = RANKING_POLICY.minN;

const DISTANCE: Record<ReturnType<typeof bandFor>, PanelDistance> = {
  neutral: "none",
  green: "within",
  amber: "over1",
  red: "over2",
};

/**
 * The matrix. `isExcluded` is the caller's (it carries the organizer's
 * optimistic switch until the server confirms); `groupScores` is the score
 * each coffee's card shows, so the "Grupo" line can never disagree with it.
 * An excluded cupper keeps their totals, greyed by the drawing, and never has a
 * distance: they are not part of the mean they would be measured against.
 */
export function buildPanelMatrix(input: {
  participants: readonly PanelParticipant[];
  isExcluded?: (participant: PanelParticipant) => boolean;
  format: string;
  cupsPerSample: number;
  groupScores?: Readonly<Record<string, number | null | undefined>>;
}): PanelMatrix {
  const { participants, format, cupsPerSample } = input;
  const isExcluded = input.isExcluded ?? ((p: PanelParticipant) => p.excluded);
  const excluded = participants.map((p) => isExcluded(p));
  // every cupper's list is built over the session's samples, in the same order
  const axis = participants[0]?.samples ?? [];
  const cells: PanelCell[][] = [];
  const coffees: PanelCoffee[] = axis.map((sample, si) => {
    const values = participants.map((p) => {
      const own = p.samples[si];
      return own ? panelCellValue(own, format, cupsPerSample) : null;
    });
    const stats = rowStats(
      values,
      excluded.map((x) => !x),
    );
    cells.push(
      participants.map((p, pi) => {
        const own = p.samples[si];
        return {
          value: values[pi],
          partial: !!own && format !== "descriptive" && isAffectiveDeclaredPartial(moduleOf(own, format)),
          distance: excluded[pi] || stats.count < PANEL_DISTANCE_MIN_N ? "none" : DISTANCE[bandFor(values[pi], stats)],
        };
      }),
    );
    const group = input.groupScores?.[sample.id];
    return {
      id: sample.id,
      label: sample.label,
      name: sample.revealed && sample.coffee ? sample.coffee.name : null,
      isReference: sample.isReference === true,
      referenceRank: sample.referenceRank ?? null,
      group: typeof group === "number" ? group : null,
      sd: stats.count >= 2 ? stats.sd : null,
      count: stats.count,
    };
  });
  return {
    scored: format !== "descriptive",
    cuppers: participants.map((p, i) => ({ id: p.id, name: p.name, excluded: excluded[i] })),
    coffees,
    cells,
    references: coffees.filter((c) => c.isReference).length,
  };
}

/** How many cells carry each mark: what the legend needs to exist at all. */
export function panelMarks(matrix: PanelMatrix): { over1: number; over2: number } {
  let over1 = 0;
  let over2 = 0;
  for (const row of matrix.cells) {
    for (const cell of row) {
      if (cell.distance === "over1") over1 += 1;
      else if (cell.distance === "over2") over2 += 1;
    }
  }
  return { over1, over2 };
}

// ── What waits for the organizer ─────────────────────────────────────────────

export type PanelPending = {
  /** Late evaluations the organizer has not decided on. */
  late: number;
  /** Notes per coffee other cuppers added after the close (a tasting from before the reflection). */
  notes: number;
  /** Reflections about the tasting other cuppers wrote. */
  reflections: number;
};

/**
 * What the count on the "Por catador" tab adds up. Null when there is
 * nothing, and always null for a viewer whose page holds neither list (a
 * participant, a solo session): the rows exist only in the organizer's payload.
 */
export function panelPending(input: {
  lateRows: readonly unknown[] | null | undefined;
  notesByCupper: Readonly<Record<string, Readonly<Record<string, unknown>>>> | null | undefined;
  /** The other cuppers' reflections about the tasting (one per person). */
  reflectionsByCupper?: Readonly<Record<string, unknown>> | null;
}): PanelPending | null {
  const late = input.lateRows?.length ?? 0;
  const notes = input.notesByCupper
    ? Object.values(input.notesByCupper).reduce((sum, bySample) => sum + Object.keys(bySample).length, 0)
    : 0;
  const reflections = Object.keys(input.reflectionsByCupper ?? {}).length;
  return late + notes + reflections > 0 ? { late, notes, reflections } : null;
}

// ── Alignment: one neutral bar per cupper ────────────────────────────────────

export type AlignmentInput = {
  id: string;
  name: string;
  excluded: boolean;
  matches: number;
  opportunities: number;
  /** The same split per sample (it sums to the totals above). */
  bySample: Record<string, { matches: number; opportunities: number }>;
};

export type AlignmentBar = {
  id: string;
  name: string;
  excluded: boolean;
  matches: number;
  opportunities: number;
  /** 0 to 100, whole; null when the cupper had no descriptor to share. */
  percent: number | null;
};

/**
 * The alignment list for the whole cupping or for one coffee: of the
 * descriptors most of the panel chose, how many each cupper chose too. Included
 * cuppers first, by share; excluded ones last (they are outside the consensus
 * they are measured against). A share, never a grade: the drawing uses one
 * neutral bar for everyone.
 */
export function alignmentBars(rows: readonly AlignmentInput[], sampleId: string | null): AlignmentBar[] {
  const bars = rows.map((row): AlignmentBar => {
    const source = sampleId ? (row.bySample[sampleId] ?? { matches: 0, opportunities: 0 }) : row;
    return {
      id: row.id,
      name: row.name,
      excluded: row.excluded,
      matches: source.matches,
      opportunities: source.opportunities,
      percent: source.opportunities > 0 ? Math.round((source.matches / source.opportunities) * 100) : null,
    };
  });
  const share = (bar: AlignmentBar) => (bar.opportunities > 0 ? bar.matches / bar.opportunities : 0);
  return bars
    .map((bar, index) => ({ bar, index }))
    .sort((a, b) => {
      if (a.bar.excluded !== b.bar.excluded) return a.bar.excluded ? 1 : -1;
      return share(b.bar) - share(a.bar) || a.index - b.index;
    })
    .map(({ bar }) => bar);
}

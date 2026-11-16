// The data behind a coffee's flavour wheel and its counted list (package R1c of
// docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 3, 4, 6 and 6b):
// from the evaluations a page already loaded to the people-per-node counts that
// lib/flavorWheel.ts draws. Pure, like lib/reports/personalComparison.ts: no
// Prisma, no React, no i18n. Computed at read time; nothing is stored.
//
// WHO COUNTS — the rule of today's descriptor frequencies, unchanged
// (app/[locale]/app/sessions/[id]/results/page.tsx loads the session's
// evaluations with `isDraft: false` and hands them, with `excludedUserIds`, to
// `computeSampleBlockFrequencies` in lib/resultsAggregation.ts):
//   - a draft never counts;
//   - a cupper excluded from the results never counts;
//   - every other submitted evaluation counts, whatever it holds: there is no
//     completeness check there, so a declared partial evaluation ("no evaluado"
//     in a quality section) counts, and so does a cupper who picked no flavour
//     at all (they are part of n, as in `totalEvaluators`);
//   - a reference sample is counted like any other: the pin only rewrites the
//     quality ratings, its descriptors are the cuppers' own.
//   So n here is "submitted and not excluded". It can be larger than the "n de N
//   incluidos" beside a score, which counts COMPLETE evaluations only.
//
// WHICH IDS — the four flavour keys only (`FLAVOR_DESC_KEYS`: fragrance, aroma,
// flavour, aftertaste), the ones the form fills from the flavour wheel. The
// main tastes (`gustos`) and the acidity, sweetness and mouthfeel sets are other
// vocabularies and are never read: the main taste `sweet` shares its id with the
// flavour family `sweet`, and read together they would count a cupper who
// tasted "dulce" as one who found the Dulce family. The free words a cupper
// typed (`<key>_notes`, legacy `unmapped:` ids) are never returned.
//
// PRIVACY — the cupper key only serves to count a person once and never leaves
// this file. To a PARTICIPANT the counts are returned only from
// `FLAVOR_WHEEL_MIN_N` cuppers (lib/scoreContext.ts `panelGates`): with two, a
// count of 1 tells them what the other person picked. The owner's lens is not
// restricted, as with today's descriptor frequencies. This file decides nothing
// about who may see group results or whether a session is closed: the caller
// has already applied `viewerMayReadGroupResults` and passes `closed`.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { FLAVOR_DESC_KEYS, collectDescriptors } from "@/lib/descriptors";
import { countWheelPeople, type CompareSeries } from "@/lib/flavorWheel";
import { panelGates } from "@/lib/scoreContext";

/** The module keys that hold flavour-wheel node ids. Nothing else is read. */
export const WHEEL_ID_KEYS = FLAVOR_DESC_KEYS;

/** Flavour descriptors exist in the descriptive and combined formats only. */
export function formatHasWheel(format: string): boolean {
  return format === "descriptive" || format === "combined";
}

const isModule = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data);

/** The ids one cupper picked in the flavour keys of one module, deduped. They
 *  are raw stored ids: `countWheelPeople` migrates the retired ones and ignores
 *  whatever is not on the wheel. */
export function wheelIdsOf(data: unknown): string[] {
  return isModule(data) ? collectDescriptors(data, WHEEL_ID_KEYS) : [];
}

/** One evaluation of the sample, as the page already has it. */
export type WheelEvaluation = {
  /** Anything that tells two cuppers apart (the cupper id will do). It is used
   *  to count a person once and is never returned. */
  cupperKey: string;
  /** The cupper is excluded from the session's results. */
  excluded: boolean;
  /** The evaluation was sent (`isDraft === false`). */
  submitted: boolean;
  /** The format's module JSON (`descriptiveData` or `combinedData`). */
  data: unknown;
};

export type WheelCounts = {
  /** The cuppers the counts are "of". */
  n: number;
  /** People who picked exactly this wheel node (the counted list of descriptors). */
  direct: Record<string, number>;
  /** People who picked this node or anything under it (its L1 entries: the petals). */
  rollup: Record<string, number>;
  /** The wheel nodes the VIEWER picked, in the wheel's order (the "tú" marks of
   *  the counted list); null when no module of the viewer was passed. */
  mine: string[] | null;
};

export type WheelData =
  /** An affective session has no flavour descriptors: there is no wheel to draw. */
  | { status: "no_wheel"; reason: "affective_format" }
  /** Too few cuppers to show their counts to a participant. Nothing but the number. */
  | { status: "too_few"; included: number }
  | ({
      status: "ok";
      /** `group`: the panel's counts. `own`: only what the viewer marked. */
      scope: "group" | "own";
    } & WheelCounts);

const NO_WHEEL: WheelData = { status: "no_wheel", reason: "affective_format" };

/** The viewer's own picks as wheel node ids (migrated, on the wheel, in its order). */
function ownNodes(data: unknown): string[] {
  return Object.keys(countWheelPeople([wheelIdsOf(data)]).direct);
}

/**
 * The panel's wheel for ONE sample.
 *
 * `evaluations`: every evaluation of the sample the page loaded; the drafts and
 * the excluded cuppers are dropped HERE, so the caller cannot forget to.
 * `ownerLens`: the page's `ownerRead` (the organizer, or the read-only admin
 * lens). `viewerData`: the viewer's own module for this sample, when the "tú"
 * marks are wanted (it adds nothing to the counts).
 */
export function buildWheelData(input: {
  format: string;
  evaluations: readonly WheelEvaluation[];
  ownerLens: boolean;
  viewerData?: unknown;
}): WheelData {
  if (!formatHasWheel(input.format)) return NO_WHEEL;

  // One entry per person: two rows with the same key are one cupper.
  const byCupper = new Map<string, Set<string>>();
  for (const ev of input.evaluations) {
    if (ev.submitted !== true || ev.excluded !== false || !isModule(ev.data)) continue;
    let picks = byCupper.get(ev.cupperKey);
    if (!picks) byCupper.set(ev.cupperKey, (picks = new Set()));
    for (const id of wheelIdsOf(ev.data)) picks.add(id);
  }

  const included = byCupper.size;
  if (!input.ownerLens && !panelGates(included).flavorWheel) {
    return { status: "too_few", included };
  }
  const counts = countWheelPeople([...byCupper.values()].map((picks) => [...picks]));
  return {
    status: "ok",
    scope: "group",
    n: counts.n,
    direct: counts.direct,
    rollup: counts.rollup,
    mine: input.viewerData === undefined || input.viewerData === null ? null : ownNodes(input.viewerData),
  };
}

/**
 * What ONE person marked: a solo session, or a participant's own marks while
 * the group's results are not visible yet. No gate (it is their own data); the
 * caller chooses the row, as the page does today (in a solo session, the
 * owner's own evaluation, sent or not). n is 1, or 0 without a module.
 */
export function buildOwnWheelData(input: { format: string; data: unknown }): WheelData {
  if (!formatHasWheel(input.format)) return NO_WHEEL;
  const counts = countWheelPeople(isModule(input.data) ? [wheelIdsOf(input.data)] : []);
  return {
    status: "ok",
    scope: "own",
    n: counts.n,
    direct: counts.direct,
    rollup: counts.rollup,
    mine: Object.keys(counts.direct),
  };
}

// ── The comparison's input ───────────────────────────────────────────────────

/** A sample's wheel result, under the id the page uses for it (its sample id or
 *  its letter). The id is passed through to `compareGeometry`. */
export type WheelCompareSample = { id: string; wheel: WheelData };

export type WheelCompareInput =
  /** "The comparison should appear after the cupping": nothing while it is open. */
  | { status: "not_closed" }
  /** An affective session: there is nothing to compare. */
  | { status: "no_wheel"; reason: "affective_format" }
  /** The coffee whose petals were to be the base has no counts to show. */
  | { status: "base_unavailable"; reason: "too_few" | "no_wheel" | "missing" }
  | {
      status: "ok";
      /** The coffee that keeps its petals, when `baseId` was given. */
      base: CompareSeries | null;
      /** The territories, in the order the samples were given. */
      others: CompareSeries[];
      /** Samples left out because they have no counts to show. */
      skipped: { id: string; reason: "too_few" | "no_wheel" }[];
    };

/**
 * From the samples' wheel results to the `{ base, others }` that
 * `compareGeometry` (lib/flavorWheel.ts) takes. `closed` is the caller's word:
 * the comparison is refused while the session is not closed. With `baseId` the
 * comparison is drawn over that coffee's petals (its sheet); without it the
 * territories stand alone (the overview). How many are drawn is
 * `compareGeometry`'s limit, not decided here.
 */
export function wheelCompareInput(input: {
  closed: boolean;
  samples: readonly WheelCompareSample[];
  baseId?: string | null;
}): WheelCompareInput {
  if (input.closed !== true) return { status: "not_closed" };
  const { samples } = input;
  if (samples.length > 0 && samples.every((s) => s.wheel.status === "no_wheel")) {
    return { status: "no_wheel", reason: "affective_format" };
  }

  const baseId = input.baseId ?? null;
  let base: CompareSeries | null = null;
  const others: CompareSeries[] = [];
  const skipped: { id: string; reason: "too_few" | "no_wheel" }[] = [];
  let baseSeen = false;
  for (const s of samples) {
    const isBase = baseId !== null && s.id === baseId && !baseSeen;
    if (isBase) baseSeen = true;
    if (s.wheel.status !== "ok") {
      if (isBase) return { status: "base_unavailable", reason: s.wheel.status };
      skipped.push({ id: s.id, reason: s.wheel.status });
      continue;
    }
    const series: CompareSeries = { id: s.id, counts: s.wheel.rollup, n: s.wheel.n };
    if (isBase) base = series;
    else others.push(series);
  }
  if (baseId !== null && !baseSeen) return { status: "base_unavailable", reason: "missing" };
  return { status: "ok", base, others, skipped };
}

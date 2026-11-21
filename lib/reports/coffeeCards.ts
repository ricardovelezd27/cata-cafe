// One card per coffee, under the overview of a cupping's results (package R2,
// step 2, of docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 3:
// "A coffee's card"). The cards replace the table of 17 columns and the eight
// radars of the old "Resultados" tab.
//
// Pure: no React, no database, no colour, no word of the interface. It adds no
// rule of its own and reads no data the page did not already ship:
//   - the order, the places, the references and what is said beside a score are
//     `overviewView` (lib/reports/overview.ts), so a card can never disagree
//     with the tiles above it;
//   - the viewer's own values follow the page's own gates: a total only for a
//     SENT evaluation (`myScoreFor` -> `canShowMyScore`), ratings for a sent
//     row or a complete draft (`canShowMyRatings`);
//   - the group's value per quality attribute follows `panelGates`: from two
//     included cuppers (the owner's decision 6), never before the viewer may
//     read the group's results (`ctx.canViewGroup`, the page's one gate);
//   - the wheel's counts come from `OverviewData`, built on the server with
//     the wheel's own gate (a participant under three cuppers gets "too_few").
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { canShowMyRatings } from "@/lib/evaluationState";
import { countedDescriptors, type CompareSeries, type CountedNode } from "@/lib/flavorWheel";
import { overviewView, type OverviewData, type OverviewSample, type OverviewView } from "@/lib/reports/overview";
import type { RankContext } from "@/lib/reports/ranking";
import { wheelCompareInput } from "@/lib/reports/wheelData";
import { panelGates, type ScoreContext, scoreContext } from "@/lib/scoreContext";
import { myScoreFor } from "@/lib/reports/ranking";

/** What a card reads of a sample; the results route's `SampleResult` satisfies it. */
export type CardSample = OverviewSample & {
  aggregateScore:
    | (NonNullable<OverviewSample["aggregateScore"]> & {
        /** The group's average per quality attribute, keyed by the attribute's own label. */
        attrAverages?: Record<string, number>;
      })
    | null;
};

/** How many coffees one comparison draws (`compareGeometry`'s own limit); the page's default pick. */
export const MAX_COMPARED = 3;

/** One quality attribute (1 to 9): the viewer's value and the group's. */
export type QualityRow = { id: string; mine: number | null; group: number | null };

export type CardWheel =
  | {
      status: "ok";
      /** `group`: the panel's counts. `own`: only what the viewer marked. */
      scope: "group" | "own";
      /** People per wheel node (families): what the small wheel draws. */
      counts: Record<string, number>;
      n: number;
      /** The descriptors most people chose, three at most. */
      descriptors: CountedNode[];
      /** The wheel nodes the viewer chose (the "tú" marks). */
      mine: string[];
    }
  /** A participant under the wheel's minimum of cuppers. */
  | { status: "too_few" };

export type CoffeeCard<S> = {
  sample: S;
  /** Its place in the ranking; null for a reference, for a list that is not a
   *  ranking and in a descriptive session. */
  place: number | null;
  /** A reference: outside the ranking, the average and "first". */
  isReference: boolean;
  /** Everything said beside its score; null in a descriptive session. */
  context: ScoreContext | null;
  /** The viewer's OWN evaluation of this coffee. */
  state: "none" | "draft" | "submitted";
  /** The viewer declared a partial evaluation ("no evaluado" in some section). */
  partial: boolean;
  /** Null in an affective session, and when there is nothing to draw yet. */
  wheel: CardWheel | null;
  /** The eight quality attributes; null in a descriptive session. */
  quality: QualityRow[] | null;
};

const TOP_DESCRIPTORS = 3;

function ownModule(sample: CardSample, format: string): Record<string, unknown> {
  return format === "combined" ? sample.combined : format === "affective" ? sample.affective : sample.descriptive;
}

/**
 * The viewer's value and the group's for each quality attribute. `mine` only
 * for ratings the viewer may see as finished; `group` only under the page's
 * gate and from two included cuppers. Null in a descriptive session.
 */
export function qualityRows(sample: CardSample, ctx: RankContext): QualityRow[] | null {
  if (ctx.format === "descriptive") return null;
  const data = ownModule(sample, ctx.format);
  const showMine = canShowMyRatings(sample.myEvaluation);
  const agg = ctx.isGroup && ctx.canViewGroup ? sample.aggregateScore : null;
  const showGroup = agg !== null && panelGates(agg.participantCount ?? null).groupQualityByAttribute;
  return AFFECTIVE_ATTRIBUTES.map((attr) => {
    const raw = Number(data[`${attr.id}_final`] ?? data[attr.id] ?? 0);
    const avg = showGroup ? agg?.attrAverages?.[attr.label] : undefined;
    return {
      id: attr.id,
      mine: showMine && Number.isFinite(raw) && raw > 0 ? raw : null,
      group: typeof avg === "number" && Number.isFinite(avg) && avg > 0 ? avg : null,
    };
  });
}

/** The cards, references first, then in the order of the overview's list. */
export function coffeeCards<S extends CardSample>(input: {
  samples: S[];
  referenceId: string | null;
  ctx: RankContext;
  data: OverviewData;
}): CoffeeCard<S>[] {
  const { ctx, data } = input;
  const view: OverviewView<S> = overviewView(input);
  const card = (sample: S, place: number | null, context: ScoreContext | null, isReference: boolean): CoffeeCard<S> => {
    const wheel = data.samples[sample.id]?.wheel;
    const mineModule = ownModule(sample, ctx.format);
    return {
      sample,
      place,
      isReference,
      context,
      state: sample.myEvaluation.status,
      partial:
        ctx.format !== "descriptive" && canShowMyRatings(sample.myEvaluation) && isAffectiveDeclaredPartial(mineModule),
      wheel:
        !wheel || wheel.status === "no_wheel"
          ? null
          : wheel.status === "too_few"
            ? { status: "too_few" }
            : wheel.n === 0 || (wheel.scope === "own" && Object.keys(wheel.direct).length === 0)
              ? // nothing to draw: nobody behind it, or the viewer marked no flavour
                null
              : {
                  status: "ok",
                  scope: wheel.scope,
                  counts: wheel.rollup,
                  n: wheel.n,
                  descriptors: countedDescriptors(wheel.direct, wheel.n, TOP_DESCRIPTORS),
                  mine: wheel.mine ?? [],
                },
      quality: qualityRows(sample, ctx),
    };
  };

  const references = view.references.map((ref) =>
    card(
      ref.sample,
      null,
      ctx.format === "descriptive"
        ? null
        : scoreContext({
            value: ref.value,
            mine: myScoreFor(ref.sample, ctx.format, ctx.cupsPerSample),
            isReference: true,
          }),
      true,
    ),
  );
  if (ctx.format === "descriptive") {
    // no scores, so no ranking: every other coffee, in cupping order
    const referenceIds = new Set(view.references.map((r) => r.sample.id));
    return [
      ...references,
      ...input.samples.filter((s) => !referenceIds.has(s.id)).map((s) => card(s, null, null, false)),
    ];
  }
  return [...references, ...view.entries.map((entry) => card(entry.sample, entry.place, entry.context, false))];
}

/** The letter a drawing puts on a coffee: "G" for "Muestra G", else its number in the list. */
export function sampleTag(label: string, index: number): string {
  const match = /^(?:muestra|sample)\s+([A-Za-z0-9]{1,2})$/i.exec(label.trim());
  return match ? match[1].toUpperCase() : String(index + 1);
}

export type CompareOption = { id: string; tag: string; series: CompareSeries };

/**
 * The coffees the overview's "Comparar" may draw: only once the session is
 * CLOSED (`wheelCompareInput`), and only the coffees whose counts this viewer
 * may see. Null when there is nothing to compare (open session, affective
 * session, fewer than two coffees with counts).
 */
export function compareOptions<S extends CardSample>(input: {
  closed: boolean;
  /** The session's samples in the page's order: a coffee's letter comes from here. */
  samples: S[];
  /** The order the options are offered in (the ranking's). Ids it does not name
   *  follow, in the samples' order. */
  order?: readonly string[];
  data: OverviewData;
}): CompareOption[] | null {
  const result = wheelCompareInput({
    closed: input.closed,
    samples: input.samples.map((s) => ({
      id: s.id,
      wheel: input.data.samples[s.id]?.wheel ?? { status: "no_wheel", reason: "affective_format" },
    })),
  });
  if (result.status !== "ok") return null;
  // a letter must name ONE coffee: when two labels would give the same one
  // ("Muestra 2" beside the second of the list), every coffee takes its number
  const letters = input.samples.map((s, i) => sampleTag(s.label, i));
  const distinct = new Set(letters).size === letters.length;
  const index = new Map(input.samples.map((s, i) => [s.id, i]));
  const rank = new Map((input.order ?? []).map((id, i) => [id, i]));
  const options = result.others
    .filter((series) => series.n > 0)
    .map((series) => {
      const at = index.get(series.id) ?? 0;
      return { id: series.id, tag: distinct ? letters[at] : String(at + 1), series };
    })
    .sort((a, b) => {
      const ra = rank.get(a.id) ?? rank.size + (index.get(a.id) ?? 0);
      const rb = rank.get(b.id) ?? rank.size + (index.get(b.id) ?? 0);
      return ra - rb;
    });
  return options.length >= 2 ? options : null;
}

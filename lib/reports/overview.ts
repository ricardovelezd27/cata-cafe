// The overview of a cupping's results: what each tile shows, for a viewer and a
// state (package R2 of docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md,
// sections 2 and 4). Two pure functions, no React, no database, no colour, no
// word of the interface:
//
//   buildOverviewData  -> on the SERVER, from the evaluations the page loaded:
//                         per sample, the flavour wheel's counts and the
//                         defective cups; for the session, who cupped. Counts
//                         and aggregates only: no cupper's key, name or value
//                         is ever returned (a test serialises it and scans).
//   overviewView       -> from the samples the page already ships, that data and
//                         the reference the viewer compares against: the tiles.
//                         It runs where the reference is chosen (the browser).
//
// It adds no rule of its own. Whose numbers a viewer may see is the page's
// `canViewGroup` (lib/sessionState.ts `viewerMayReadGroupResults`), passed in;
// the ranking, the references and the tie are lib/reports/ranking.ts; what is
// said beside a score is lib/scoreContext.ts; the wheel's own gate (a
// participant under three cuppers) is lib/reports/wheelData.ts; no own total
// before sending is `myScoreFor` -> `canShowMyScore`. Display-only: scoring,
// the trigger and AggregateScore never read this file. Nothing is stored.

import { wheelHeadline, type WheelHeadline } from "@/lib/flavorWheelLayout";
import { buildDefectSummary, type DefectSummary } from "@/lib/reports/defectSummary";
import {
  myScoreFor,
  rankSamples,
  type RankContext,
  type RankValue,
  type RankableSample,
} from "@/lib/reports/ranking";
import { buildOwnWheelData, buildWheelData, type WheelData } from "@/lib/reports/wheelData";
import { round2 } from "@/lib/resultsScales";
import { scoreContext, type ScoreContext } from "@/lib/scoreContext";

// ── On the server ────────────────────────────────────────────────────────────

/** One SENT evaluation of the session, as the page loaded it for a viewer who
 *  may read the group's results. `cupperKey` only tells two cuppers apart. */
export type OverviewRow = {
  cupperKey: string;
  sampleId: string;
  /** The cupper is excluded from the session's results. */
  excluded: boolean;
  /** The format's module JSON (`combinedData`, `affectiveData` or `descriptiveData`). */
  data: unknown;
  /** `Evaluation.cups`; null = stored before 2026-11. */
  cups: number | null;
};

/** The viewer's OWN evaluation of one sample (in the admin lens, the owner's). */
export type OverviewOwnRow = {
  data: unknown;
  /** `isDraft === false`. */
  submitted: boolean;
  /** `canShowMyRatings`: a sent row, or a complete draft. */
  showRatings: boolean;
  cups: number | null;
};

export type OverviewSampleData = {
  wheel: WheelData;
  /** Defective cups among the evaluations the score pools; null in a descriptive session. */
  defects: DefectSummary | null;
};

/** People, as numbers. */
export type OverviewWho = {
  /** Participants of the session. */
  joined: number;
  /** Cuppers who sent at least one evaluation. */
  sent: number;
  /** Of those, the ones who are not excluded. */
  included: number;
  /** Excluded participants: the organizer's lens only; null for everyone else. */
  excluded: number | null;
};

export type OverviewData = {
  /** `group`: the panel's numbers. `own`: only the viewer's own evaluations. */
  scope: "group" | "own";
  samples: Record<string, OverviewSampleData>;
  /** Null outside the group scope. */
  who: OverviewWho | null;
};

/**
 * The counted part of the overview. `rows` is every SENT evaluation of the
 * session and is passed ONLY when the viewer may read the group's results
 * (`canViewGroup`); otherwise null, and everything is built from `own`.
 */
export function buildOverviewData(input: {
  format: string;
  cupsPerSample: number;
  isGroup: boolean;
  canViewGroup: boolean;
  /** The page's `ownerRead`: the organizer, or the read-only admin lens. */
  ownerLens: boolean;
  sampleIds: readonly string[];
  rows: readonly OverviewRow[] | null;
  own: Readonly<Record<string, OverviewOwnRow | null | undefined>>;
  joined: number;
  sentCuppers: number;
  excludedParticipants: number;
}): OverviewData {
  const group = input.isGroup && input.canViewGroup && input.rows !== null;
  const samples: Record<string, OverviewSampleData> = {};

  if (group) {
    const rows = input.rows as readonly OverviewRow[];
    for (const sampleId of input.sampleIds) {
      const mine = input.own[sampleId];
      const evaluations = rows
        .filter((row) => row.sampleId === sampleId)
        .map((row) => ({
          cupperKey: row.cupperKey,
          excluded: row.excluded,
          submitted: true,
          data: row.data,
          cups: row.cups,
        }));
      samples[sampleId] = {
        wheel: buildWheelData({
          format: input.format,
          evaluations,
          ownerLens: input.ownerLens,
          viewerData: mine && mine.showRatings ? mine.data : undefined,
        }),
        defects: buildDefectSummary({ format: input.format, cupsPerSample: input.cupsPerSample, evaluations }),
      };
    }
    const includedCuppers = new Set(rows.filter((row) => !row.excluded).map((row) => row.cupperKey));
    return {
      scope: "group",
      samples,
      who: {
        joined: input.joined,
        sent: input.sentCuppers,
        included: includedCuppers.size,
        excluded: input.ownerLens ? input.excludedParticipants : null,
      },
    };
  }

  for (const sampleId of input.sampleIds) {
    const mine = input.own[sampleId];
    samples[sampleId] = {
      wheel: buildOwnWheelData({ format: input.format, data: mine && mine.showRatings ? mine.data : null }),
      // a total and its deductions are for a SENT evaluation only
      defects:
        mine && mine.submitted
          ? buildDefectSummary({
              format: input.format,
              cupsPerSample: input.cupsPerSample,
              evaluations: [{ excluded: false, submitted: true, data: mine.data, cups: mine.cups }],
            })
          : null,
    };
  }
  return { scope: "own", samples, who: null };
}

// ── The tiles ────────────────────────────────────────────────────────────────

/** What the view needs of a sample; the results route's `SampleResult` satisfies it. */
export type OverviewSample = RankableSample & { label: string };

export type OverviewEntry<S> = {
  sample: S;
  /** The place printed beside it; null when the list is not a ranking. */
  place: number | null;
  /** Everything said beside its score. */
  context: ScoreContext;
};

export type OverviewFirst<S> =
  | { status: "ok"; entry: OverviewEntry<S> }
  /** `descriptive`: the session has no scores. `no_scores`: nothing to rank yet.
   *  `too_few`: scores exist, but none rests on enough cuppers to be "first". */
  | { status: "none"; reason: "descriptive" | "no_scores" | "too_few" };

export type OverviewWheelItem<S> =
  | { sample: S; status: "ok"; wheel: Extract<WheelData, { status: "ok" }>; headline: WheelHeadline | null }
  | { sample: S; status: "too_few"; included: number };

export type OverviewWheels<S> =
  /** An affective session: no wheel, no words about descriptors. */
  | { status: "no_wheel" }
  /** Every coffee is under the wheel's minimum for this viewer. */
  | { status: "too_few" }
  /** Nothing to draw yet: no sent evaluation, or none of the viewer's own marks. */
  | { status: "empty" }
  | { status: "ok"; scope: "group" | "own"; items: OverviewWheelItem<S>[] };

export type OverviewView<S> = {
  scope: "group" | "own";
  /** The list is a ranking (places are printed); false for a participant's own
   *  scores while the group's results are hidden: those stay in cupping order. */
  ranked: boolean;
  first: OverviewFirst<S>;
  /** Every coffee outside the references, in the order of the list. Empty in a
   *  descriptive session. */
  entries: OverviewEntry<S>[];
  /** The reference the scores are compared against, when it has a score. */
  referenceLine: { sample: S; score: number } | null;
  /** Every reference, in the order the organizer named them. */
  references: { sample: S; value: RankValue; active: boolean }[];
  wheels: OverviewWheels<S>;
  /** The viewer against the panel; null under three cuppers or with no score of their own. */
  you: { above: number; of: number; meanDifference: number } | null;
  /** Coffees with a defective cup, the most flagged first. */
  defects: { sample: S; summary: DefectSummary }[];
  who: OverviewWho | null;
};

/**
 * The tiles. `referenceId` is the reference the viewer compares against (the
 * active one by default); `ctx.canViewGroup` is the page's own gate.
 */
export function overviewView<S extends OverviewSample>(input: {
  samples: S[];
  referenceId: string | null;
  ctx: RankContext;
  data: OverviewData;
}): OverviewView<S> {
  const { samples, ctx, data } = input;
  const ranking = rankSamples(samples, input.referenceId, ctx);
  // A participant's own scores before the close are not a ranking: cupping order.
  const ranked = !(ctx.isGroup && !ctx.canViewGroup);
  const ordered = ranked ? ranking.ranked : [...ranking.ranked].sort((a, b) => a.position - b.position);

  const entries: OverviewEntry<S>[] =
    ctx.format === "descriptive"
      ? []
      : ordered.map((r) => ({
          sample: r.sample,
          place: ranked ? r.rank : null,
          context: scoreContext({
            value: r,
            mine: myScoreFor(r.sample, ctx.format, ctx.cupsPerSample),
            deltaVsReference: ranking.refDeltas.get(r.sample.id) ?? null,
          }),
        }));

  const first = ((): OverviewFirst<S> => {
    if (ctx.format === "descriptive") return { status: "none", reason: "descriptive" };
    if (!ranked || !entries.some((e) => e.context.score !== null)) return { status: "none", reason: "no_scores" };
    const candidates = entries.filter((e) => e.context.canBeFirst);
    if (candidates.length === 0) return { status: "none", reason: "too_few" };
    return { status: "ok", entry: candidates[0] };
  })();

  const referenceLine =
    ranking.referenceSample && ranking.referenceRank && ranking.referenceRank.score !== null
      ? { sample: ranking.referenceSample, score: ranking.referenceRank.score }
      : null;

  const inOrder = [...ranking.anchors.map((a) => a.sample), ...ordered.map((r) => r.sample)];
  const wheels = ((): OverviewWheels<S> => {
    const items: OverviewWheelItem<S>[] = [];
    let hasWheel = false;
    for (const sample of inOrder) {
      const wheel = data.samples[sample.id]?.wheel;
      if (!wheel || wheel.status === "no_wheel") continue;
      hasWheel = true;
      if (wheel.status === "too_few") {
        items.push({ sample, status: "too_few", included: wheel.included });
        continue;
      }
      // nobody has sent this coffee yet: there is nothing to draw for it
      if (wheel.n === 0) continue;
      const headline = wheelHeadline(wheel.rollup, wheel.n);
      // the viewer's own marks: a coffee they marked nothing on is left out
      if (data.scope === "own" && headline === null) continue;
      items.push({ sample, status: "ok", wheel, headline });
    }
    if (!hasWheel) return { status: "no_wheel" };
    if (items.length === 0) return { status: "empty" };
    if (items.every((item) => item.status === "too_few")) return { status: "too_few" };
    return { status: "ok", scope: data.scope, items };
  })();

  const differences = entries
    .map((e) => e.context.difference)
    .filter((d): d is number => typeof d === "number");
  const you =
    data.scope === "group" && differences.length > 0
      ? {
          above: differences.filter((d) => d > 0).length,
          of: differences.length,
          meanDifference: round2(differences.reduce((sum, d) => sum + d, 0) / differences.length),
        }
      : null;

  const defects = inOrder
    .map((sample) => ({ sample, summary: data.samples[sample.id]?.defects ?? null }))
    .filter((d): d is { sample: S; summary: DefectSummary } => d.summary !== null && d.summary.cups > 0)
    .sort((a, b) => b.summary.cuppers - a.summary.cuppers || b.summary.cups - a.summary.cups);

  return {
    scope: data.scope,
    ranked,
    first,
    entries,
    referenceLine,
    references: ranking.anchors.map((a) => ({
      sample: a.sample,
      value: a.rank,
      active: ranking.referenceSample?.id === a.sample.id,
    })),
    wheels,
    you,
    defects,
    who: data.who,
  };
}

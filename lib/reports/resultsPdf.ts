// The model of the "results of the page" PDF (package OR-E part 3): the "Por café"
// view of the results page, as data, for ONE viewer. Pure: no React, no database,
// no word of the interface.
//
// It adds no rule and no query. It assembles the page's own inputs (the samples
// as the page ships them, the viewer's own evaluation, the group's aggregate under
// the page's one gate) from the report fetch (`SessionReportSource`) and runs
// the page's own models over them: `buildOverviewData` / `overviewView`
// (lib/reports/overview.ts), `coffeeCards` / `compareOptions`
// (lib/reports/coffeeCards.ts). So what a participant's file holds is what a
// participant's page holds: counts and aggregates only, the wheel hidden under
// three cuppers, no group number before the close, references outside the ranking.
//
// The caller (the route) has ALREADY gated the viewer, exactly as the page does:
// `canViewGroup` is `viewerMayReadGroupResults`; a group session whose results
// are hidden never gets here (409). A participant's unsent drafts are not in the
// report fetch, so they read as "no evaluation yet" (less than the page shows,
// never more). Display-only: scoring, the trigger and AggregateScore never read it.

import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { canShowMyRatings, deriveMyEvaluation } from "@/lib/evaluationState";
import { fillPattern } from "@/lib/fillPattern";
import { referenceExplanation } from "@/lib/referenceRules";
import { evaluationScoreRule } from "@/lib/scoreRule";
import { noIncludedAggregate, type RankContext } from "@/lib/reports/ranking";
import {
  coffeeCards,
  compareOptions,
  MAX_COMPARED,
  type CardSample,
  type CoffeeCard,
  type CompareOption,
} from "@/lib/reports/coffeeCards";
import {
  buildOverviewData,
  overviewView,
  type OverviewData,
  type OverviewView,
} from "@/lib/reports/overview";
import { blobForFormat, type ReportStampInfo, type SessionReportSource } from "@/lib/reports/types";
import { formatScore, formatSigned } from "@/lib/scoreFormat";
import type { ScoreContext } from "@/lib/scoreContext";

/** The page's `SampleResult`, narrowed to what the overview and the cards read. */
export type ResultsPdfSample = CardSample & {
  revealed: boolean;
  /** The coffee, only once revealed (the page's own rule). */
  coffee: { name: string; country: string | null } | null;
};

export type ResultsPdfModel = {
  header: {
    name: string;
    date: Date;
    closedAt: Date | null;
    format: RankContext["format"];
    isGroup: boolean;
  };
  ctx: RankContext;
  /** The overview's tiles: first, ranking, the small facts. */
  view: OverviewView<ResultsPdfSample>;
  /** One card per coffee, references first, then the ranking's order. */
  cards: CoffeeCard<ResultsPdfSample>[];
  /** "Comparar": the coffees it may draw (null = no section) and the first three, its default pick. */
  compare: { options: CompareOption[]; picked: CompareOption[] } | null;
  /** The viewer's own descriptor match with the panel (three numbers, no one else's). */
  myAlignment: { matches: number; opportunities: number } | null;
  /** False in the admin's read-only lens: the "you" of the page is the organizer. */
  own: boolean;
  /** Only a pinned reference (anchor mode, a format with quality ratings) is "fixed / 79.00". */
  referencePinned: boolean;
  stamp: ReportStampInfo & { viewerExcluded: boolean };
};

export function buildResultsPdfModel(
  source: SessionReportSource,
  input: {
    /** The signed-in user. */
    viewerId: string;
    /** Whose evaluations are "mine": the signed-in user, or the organizer in the admin's lens. */
    viewAsId: string;
    isAdminViewer: boolean;
    /** The page's `canViewGroup` (`viewerMayReadGroupResults`), already true or the route refused. */
    canViewGroup: boolean;
    /** Shown instead of a coffee name once the coffee was anonymized. */
    coffeeDeleted: string;
  },
): ResultsPdfModel {
  const { session } = source;
  const format = session.format;
  const ctx: RankContext = {
    format,
    isGroup: session.isGroup,
    canViewGroup: input.canViewGroup,
    cupsPerSample: session.cupsPerSample,
  };
  const group = ctx.isGroup && ctx.canViewGroup;
  const excluded = new Set(source.excludedUserIds);
  const ownerRead = input.viewerId === session.createdBy || input.isAdminViewer;

  const totalSubmitted = new Map<string, number>();
  for (const ev of source.evals) {
    totalSubmitted.set(ev.sessionSampleId, (totalSubmitted.get(ev.sessionSampleId) ?? 0) + 1);
  }
  const mine = new Map(source.evals.filter((ev) => ev.cupperId === input.viewAsId).map((ev) => [ev.sessionSampleId, ev]));

  const samples: ResultsPdfSample[] = source.samples.map((s) => {
    const ev = mine.get(s.id);
    const agg = group ? source.groupAggBySample[s.id] : undefined;
    const submitted = totalSubmitted.get(s.id) ?? 0;
    const aggregateScore = !group
      ? null
      : agg
        ? {
            communityScore: agg.communityScore,
            scoreSd: agg.scoreSd,
            participantCount: agg.included,
            submittedCount: agg.submitted,
            totalSubmitted: submitted,
            totalCups: agg.totalCups,
            attrAverages: agg.attrAverages,
          }
        : submitted > 0
          ? noIncludedAggregate(submitted)
          : null;
    return {
      id: s.id,
      label: s.label,
      revealed: s.revealed,
      coffee:
        s.revealed && s.coffee
          ? { name: coffeeDisplayName(s.coffee, input.coffeeDeleted), country: s.coffee.country }
          : null,
      referenceRank: s.referenceRank ?? null,
      descriptive: ev?.descriptiveData ?? {},
      affective: ev?.affectiveData ?? {},
      combined: ev?.combinedData ?? {},
      scoreRule: evaluationScoreRule(ev?.cups, ev !== undefined),
      aggregateScore,
      myEvaluation: deriveMyEvaluation(format, ev ? { isDraft: false, data: blobForFormat(format, ev) } : null),
    };
  });

  const data: OverviewData = buildOverviewData({
    format,
    cupsPerSample: session.cupsPerSample,
    isGroup: session.isGroup,
    canViewGroup: input.canViewGroup,
    ownerLens: ownerRead,
    sampleIds: samples.map((s) => s.id),
    rows: group
      ? source.evals.map((ev) => ({
          cupperKey: ev.cupperId,
          sampleId: ev.sessionSampleId,
          excluded: excluded.has(ev.cupperId),
          data: blobForFormat(format, ev),
          cups: ev.cups,
        }))
      : null,
    own: Object.fromEntries(
      samples.map((s) => {
        const ev = mine.get(s.id);
        return [
          s.id,
          ev
            ? { data: blobForFormat(format, ev), submitted: true, showRatings: canShowMyRatings(s.myEvaluation), cups: ev.cups }
            : null,
        ];
      }),
    ),
    joined: source.participants.length,
    sentCuppers: source.submittedCupperCount,
    excludedParticipants: source.excludedUserIds.length,
  });

  const referenceId = session.referenceSampleId;
  const view = overviewView({ samples, referenceId, ctx, data });
  const cards = coffeeCards({ samples, referenceId, ctx, data });
  const options = compareOptions({
    closed: session.status === "closed",
    samples,
    order: [...view.entries.map((e) => e.sample.id), ...view.references.map((r) => r.sample.id)],
    data,
  });

  const myRow = group ? source.alignmentRows.find((r) => r.id === input.viewerId) : undefined;
  const stamp = source.stamp ?? { inclusion: null, resultsUpdatedAt: null, originEditedAt: null };

  return {
    header: { name: session.name, date: session.date, closedAt: session.closedAt, format, isGroup: session.isGroup },
    ctx,
    view,
    cards,
    compare: options ? { options, picked: options.slice(0, MAX_COMPARED) } : null,
    myAlignment: myRow ? { matches: myRow.matches, opportunities: myRow.opportunities } : null,
    own: !input.isAdminViewer,
    referencePinned: referenceExplanation({ mode: session.referenceMode, moduleKey: format }) === "pinned",
    stamp: { ...stamp, viewerExcluded: !input.isAdminViewer && group && excluded.has(input.viewerId) },
  };
}

// ── The words beside a score, as text ────────────────────────────────────────

/** The words of `ScoreWithContext`, the page's component (`results.parts.score*`). */
export type ScoreLineStrings = {
  spread: string;
  included: string;
  includedNoTotal: string;
  mine: string;
  difference: string;
  deltaVsReference: string;
  ownScore: string;
  noScore: string;
  indicative: string;
};

/**
 * What `ScoreWithContext` prints under a number, as lines of text: the same
 * fields in the same order ("± 2.9 · 7 de 8 incluidos", "tú 90.75 · diferencia
 * +2.00", "Δ +3.25 vs. referencia", then "indicativo"), decided by the same
 * `scoreContext`. `brief` is a ranking row's: only what tells how firm the number is.
 */
export function scoreLines(context: ScoreContext, strings: ScoreLineStrings, detail: "full" | "brief" = "full"): string[] {
  const full = detail === "full";
  const first: string[] = [];
  if (context.score === null) first.push(strings.noScore);
  else if (full && context.basis === "mine") first.push(strings.ownScore);
  if (context.spread !== null) first.push(fillPattern(strings.spread, { sd: context.spread.toFixed(1) }));
  if (context.included) {
    first.push(
      context.included.total === null
        ? fillPattern(strings.includedNoTotal, { n: context.included.n })
        : fillPattern(strings.included, { n: context.included.n, total: context.included.total }),
    );
  }
  const second: string[] = [];
  if (full && context.mine !== null) second.push(fillPattern(strings.mine, { score: formatScore(context.mine) }));
  if (full && context.difference !== null) {
    second.push(fillPattern(strings.difference, { difference: formatSigned(context.difference) }));
  }
  const third =
    !full || context.deltaVsReference === null
      ? []
      : [fillPattern(strings.deltaVsReference, { delta: formatSigned(context.deltaVsReference) })];
  const flags = context.indicative || context.suppressed ? [strings.indicative] : [];
  return [first, second, third, flags].filter((part) => part.length > 0).map((part) => part.join(" · "));
}

// From what the results page already has to the input of the learnings
// (package R4b; the rules are lib/reports/learnings.ts, package R4a).
//
// Pure: no React, no database. Nothing new is queried and nothing is stored:
// every field below is a value the page already computed for the overview, the
// cards and the sheet, re-read through the SAME functions, so a sentence can
// never print a number the page does not show.
//   - the score of each coffee, its spread, its n and its Δ against the active
//     reference: `rankSamples` (what the ranking tile and the cards read);
//   - the viewer's own score: `myScoreFor` (-> `canShowMyScore`: a sent
//     evaluation only);
//   - the viewer's value and the group's per quality attribute: the rows of
//     `buildPersonalComparison` (closed session, a participant, three included
//     cuppers per row);
//   - each coffee's wheel and its defective cups: `OverviewData`, built on the
//     server under the page's own gate;
//   - the viewer's own alignment triple and their own two scores of a repeated
//     coffee: the page's `myAlignment` and `compareOwnEvaluations`.
// It decides nothing about who may read the group's results or whether the
// session is closed: both come in as the page's own booleans (`ctx.canViewGroup`
// is the page's one gate; `closed` is the session's status).
// Display-only: scoring, the trigger and AggregateScore never read this file.

import {
  buildLearnings,
  learningScope,
  panelLearningsStatus,
  type Learning,
  type LearningSample,
  type LearningsInput,
} from "@/lib/reports/learnings";
import type { OverviewData, OverviewSample } from "@/lib/reports/overview";
import type { PersonalComparison } from "@/lib/reports/personalComparison";
import { myScoreFor, rankSamples, type RankContext, type RankValue } from "@/lib/reports/ranking";

/** What the builder reads of a sample; the results route's `SampleResult` satisfies it. */
export type LearningsSample = OverviewSample & { comparison?: PersonalComparison | null };

export type RepeatPair = { a: string; b: string; scoreA: number; scoreB: number };

export function buildLearningsInput<S extends LearningsSample>(input: {
  /** The session's status is "closed". */
  closed: boolean;
  /** The organizer's lens (the page's `ownerRead`). */
  ownerLens: boolean;
  /** The reference is fixed at 79.00 for everyone (`referenceExplanation` is "pinned"). */
  referencePinned: boolean;
  samples: S[];
  /** The ACTIVE reference, or null. */
  referenceId: string | null;
  ctx: RankContext;
  data: OverviewData;
  /** The viewer's own alignment triple; null when they have none. */
  alignment: { matches: number; opportunities: number } | null;
  /** The viewer's own two total scores for each pair of samples that were the same coffee. */
  repeats: readonly RepeatPair[];
}): LearningsInput {
  const { ctx, data } = input;
  const ranking = rankSamples(input.samples, input.referenceId, ctx);
  const values = new Map<string, RankValue>();
  for (const r of ranking.ranked) values.set(r.sample.id, { score: r.score, sd: r.sd, basis: r.basis, n: r.n, total: r.total });
  for (const anchor of ranking.anchors) values.set(anchor.sample.id, anchor.rank);
  const none: RankValue = { score: null, sd: null, basis: null, n: null, total: null };

  const samples: LearningSample[] = input.samples.map((sample) => {
    const isReference = ranking.anchorIds.has(sample.id);
    const comparison = sample.comparison;
    return {
      id: sample.id,
      isReference,
      pinned: isReference && input.referencePinned,
      value: values.get(sample.id) ?? none,
      mine: myScoreFor(sample, ctx.format, ctx.cupsPerSample),
      deltaVsReference: ranking.refDeltas.get(sample.id) ?? null,
      attributes:
        comparison && comparison.status === "ok" && comparison.affective
          ? comparison.affective.attrs.map((a) => ({ id: a.id, mine: a.mine, group: a.group }))
          : null,
      wheel: data.samples[sample.id]?.wheel ?? null,
      // the defective cups of the GROUP only: in the viewer's own scope they are theirs alone
      defects: data.scope === "group" ? (data.samples[sample.id]?.defects ?? null) : null,
    };
  });

  return {
    closed: input.closed,
    isGroup: ctx.isGroup,
    groupVisible: ctx.canViewGroup,
    ownerLens: input.ownerLens,
    format: ctx.format,
    samples,
    referenceId: ranking.referenceSample?.id ?? null,
    alignment:
      input.alignment && data.who
        ? { matches: input.alignment.matches, opportunities: input.alignment.opportunities, cuppers: data.who.included }
        : null,
    repeats: input.repeats,
  };
}

/** What the results page sends to the browser: the learnings, split by whom they are about. */
export type LearningsPayload = {
  /** About the cupping as a whole: the same for everyone who may read the group's results. */
  panel: Learning[];
  /** Built from the viewer's own values: for their page only. */
  mine: Learning[];
  /** Why the panel's list is what it is (`panelLearningsStatus`). */
  panelStatus: "not_applicable" | "too_few" | "ok";
};

/**
 * The learnings of one viewer, or null while the session is not closed
 * (teaching appears only after the close). `ownOnes: false` leaves the
 * viewer's own out: the admin's read-only lens holds the ORGANIZER's
 * evaluations in the "mine" slots, and a sentence that says "tú" about them
 * would be about a named person. `repeatedFirst` is the model's one-line
 * switch (`REPEATED_COFFEE_FIRST`); the page never passes it, the review board
 * does, to show both orders.
 */
export function learningsPayload(
  input: LearningsInput,
  options: { ownOnes: boolean; repeatedFirst?: boolean },
): LearningsPayload | null {
  if (input.closed !== true) return null;
  const all = buildLearnings(input, options.repeatedFirst === undefined ? {} : { repeatedFirst: options.repeatedFirst });
  return {
    panel: all.filter((l) => learningScope(l.rule) === "panel"),
    mine: options.ownOnes ? all.filter((l) => learningScope(l.rule) === "mine") : [],
    panelStatus: panelLearningsStatus(input),
  };
}

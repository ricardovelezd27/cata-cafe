// Score with context: what is shown beside a score, and what a panel of a given
// size shows at all (package R1a of docs/audits/app-ui-ux-2026-11-15/
// RESULTS-DESIGN.md: section 0 choice 6, section 2 and the "Two cuppers" and
// "Fewer than three included" rows of section 4).
//
// Pure, numbers in and numbers out: the page's `ScoreWithContext` and the PDFs
// read the same object, so they can never disagree about whether a "±", a
// "diferencia" or the group's dot is there. Built on RANKING_POLICY
// (lib/reports/ranking.ts); it adds no threshold of its own except the one
// Ricardo decided on 2026-11-16 (two cuppers is a valid panel for the group's
// QUALITY values per attribute).
//
// A score is a number only: nothing here names or colours a score by quality.
// Display-only: scoring, the trigger and AggregateScore never read this file.
// TODO(kim-validar:D3): the thresholds of RANKING_POLICY are simulated answers.

import { RANKING_POLICY, policyFlags, type RankPolicy, type RankValue } from "@/lib/reports/ranking";
import { round2 } from "@/lib/resultsScales";

/** Included cuppers from which the group's value per QUALITY attribute is
 *  shown (Ricardo, decision 6: "two cuppers is valid"). Everything that
 *  compares a person with the panel needs RANKING_POLICY.minN (three). */
export const QUALITY_BY_ATTRIBUTE_MIN_N = 2;

export type PanelGates = {
  /** The group's dot per quality attribute (1 to 9): from two included cuppers. */
  groupQualityByAttribute: boolean;
  /** The group's dot per intensity (0 to 15): from three. */
  groupIntensities: boolean;
  /** "Elegiste 2 de los 3 descriptores más elegidos por el panel": from three. */
  sharedDescriptors: boolean;
  /** The "Tú y el panel" tile: from three. */
  youAndPanel: boolean;
  /** Every learning about the panel: from three. */
  panelLearnings: boolean;
  /** "diferencia" between the viewer's score and the group's: from three. */
  difference: boolean;
  /** The "±" beside a group score: from three. */
  spread: boolean;
  /** A coffee can be "Primera del ranking": from three. */
  first: boolean;
  /** No "indicativo" flag by number of cuppers: from six. (Too few pooled cups
   *  can still flag one score: `scoreContext` reads that from the score itself.) */
  firm: boolean;
};

/**
 * What a group number built from `included` cuppers may show. `included` is the
 * "n" of "n de N incluidos" (complete evaluations of cuppers who are not
 * excluded); null or 0 shows nothing of the group. One threshold table for
 * every surface: with two cuppers a person sees the group's dot for the quality
 * of the acidity and not for its intensity, as decided.
 */
export function panelGates(
  included: number | null | undefined,
  policy: RankPolicy = RANKING_POLICY,
): PanelGates {
  const n = typeof included === "number" && Number.isFinite(included) ? included : 0;
  const compares = n >= policy.minN;
  return {
    groupQualityByAttribute: n >= QUALITY_BY_ATTRIBUTE_MIN_N,
    groupIntensities: compares,
    sharedDescriptors: compares,
    youAndPanel: compares,
    panelLearnings: compares,
    difference: compares,
    spread: compares,
    first: compares,
    firm: n >= policy.indicativeBelow,
  };
}

export type ScoreContextInput = {
  /** The score a surface displays for a sample: `rankFor` / a `RankedEntry`. */
  value: RankValue;
  /** The viewer's own score for the same sample, when they have one to show. */
  mine: number | null;
  /** The sample is a reference: outside the ranking, never "first", never tied. */
  isReference?: boolean;
  /** `RankedEntry.noClearGap` (the tie rule, already applied by the ranking). */
  noClearGap?: boolean;
  /** Δ against the reference, already computed by lib/referenceDelta.ts. */
  deltaVsReference?: number | null;
};

export type ScoreContext = {
  /** The number, exactly as given: in ink, never coloured or named. */
  score: number | null;
  basis: RankValue["basis"];
  /** "± x": only beside a community score of three or more included cuppers. */
  spread: number | null;
  /** "n de N incluidos": beside EVERY community score, also with one or two.
   *  `total` is null when the number of submitted evaluations is not known. */
  included: { n: number; total: number | null } | null;
  /** "tú x": the viewer's score beside a COMMUNITY score. Null when the score
   *  shown is already theirs. */
  mine: number | null;
  /** "diferencia": mine minus the group's, two decimals, from three cuppers. */
  difference: number | null;
  /** Δ against the reference, passed through (null for a reference itself). */
  deltaVsReference: number | null;
  /** "indicativo": three to five included cuppers, or too few pooled cups. */
  indicative: boolean;
  /** A community number of fewer than three cuppers: no spread, never first. */
  suppressed: boolean;
  /** "sin diferencia clara" with a neighbour in the ranking. */
  noClearGap: boolean;
  /** May be named "Primera del ranking" if it is the first of the order. */
  canBeFirst: boolean;
};

/**
 * Everything printed beside ONE score. A community score always carries its
 * "n de N incluidos"; the spread, the difference and "first" need three
 * included cuppers; a solo cupper's own score carries nothing but itself.
 * A community score whose n is not known shows the number alone. `indicative`
 * and `suppressed` are `policyFlags` unchanged (both can be true): a surface
 * that prints one badge reads either as "indicativo", as the participant
 * summary already does.
 */
export function scoreContext(
  input: ScoreContextInput,
  policy: RankPolicy = RANKING_POLICY,
): ScoreContext {
  const { value } = input;
  const isReference = input.isReference === true;
  const community = value.basis === "community" && value.score !== null;
  const flags = policyFlags(value, policy);
  const gates = panelGates(community ? value.n : null, policy);
  const mine =
    community && typeof input.mine === "number" && Number.isFinite(input.mine) ? input.mine : null;
  const delta = input.deltaVsReference;

  return {
    score: value.score,
    basis: value.basis,
    spread: community && gates.spread && typeof value.sd === "number" ? value.sd : null,
    included: community && value.n !== null ? { n: value.n, total: value.total } : null,
    mine,
    difference:
      mine !== null && gates.difference ? round2(mine - (value.score as number)) : null,
    deltaVsReference:
      !isReference && typeof delta === "number" && Number.isFinite(delta) ? delta : null,
    indicative: community && flags.indicative,
    suppressed: community && flags.suppressed,
    noClearGap: !isReference && value.score !== null && input.noClearGap === true,
    canBeFirst:
      !isReference && value.score !== null && (value.basis === "mine" || (community && gates.first)),
  };
}

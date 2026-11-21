// The words of the results overview (package R2), built ONCE on the server and
// passed to the client component as props (the project's i18n rule). Every
// string of `results.overview` is read with `t.raw()`: most carry a
// `{placeholder}` the component fills (lib/fillPattern.ts). The words that
// already existed (the defect types, the ranking's help) are passed in by the
// page, so they are decided in one place.

/** The keys of `results.overview`, in the order of the messages file. */
export const RESULTS_OVERVIEW_KEYS = [
  "pageKind",
  "firstTitle",
  "firstTitleOwn",
  "firstTooFew",
  "firstNoScores",
  "rankingTitle",
  "rankingTitleOwn",
  "rankingTitleOpen",
  "rankingOpenNote",
  "rankingEmpty",
  "scoreName",
  "youTitle",
  "youAbove",
  "youAboveNote",
  "youMean",
  "youAlignment",
  "youAlignmentNote",
  "whoTitle",
  "whoJoined",
  "whoSent",
  "whoExcluded",
  "defectsTitle",
  "defectCupsOne",
  "defectCupsMany",
  "defectType",
  "defectUnspecified",
  "defectBy",
  "referenceScore",
  "preliminary",
] as const;

export type ResultsOverviewKey = (typeof RESULTS_OVERVIEW_KEYS)[number];

/** Words the page already had and decides by format and reference mode. */
export type OverviewBorrowedStrings = {
  /** What "indicativo" means, printed under a ranking that uses it. */
  rankHelp: string;
  /** "Los resultados del grupo aparecerán cuando se cierre la cata." */
  communityPending: string;
  /** The defect types by id (`cupping.cups.types`). */
  defectTypes: Record<string, string>;
};

export type OverviewStrings = Record<ResultsOverviewKey, string> & OverviewBorrowedStrings;

type RawTranslator = { raw: (key: string) => unknown };

export function buildOverviewStrings(t: RawTranslator, borrowed: OverviewBorrowedStrings): OverviewStrings {
  const own = Object.fromEntries(
    RESULTS_OVERVIEW_KEYS.map((key) => [key, String(t.raw(`overview.${key}`))]),
  ) as Record<ResultsOverviewKey, string>;
  return { ...own, ...borrowed };
}

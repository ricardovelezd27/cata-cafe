// The words of the results parts (package R1b), built ONCE on the server and
// passed to the client components as props (the project's i18n rule: no
// `useTranslations` inside them). Same shape as components/warmup/playerStrings.ts.
//
// Every string is read with `t.raw()`: most carry a `{placeholder}` that the
// component fills on the client (lib/fillPattern.ts), and calling `t()` on such
// a message without its argument renders the raw key. The keys live in ONE
// block, `results.parts`, of messages/es.json and messages/en.json.

import type { DotPlotStrings } from "@/components/ui/DotPlot";
import type { ScoreContextStrings } from "@/components/ui/ScoreWithContext";
import type { CountedListStrings } from "./CountedList";
import type { FlavorCompareStrings } from "./FlavorCompare";
import type { FlavorWheelStrings } from "./FlavorWheel";
import type { RankStripStrings } from "./RankStrip";
import type { WheelCaptionStrings } from "./wheelCaption";

export type ResultsPartsStrings = {
  counted: CountedListStrings;
  wheel: FlavorWheelStrings;
  compare: FlavorCompareStrings;
  dotPlot: DotPlotStrings;
  score: ScoreContextStrings;
  rank: RankStripStrings;
  /** The line a page writes beside a SMALL wheel (`wheelCaptionText`); the full
   *  wheel prints its own from the same words, carried in `wheel`. */
  caption: WheelCaptionStrings;
};

/** The translator of the `results` namespace (`getTranslations("results")`). */
type RawTranslator = { raw: (key: string) => unknown };

/** The keys of `results.parts`, in the order of the messages file. */
export const RESULTS_PARTS_KEYS = [
  "countOf",
  "chosenByYou",
  "nobody",
  "wheelAria",
  "wheelAriaItem",
  "wheelAriaNobody",
  "compareAria",
  "compareAriaCoffee",
  "compareTableCaption",
  "compareFamily",
  "ofN",
  "dotBoth",
  "dotMineOnly",
  "none",
  "legendMine",
  "legendGroup",
  "legendSpread",
  "legendReference",
  "scaleNote",
  "offScale",
  "scoreSpread",
  "scoreIncluded",
  "scoreIncludedNoTotal",
  "scoreMine",
  "scoreDifference",
  "scoreDelta",
  "ownScore",
  "noScore",
  "indicative",
  "mostFound",
  "mostFoundEach",
  "mostFoundMany",
  "mostFoundLabel",
  "and",
  "cuppers",
  "cuppersOne",
] as const;

export type ResultsPartsKey = (typeof RESULTS_PARTS_KEYS)[number];

export function buildResultsPartsStrings(t: RawTranslator): ResultsPartsStrings {
  const s = (key: ResultsPartsKey): string => String(t.raw(`parts.${key}`));
  const caption: WheelCaptionStrings = {
    mostFound: s("mostFound"),
    mostFoundEach: s("mostFoundEach"),
    mostFoundMany: s("mostFoundMany"),
    mostFoundLabel: s("mostFoundLabel"),
    and: s("and"),
    cuppers: s("cuppers"),
    cuppersOne: s("cuppersOne"),
    nobody: s("nobody"),
  };
  return {
    counted: { countOf: s("countOf"), chosenByYou: s("chosenByYou"), nobody: s("nobody") },
    wheel: { aria: s("wheelAria"), ariaItem: s("wheelAriaItem"), ariaNobody: s("wheelAriaNobody"), ...caption },
    compare: {
      aria: s("compareAria"),
      ariaCoffee: s("compareAriaCoffee"),
      tableCaption: s("compareTableCaption"),
      familyHeader: s("compareFamily"),
      ofN: s("ofN"),
    },
    dotPlot: {
      both: s("dotBoth"),
      mineOnly: s("dotMineOnly"),
      none: s("none"),
      legendMine: s("legendMine"),
      legendGroup: s("legendGroup"),
    },
    score: {
      spread: s("scoreSpread"),
      included: s("scoreIncluded"),
      includedNoTotal: s("scoreIncludedNoTotal"),
      mine: s("scoreMine"),
      difference: s("scoreDifference"),
      deltaVsReference: s("scoreDelta"),
      ownScore: s("ownScore"),
      noScore: s("noScore"),
      none: s("none"),
      indicative: s("indicative"),
    },
    rank: {
      legendGroup: s("legendGroup"),
      legendMine: s("legendMine"),
      legendSpread: s("legendSpread"),
      legendReference: s("legendReference"),
      scaleNote: s("scaleNote"),
      offScale: s("offScale"),
      none: s("none"),
    },
    caption,
  };
}

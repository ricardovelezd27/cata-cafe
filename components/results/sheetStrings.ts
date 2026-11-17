// The words of a coffee's sheet (package R3), built ONCE on the server and
// passed to the client components as props (the project's i18n rule). Every
// string of `results.sheet` is read with `t.raw()`: several carry a
// `{placeholder}` the component fills (lib/fillPattern.ts).

/** The keys of `results.sheet`, in the order of the messages file. */
export const RESULTS_SHEET_KEYS = [
  "kind",
  "scoreOfCupper",
  "howOwn",
  "howCupper",
  "howGroup",
  "yourDelta",
  "youAndGroup",
  "quality",
  "qualityPinned",
  "cooled",
  "notEvaluated",
  "flavourGroup",
  "flavourOwn",
  "flavourCupper",
  "flavourTooFew",
  "flavourNone",
  "stages",
  "stageNobody",
  "showAll",
  "showFewer",
  "marksTitle",
  "compareWith",
  "compareHint",
  "compareClear",
  "shared",
  "notShared",
  "intensities",
  "intensitiesGroupNote",
  "defects",
  "notes",
  "theCoffee",
  "noNotes",
  "valuesOf",
] as const;

export type ResultsSheetKey = (typeof RESULTS_SHEET_KEYS)[number];
export type SheetStrings = Record<ResultsSheetKey, string>;

type RawTranslator = { raw: (key: string) => unknown };

export function buildSheetStrings(t: RawTranslator): SheetStrings {
  return Object.fromEntries(RESULTS_SHEET_KEYS.map((key) => [key, String(t.raw(`sheet.${key}`))])) as SheetStrings;
}

// The words of the coffee cards (package R2, step 2), built ONCE on the server
// and passed to the client components as props (the project's i18n rule). Every
// string of `results.cards` is read with `t.raw()`: several carry a
// `{placeholder}` the component fills (lib/fillPattern.ts). The words that
// already existed (the viewer's own states, "Revelar", the reference's badge,
// the names of the eight quality attributes) are passed in by the page.

/** The keys of `results.cards`, in the order of the messages file. */
export const RESULTS_CARDS_KEYS = [
  "title",
  "note",
  "noteAffective",
  "noteDescriptive",
  "rowLabel",
  "outsideRanking",
  "viewDetail",
  "viewDetailOf",
  "mostChosen",
  "youMarked",
  "tooFew",
  "qualityGroup",
  "qualityMine",
  "qualityTitle",
  "stepsLabel",
  "step",
  "compare",
  "comparePick",
  "compareHint",
  "compareNeedTwo",
  "tabPanel",
  "groupTitle",
  "yourDelta",
] as const;

export type ResultsCardsKey = (typeof RESULTS_CARDS_KEYS)[number];

/** Words the page already had. */
export type CardsBorrowedStrings = {
  /** "En curso": the viewer's own evaluation is an unsent draft. */
  inProgress: string;
  /** "Sin evaluar": the viewer has no evaluation of this coffee. */
  notEvaluated: string;
  /** "En curso = tu evaluación aún no se ha enviado; verás tu puntaje al enviarla." */
  inProgressLegend: string;
  /** "Parcial · sin puntaje": the viewer declared a partial evaluation. */
  partialLabel: string;
  /** "Revelar" / "Revelada": the organizer's one tap, as before. */
  reveal: string;
  revealed: string;
  /** "Referencia" (numbered by `referenceBadgeText` when there are several). */
  referenceBadge: string;
  /** The eight quality attributes' names, by id. */
  attributes: Record<string, string>;
};

export type CardsStrings = Record<ResultsCardsKey, string> & CardsBorrowedStrings;

type RawTranslator = { raw: (key: string) => unknown };

export function buildCardsStrings(t: RawTranslator, borrowed: CardsBorrowedStrings): CardsStrings {
  const own = Object.fromEntries(RESULTS_CARDS_KEYS.map((key) => [key, String(t.raw(`cards.${key}`))])) as Record<
    ResultsCardsKey,
    string
  >;
  return { ...own, ...borrowed };
}

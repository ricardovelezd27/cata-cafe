// The words of the organizer's Panel that package R5 added (`results.panel`),
// built ONCE on the server and passed to the client components as props (the
// project's i18n rule). Patterns with `{placeholders}` are read with `t.raw()`
// and filled in the browser. Everything the Panel already said (the exclusion
// card, its dialog, the late evaluations, the notes after the close, the
// alignment's title and help) keeps its own keys, unchanged.

export const RESULTS_PANEL_KEYS = [
  "pendingTitle",
  "pendingLateOne",
  "pendingLateMany",
  "pendingNotesOne",
  "pendingNotesMany",
  "pendingBoth",
  "pendingOpen",
  "matrixCaption",
  "matrixRegion",
  "group",
  "spread",
  "cell",
  "distOver1",
  "distOver2",
  "noTotal",
  "scrollHint",
  "pickCoffee",
  "phoneGroup",
  "phoneSpread",
  "alignCount",
] as const;

export type PanelStringKey = (typeof RESULTS_PANEL_KEYS)[number];
export type PanelStrings = Record<PanelStringKey, string>;

type RawTranslator = { raw: (key: string) => unknown };

export function buildPanelStrings(t: RawTranslator): PanelStrings {
  return Object.fromEntries(RESULTS_PANEL_KEYS.map((key) => [key, String(t.raw(`panel.${key}`))])) as PanelStrings;
}

/** "1 evaluación tardía por decidir y 2 notas después del cierre". */
export function pendingSentence(pending: { late: number; notes: number }, t: PanelStrings): string {
  const fill = (pattern: string, n: number) => pattern.replace("{n}", String(n));
  const late = pending.late === 0 ? null : pending.late === 1 ? t.pendingLateOne : fill(t.pendingLateMany, pending.late);
  const notes =
    pending.notes === 0 ? null : pending.notes === 1 ? t.pendingNotesOne : fill(t.pendingNotesMany, pending.notes);
  if (late && notes) return t.pendingBoth.replace("{a}", late).replace("{b}", notes);
  return late ?? notes ?? "";
}

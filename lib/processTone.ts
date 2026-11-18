// The one map from a coffee's process type to its family tone (DESIGN.md,
// "Colours for people, processes and formats"): a process is its name in ink
// with a DOT in one family tone, never a coloured pill with white text. Kept
// here so the coffees table and a coffee's page draw the same dot (T5, E-01).
//
// Each value is the name of a `--color-flavor-*` token (app/globals.css). The
// tone only tells processes apart at a glance; the name is always written next
// to it, so nothing is told by colour alone.

import type { PROCESS_TYPES } from "./constants";

type ProcessType = (typeof PROCESS_TYPES)[number];

export const PROCESS_TONE: Record<ProcessType, `--color-flavor-${string}`> = {
  Lavado: "--color-flavor-other", // was a blue
  Natural: "--color-flavor-fruity", // was an orange
  Honey: "--color-flavor-sweet", // was the old amber
  Anaeróbico: "--color-flavor-floral", // was a purple
  "Maceración Carbónica": "--color-flavor-floral", // was the same purple
  Láctico: "--color-flavor-sour", // fermentation; was a grey brown
  "Co-fermentación": "--color-flavor-sour", // fermentation; was the same grey brown
  Otro: "--color-flavor-roasted", // was the same grey brown
};

/** The tone of a process as a CSS colour (`var(--color-flavor-…)`). A process
 *  outside the list (an old free-text value) takes the tone of "Otro". */
export function processToneVar(type: string): string {
  const token = (PROCESS_TONE as Record<string, string>)[type] ?? PROCESS_TONE.Otro;
  return `var(${token})`;
}

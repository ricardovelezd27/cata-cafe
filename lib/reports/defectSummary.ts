// The defective cups of ONE sample, as counts (the overview's "Tazas con
// defecto" tile and the coffee's sheet). Pure: no Prisma, no React, no i18n.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import { defectTally } from "@/lib/cupDefects";
import { isAffectiveComplete } from "@/lib/scoring";

/** One evaluation of the sample, as the page already has it. No cupper key:
 *  each row is one cupper (an evaluation is unique per sample and cupper). */
export type DefectEvaluation = {
  excluded: boolean;
  submitted: boolean;
  /** The format's module JSON. */
  data: unknown;
  /** `Evaluation.cups`; null = stored before 2026-11 (the session's cups apply). */
  cups: number | null;
};

export type DefectSummary = {
  /** Included evaluations: sent, not excluded, complete. The "n" of the score. */
  n: number;
  /** How many of them flagged at least one defective cup. */
  cuppers: number;
  /** Defective cups over all of them. */
  cups: number;
  /** Cups by type, most cups first; `null` = no type recorded. Zeros left out. */
  types: { type: SensoryDefect | null; cups: number }[];
};

/**
 * Who flagged a defective cup on ONE sample, among the evaluations the group's
 * score pools (sent, not excluded, complete: `isAffectiveComplete`). It reads
 * the cups through `defectTally`, the one reader of "which cups were defective
 * and of which type". A descriptive session has no cups: null.
 */
export function buildDefectSummary(input: {
  format: string;
  cupsPerSample: number;
  evaluations: readonly DefectEvaluation[];
}): DefectSummary | null {
  if (input.format !== "affective" && input.format !== "combined") return null;
  const byType = new Map<SensoryDefect | null, number>();
  let n = 0;
  let cuppers = 0;
  let cups = 0;
  for (const ev of input.evaluations) {
    if (ev.submitted !== true || ev.excluded !== false) continue;
    if (typeof ev.data !== "object" || ev.data === null || Array.isArray(ev.data)) continue;
    const data = ev.data as Record<string, unknown>;
    if (!isAffectiveComplete(data)) continue;
    n += 1;
    const own = typeof ev.cups === "number" && Number.isFinite(ev.cups) ? ev.cups : input.cupsPerSample;
    const tally = defectTally(data, Math.max(0, Math.floor(own)));
    if (tally.total === 0) continue;
    cuppers += 1;
    cups += tally.total;
    for (const type of SENSORY_DEFECTS) {
      if (tally.byType[type] > 0) byType.set(type, (byType.get(type) ?? 0) + tally.byType[type]);
    }
    if (tally.unspecified > 0) byType.set(null, (byType.get(null) ?? 0) + tally.unspecified);
  }
  // Most cups first; equal counts in the order of SENSORY_DEFECTS, "no type" last.
  const order: (SensoryDefect | null)[] = [...SENSORY_DEFECTS, null];
  const types = order
    .filter((type) => (byType.get(type) ?? 0) > 0)
    .map((type) => ({ type, cups: byType.get(type) as number }))
    .sort((a, b) => b.cups - a.cups);
  return { n, cuppers, cups, types };
}

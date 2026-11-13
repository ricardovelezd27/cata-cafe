// Pure rules for editing and duplicating a session (S8-10). Dependency-free so
// vitest can cover them; the actions in app/actions/sessions.ts do the I/O.

import { planBlindOrder, finalSampleLabel, sampleLetterLabel } from "@/lib/blindLabels";

/** Format and cups feed the stored scores, so they freeze once the cupping is
 *  under way. C6 default (b): "Iniciar cata" (startedAt) freezes them as well
 *  as the first evaluation; adding samples stays allowed after the start. */
export function isFormatLocked(startedAt: Date | null | undefined, evaluationCount: number): boolean {
  return startedAt != null || evaluationCount > 0;
}

/** Only the fields that really differ from the stored session. The edit form
 *  re-posts the whole object; treating an unchanged value as a change made a
 *  harmless rename fail with `format_locked` once anyone had evaluated. */
export function changedFormatCups(
  current: { format: string; cupsPerSample: number },
  input: { format?: string; cupsPerSample?: number },
): { format?: string; cupsPerSample?: number } {
  const out: { format?: string; cupsPerSample?: number } = {};
  if (input.format !== undefined && input.format !== current.format) out.format = input.format;
  if (input.cupsPerSample !== undefined && input.cupsPerSample !== current.cupsPerSample) {
    out.cupsPerSample = input.cupsPerSample;
  }
  return out;
}

export type DuplicateSampleSource = {
  id: string;
  label: string;
  position: number;
  coffeeId: string | null;
  referenceRank: number | null;
};

export type DuplicateSamplePlan = {
  /** Id of the source sample this row was copied from. */
  sourceId: string;
  label: string;
  position: number;
  coffeeId: string | null;
  referenceRank: number | null;
};

/** Copies the samples for a duplicate. A coffee the caller can no longer use
 *  (anonymized, unshared) becomes a coffee-less sample, and EVERY reference
 *  rank travels with its sample (B8 default (a): all). A4: samples whose label
 *  is auto-generated ("Muestra B", empty) are re-shuffled with a fresh random
 *  order, so a duplicate never reuses the source's letter <-> coffee mapping;
 *  owner-typed labels keep their label and position. Returns the rows sorted by
 *  their NEW position and how many coffee links were dropped. */
export function planDuplicateSamples(
  samples: DuplicateSampleSource[],
  usableCoffeeIds: ReadonlySet<string>,
  random: (maxExclusive: number) => number,
  locale: string,
): { samples: DuplicateSamplePlan[]; droppedCoffees: number } {
  const ordered = [...samples].sort((a, b) => a.position - b.position);
  const order = planBlindOrder(ordered, random, "duplicate");
  let droppedCoffees = 0;
  const out = ordered.map((s, i) => {
    let coffeeId = s.coffeeId;
    if (coffeeId !== null && !usableCoffeeIds.has(coffeeId)) {
      coffeeId = null;
      droppedCoffees++;
    }
    return {
      sourceId: s.id,
      label: finalSampleLabel(s.label, order[i], locale),
      position: order[i].position,
      coffeeId,
      referenceRank: s.referenceRank,
    };
  });
  out.sort((a, b) => a.position - b.position);
  return { samples: out, droppedCoffees };
}

/** True when marking `targetId` as a (new) reference would rewrite ratings
 *  that cuppers already saved for it (B2 default (a): replace, but warn first).
 *  An existing reference is a no-op and never needs confirming. */
export function repinNeedsConfirm(opts: {
  isAlreadyReference: boolean;
  evaluationCount: number;
  confirmRepin: boolean;
}): boolean {
  if (opts.isAlreadyReference) return false;
  return opts.evaluationCount > 0 && !opts.confirmRepin;
}

/** Position for a new sample: one past the highest. Callers compute it INSIDE
 *  the transaction and retry on a unique-key collision. */
export function nextSamplePosition(maxPosition: number | null | undefined): number {
  return (maxPosition ?? -1) + 1;
}

export const MAX_SESSION_SAMPLES = 100;

/** Default label for a sample the owner adds without typing one: the LETTER of
 *  its position ("Muestra D"), the same form the wizard generates (A4). A single
 *  late-added sample is identifiable as the newest by nature; only the wizard,
 *  which places many samples at once, can shuffle them.
 *  TODO(kim-validar:A4) */
export function defaultSampleLabel(position: number, locale: string): string {
  return sampleLetterLabel(position, locale);
}

/** Final position of the copy of the source's ACTIVE reference sample (the
 *  pointer is re-aimed at the sample created at this position). null when the
 *  source had no active reference or it is not in the plan. */
export function activeCopyPosition(
  planned: readonly { sourceId: string; position: number }[],
  sourceReferenceSampleId: string | null,
): number | null {
  if (sourceReferenceSampleId === null) return null;
  return planned.find((s) => s.sourceId === sourceReferenceSampleId)?.position ?? null;
}

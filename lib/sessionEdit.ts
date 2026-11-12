// Pure rules for editing and duplicating a session (S8-10). Dependency-free so
// vitest can cover them; the actions in app/actions/sessions.ts do the I/O.

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
  label: string;
  position: number;
  coffeeId: string | null;
  referenceRank: number | null;
};

export type DuplicateSamplePlan = {
  label: string;
  position: number;
  coffeeId: string | null;
  referenceRank: number | null;
};

/** Copies the samples for a duplicate: a coffee the caller can no longer use
 *  (anonymized, unshared) becomes a coffee-less sample with its label kept,
 *  and EVERY reference rank travels (B8 default (a): all). Returns how many
 *  coffee links were dropped so the edit page can say so. */
export function planDuplicateSamples(
  samples: DuplicateSampleSource[],
  usableCoffeeIds: ReadonlySet<string>,
): { samples: DuplicateSamplePlan[]; droppedCoffees: number } {
  let droppedCoffees = 0;
  const out = samples.map((s) => {
    let coffeeId = s.coffeeId;
    if (coffeeId !== null && !usableCoffeeIds.has(coffeeId)) {
      coffeeId = null;
      droppedCoffees++;
    }
    return {
      label: s.label,
      position: s.position,
      coffeeId,
      referenceRank: s.referenceRank,
    };
  });
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

/** Default label for a sample the owner adds without typing one.
 *  TODO(A4): wizard labels stay "Muestra N" until Kim decides on random blind codes. */
export function defaultSampleLabel(position: number, locale: string): string {
  return `${locale === "en" ? "Sample" : "Muestra"} ${position + 1}`;
}

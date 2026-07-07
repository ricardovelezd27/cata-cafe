import { STEP_ATTRIBUTES, type CuppingStep } from "@/lib/constants";

// Client-side completeness checks for the cupping module. Powers the "you missed
// X" guardrail popups on next-sample navigation and on final submit. Framework-
// free and pure so it can be unit-tested and shared. Only the scored/required
// fields count as "missing" — free-text notes are always optional, and the beta
// Physical/Extrinsic modules are out of scope.

type Data = Record<string, unknown>;

export type CuppingFormat = "affective" | "descriptive" | "combined";

export type SampleModules = {
  affective: Data;
  descriptive: Data;
  combined: Data;
};

// Matches the emptiness convention used by hasStepFill in CupClient: a rating
// is "set" only when it is neither null nor undefined.
const hasValue = (v: unknown): boolean => v !== null && v !== undefined;

const hasDescriptors = (v: unknown): boolean =>
  Array.isArray(v) && v.length > 0;

/**
 * Returns the affectiveIds of the sections in `step` that are incomplete for the
 * active format. Empty array → the step is fully complete for this sample.
 */
export function stepMissing(
  data: SampleModules,
  step: CuppingStep,
  format: CuppingFormat,
): string[] {
  const attrs = STEP_ATTRIBUTES[step];
  const missing: string[] = [];

  for (const attr of attrs) {
    const { descriptiveId, affectiveId } = attr;

    if (format === "affective") {
      // Pure-affective form only collects the 1–9 rating.
      if (!hasValue(data.affective[`${affectiveId}_final`])) {
        missing.push(affectiveId);
      }
      continue;
    }

    if (format === "descriptive") {
      // Descriptive format has no `overall` step and no affective ratings —
      // require the intensity slider and at least one descriptor.
      if (!descriptiveId) continue;
      const intMissing = !hasValue(data.descriptive[`${descriptiveId}_int`]);
      const descMissing = !hasDescriptors(data.descriptive[`${descriptiveId}_desc`]);
      if (intMissing || descMissing) missing.push(affectiveId);
      continue;
    }

    // combined: require the rating, plus intensity + descriptors when the
    // section has a descriptive half (the `overall` step does not).
    const ratingMissing = !hasValue(data.combined[`${affectiveId}_final`]);
    let descriptiveMissing = false;
    if (descriptiveId) {
      const intMissing = !hasValue(data.combined[`${descriptiveId}_int`]);
      const descMissing = !hasDescriptors(data.combined[`${descriptiveId}_desc`]);
      descriptiveMissing = intMissing || descMissing;
    }
    if (ratingMissing || descriptiveMissing) missing.push(affectiveId);
  }

  // "Gustos Predominantes" (main tastes) is a standalone CATA field rendered
  // alongside sabor/sabor_residual in taste_aftertaste — not paired with an
  // affectiveId in STEP_ATTRIBUTES, and not present in the pure-affective form.
  if (step === "taste_aftertaste" && format !== "affective") {
    const bucket = format === "descriptive" ? data.descriptive : data.combined;
    if (!hasDescriptors(bucket.gustos)) missing.push("gustos");
  }

  return missing;
}

export type SampleGap = { sampleLabel: string; sections: string[] };

/**
 * Session-wide roll-up for the submit gate: one entry per sample that still has
 * gaps, listing the (de-duplicated) affectiveIds missing across all steps.
 */
export function sessionMissing(
  samples: ({ label: string } & SampleModules)[],
  steps: CuppingStep[],
  format: CuppingFormat,
): SampleGap[] {
  const gaps: SampleGap[] = [];

  for (const sample of samples) {
    const sections = new Set<string>();
    for (const step of steps) {
      for (const id of stepMissing(sample, step, format)) sections.add(id);
    }
    if (sections.size > 0) {
      gaps.push({ sampleLabel: sample.label, sections: [...sections] });
    }
  }

  return gaps;
}

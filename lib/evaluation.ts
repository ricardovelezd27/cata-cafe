import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";
import { asSessionFormat } from "@/lib/constants";
import { cupFlags } from "@/lib/validate";
import { EXPRESS_NOTE_KEY, EXPRESS_NOTE_MAX } from "@/lib/expressSession";

export type EvalModuleKey = "descriptive" | "affective" | "combined";

/** Which JSON column a session's evaluations live in — derived from the
 *  session's format on the server, never taken from the client. Mirrors the
 *  form the client renders (CupClient: descriptive → DescriptiveForm,
 *  affective → AffectiveForm, anything else → CombinedForm) and the CASE in
 *  recompute_aggregate_score(). */
export function moduleKeyForFormat(format: string): EvalModuleKey {
  const f = asSessionFormat(format);
  return f === "descriptive" ? "descriptive" : f === "affective" ? "affective" : "combined";
}

/** Largest serialized module JSON one evaluation may carry. A real form is a
 *  few KB; this only stops a tampered client from storing megabytes. */
export const MAX_MODULE_JSON_CHARS = 64_000;

/** Bounds on the free-form parts of a module (S8-10 T11, F-express-5): the
 *  express note is capped at EXPRESS_NOTE_MAX and the whole serialized module
 *  at MAX_MODULE_JSON_CHARS. Throws Error("invalid_input") — live autosave and
 *  the offline replay share this, so both reject the same payloads. */
export function assertModuleBounds(data: Record<string, unknown>): void {
  const note = data[EXPRESS_NOTE_KEY];
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || note.length > EXPRESS_NOTE_MAX) {
      throw new Error("invalid_input");
    }
  }
  if (JSON.stringify(data).length > MAX_MODULE_JSON_CHARS) {
    throw new Error("invalid_input");
  }
}

// Single source of truth for the Evaluation row shape derived from a module's
// JSON data. Shared by `upsertEvaluation` (live autosave) and `syncEvaluation`
// (offline replay) so both compute scores and flatten defect/uniformity arrays
// identically. Returns the Prisma create/update payload (minus the row's
// identity keys); never touches `isDraft`/`submittedAt`.
//
// `cupsPerSample` MUST come from the session row: it decides whether the
// uniformity/defect penalties apply at all (≥5 cups, lib/scoring.ts), so a
// client-supplied value could inflate the stored individual score.
export function computeEvaluationDerived(
  moduleKey: EvalModuleKey,
  data: Record<string, unknown>,
  cupsPerSample: number,
) {
  const dataField =
    moduleKey === "descriptive"
      ? "descriptiveData"
      : moduleKey === "affective"
        ? "affectiveData"
        : "combinedData";

  assertModuleBounds(data);

  // Clamp the cup arrays to the session's cup count before anything reads
  // them: an over-long or non-boolean array would either crash the Boolean[]
  // column or let one cupper drive a sample's community score to zero.
  const nonUniformCups = cupFlags(data.tazas_no_uniformes, cupsPerSample);
  const defectiveCups = cupFlags(data.tazas_defectuosas, cupsPerSample);
  const defectTypes = Array.isArray(data.defecto_tipo)
    ? (data.defecto_tipo as unknown[])
        .filter((v): v is string => typeof v === "string")
        .slice(0, 20)
    : [];
  const normalized: Record<string, unknown> = {
    ...data,
    tazas_no_uniformes: nonUniformCups,
    tazas_defectuosas: defectiveCups,
    defecto_tipo: defectTypes,
  };

  const { sum } = calcAffectiveSum(normalized);
  const rawScore = moduleKey === "descriptive" ? null : calcRawScore(normalized);
  const individual = calcIndividualScore(normalized, cupsPerSample);
  const individualScore = individual === "—" ? null : individual;

  return {
    [dataField]: normalized,
    nonUniformCups,
    defectiveCups,
    defectTypes,
    affectiveSum: sum || null,
    rawScore,
    individualScore,
  };
}

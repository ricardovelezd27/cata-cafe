import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";
import { asSessionFormat } from "@/lib/constants";
import { cupFlags } from "@/lib/validate";

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

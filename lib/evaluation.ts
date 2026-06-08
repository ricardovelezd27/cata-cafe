import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";

export type EvalModuleKey = "descriptive" | "affective" | "combined";

// Single source of truth for the Evaluation row shape derived from a module's
// JSON data. Shared by `upsertEvaluation` (live autosave) and `syncEvaluation`
// (offline replay) so both compute scores and flatten defect/uniformity arrays
// identically. Returns the Prisma create/update payload (minus the row's
// identity keys); never touches `isDraft`/`submittedAt`.
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

  const { sum } = calcAffectiveSum(data);
  const rawScore = moduleKey === "descriptive" ? null : calcRawScore(data);
  const individual = calcIndividualScore(data, cupsPerSample);
  const individualScore = individual === "—" ? null : individual;

  const nonUniformCups = (data.tazas_no_uniformes as boolean[] | undefined) ?? [];
  const defectiveCups = (data.tazas_defectuosas as boolean[] | undefined) ?? [];
  const defectTypes = (data.defecto_tipo as string[] | undefined) ?? [];

  return {
    [dataField]: data,
    nonUniformCups,
    defectiveCups,
    defectTypes,
    affectiveSum: sum || null,
    rawScore,
    individualScore,
  };
}

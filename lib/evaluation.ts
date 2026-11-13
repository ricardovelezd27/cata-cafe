import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES, asSessionFormat } from "@/lib/constants";
import { cupDefectTypes, cupFlags } from "@/lib/validate";
import { DEFECT_TYPE_KEY, distinctDefectTypes } from "@/lib/cupDefects";
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

/** Lowest / highest value of the CVA affective scale. */
export const AFFECTIVE_MIN = 1;
export const AFFECTIVE_MAX = 9;

/** The module keys the scorer (lib/scoring.ts) and the SQL trigger /
 *  is_affective_complete cast with ::numeric: `<attr>_final` and the base
 *  `<attr>` for each of the 8 affective attributes. */
export function affectiveRatingKeys(): string[] {
  return AFFECTIVE_ATTRIBUTES.flatMap((a) => [`${a.id}_final`, a.id]);
}

/**
 * B-01 (S8-22): server-side bound on every affective rating. A finite number is
 * rounded to the nearest integer (4.6 -> 5; halves round up) and clamped to
 * 1..9; a non-number (string, null, NaN, Infinity, object, boolean) is REMOVED,
 * i.e. treated as "not rated", and is never stored: a non-numeric string would
 * make the trigger's ::numeric cast raise and block the sample's aggregate.
 * Returns a new object; valid data passes through untouched. It is applied by
 * the one shared derivation, so the live and offline paths cannot diverge.
 */
export function sanitizeAffectiveRatings(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const key of affectiveRatingKeys()) {
    if (!(key in out)) continue;
    const v = out[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.min(AFFECTIVE_MAX, Math.max(AFFECTIVE_MIN, Math.round(v)));
    } else {
      delete out[key];
    }
  }
  return out;
}

/** Offline-replay wrapper: returns the derived fields, or `null` when the
 *  payload is rejected with `invalid_input`. Any other error propagates. */
export function tryComputeEvaluationDerived(
  moduleKey: EvalModuleKey,
  data: Record<string, unknown>,
  cupsPerSample: number,
): ReturnType<typeof computeEvaluationDerived> | null {
  try {
    return computeEvaluationDerived(moduleKey, data, cupsPerSample);
  } catch (e) {
    if (e instanceof Error && e.message === "invalid_input") return null;
    throw e;
  }
}

// Single source of truth for the Evaluation row shape derived from a module's
// JSON data. Shared by `upsertEvaluation` (live autosave) and `syncEvaluation`
// (offline replay) so both compute scores and flatten defect/uniformity arrays
// identically. Returns the Prisma create/update payload (minus the row's
// identity keys); never touches `isDraft`/`submittedAt`.
//
// `cupsPerSample` MUST come from the session row: it sizes the cup arrays and
// the deduction (lib/scoring.ts cupDeduction), so a client-supplied value could
// distort the stored individual score. It is also stored on the row as `cups`
// (S10 WP1a): the SQL trigger pools the group's cups from that column.
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
  // With ONE cup uniformity does not exist: the flags are stored all false.
  let nonUniformCups =
    cupsPerSample >= 2
      ? cupFlags(data.tazas_no_uniformes, cupsPerSample)
      : cupFlags(data.tazas_no_uniformes, cupsPerSample).map(() => false);
  let defectiveCups = cupFlags(data.tazas_defectuosas, cupsPerSample);
  let defectTypes = Array.isArray(data.defecto_tipo)
    ? (data.defecto_tipo as unknown[])
        .filter((v): v is string => typeof v === "string")
        .slice(0, 20)
    : [];
  const normalized: Record<string, unknown> = { ...sanitizeAffectiveRatings(data) };

  // S10 WP1b: a module that carries the per-cup defect type key is the new
  // shape. A cup counts as defective ONLY where its flag is true AND its type
  // is set (the form cannot produce a flagged cup without a type; a tampered
  // or half-synced payload must not create an untyped defect); a type on an
  // unflagged cup is cleared; with 2+ cups a defective cup is also
  // non-uniform; `defecto_tipo` and the `defectTypes` column are DERIVED from
  // the per-cup types. A module WITHOUT the key is a legacy blob and is left
  // exactly as it was posted. TODO(kim-validar:A3)
  if (DEFECT_TYPE_KEY in data) {
    const n = Math.max(0, Math.floor(cupsPerSample));
    const flags = cupFlags(data.tazas_defectuosas, n);
    const rawTypes = cupDefectTypes(data[DEFECT_TYPE_KEY], n);
    const nuFlags = cupFlags(data.tazas_no_uniformes, n);
    const cupTypes = rawTypes.map((t, i) => (flags[i] === true ? t : null));
    defectiveCups = cupTypes.map((t) => t !== null);
    nonUniformCups = Array.from({ length: n }, (_, i) =>
      n >= 2 ? nuFlags[i] === true || defectiveCups[i] : false,
    );
    defectTypes = distinctDefectTypes(cupTypes, defectiveCups);
    normalized[DEFECT_TYPE_KEY] = cupTypes;
  }
  normalized.tazas_no_uniformes = nonUniformCups;
  normalized.tazas_defectuosas = defectiveCups;
  normalized.defecto_tipo = defectTypes;

  const { sum } = calcAffectiveSum(normalized);
  const rawScore = moduleKey === "descriptive" ? null : calcRawScore(normalized);
  const individual = calcIndividualScore(normalized, cupsPerSample);
  const individualScore = individual === "—" ? null : individual;

  return {
    [dataField]: normalized,
    nonUniformCups,
    defectiveCups,
    defectTypes,
    cups: cupsPerSample,
    affectiveSum: sum || null,
    rawScore,
    individualScore,
  };
}

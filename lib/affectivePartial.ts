// S10 WP3b (Kim C4 "no evaluado" per section, A5 the value "as it cooled").
// TODO(kim-validar:C4) TODO(kim-validar:A5) the answers behind this are SIMULATED.
//
// Pure and dependency-light (constants only). Three key families live in the
// affective module JSON of an evaluation (no column):
//   <attr>_ne      = true   the cupper could not judge that section
//   <attr>_inicial = 1..9   the FIRST value the cupper gave (display-only)
//   <attr>_final            stays THE value every score reads (unchanged)
// `<attr>` is an id of AFFECTIVE_ATTRIBUTES. Only `_final` (then the bare `<attr>`)
// is ever scored; `_inicial` is never read by scoring, completeness or the trigger.
//
// A "declared partial" evaluation: at least one section marked `_ne === true`, at
// least one rated, and every section EITHER rated OR marked. It has no total. An
// old incomplete evaluation (no marker) is NOT a declared partial and behaves
// exactly as before: the marker gates everything. SQL twin:
// public.is_affective_declared_partial (PHASE 29); keep the two in step.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

type Data = Record<string, unknown>;

export const NE_SUFFIX = "_ne";
export const INICIAL_SUFFIX = "_inicial";
const MIN = 1;
const MAX = 9;

export const neKey = (id: string) => `${id}${NE_SUFFIX}`;
export const inicialKey = (id: string) => `${id}${INICIAL_SUFFIX}`;

/** A rating exactly as the scorer and `is_affective_complete` read it:
 *  `<id>_final`, else the bare `<id>`; counts only when finite and > 0. */
function rated(data: Data, id: string): boolean {
  const v = Number(data[`${id}_final`] ?? data[id] ?? 0);
  return Number.isFinite(v) && v > 0;
}

/** The section is marked "no evaluado": ONLY the literal boolean true counts. */
export function isNotEvaluated(data: Data | null | undefined, id: string): boolean {
  return !!data && data[neKey(id)] === true;
}

/** Ids of the sections currently marked "no evaluado". */
export function notEvaluatedIds(data: Data | null | undefined): string[] {
  return AFFECTIVE_ATTRIBUTES.filter((a) => isNotEvaluated(data, a.id)).map((a) => a.id);
}

/**
 * C4: a PARTIAL evaluation the cupper declared. At least one `_ne === true`, at
 * least one section rated, and every section is EITHER rated OR marked. A
 * section that is neither keeps the evaluation as incomplete as it always was.
 * (`isAffectiveComplete` is unchanged and still means "all 8 rated".)
 */
export function isAffectiveDeclaredPartial(data: Data | null | undefined): boolean {
  if (!data) return false;
  let marked = 0;
  let ratedCount = 0;
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const r = rated(data, attr.id);
    const m = isNotEvaluated(data, attr.id);
    if (r) ratedCount += 1;
    if (m) marked += 1;
    if (!r && !m) return false;
  }
  return marked >= 1 && ratedCount >= 1;
}

/** Whether a section feeds the per-attribute averages / radar of this
 *  evaluation: it is rated, and the evaluation is complete or declared partial. */
export function attributeCounts(data: Data, id: string, completeOrPartial: boolean): boolean {
  return completeOrPartial && rated(data, id);
}

/**
 * Derivation step (computeEvaluationDerived, after the ratings were sanitized):
 * for every section whose `_ne` is exactly `true` DELETE its rating keys
 * (`<id>_final`, `<id>`, `<id>_inicial`) so a stale value can never be read;
 * any other `_ne` value is dropped (only the literal true is stored). Returns a
 * new object; data without any `_ne` key passes through untouched.
 */
export function applyNotEvaluated(data: Data): Data {
  const out: Data = { ...data };
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const k = neKey(attr.id);
    if (!(k in out)) continue;
    if (out[k] === true) {
      delete out[`${attr.id}_final`];
      delete out[attr.id];
      delete out[inicialKey(attr.id)];
    } else {
      delete out[k];
    }
  }
  return out;
}

/**
 * A5: the first value given, display-only. Clamped to 1..9 (rounded); a non-number
 * is removed; it is dropped when it equals `_final` (nothing changed) or when
 * there is no `_final` to compare it with. Never read by anything that scores.
 */
export function sanitizeCooledValues(data: Data): Data {
  const out: Data = { ...data };
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    const k = inicialKey(attr.id);
    if (!(k in out)) continue;
    const v = out[k];
    const final = Number(out[`${attr.id}_final`]);
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isFinite(final) || final <= 0) {
      delete out[k];
      continue;
    }
    const clamped = Math.min(MAX, Math.max(MIN, Math.round(v)));
    if (clamped === final) delete out[k];
    else out[k] = clamped;
  }
  return out;
}

/** The pair to display, "7 → 8", or null when there is no cooled value. */
export function cooledPair(data: Data | null | undefined, id: string): { from: number; to: number } | null {
  if (!data) return null;
  const from = data[inicialKey(id)];
  const to = Number(data[`${id}_final`]);
  if (typeof from !== "number" || !Number.isFinite(from) || !Number.isFinite(to) || to <= 0 || from === to) return null;
  return { from, to };
}

// ---- form transitions (pure; the forms call these through onChange) --------

/** Toggle "No evaluado": on clears the section's values, off re-opens it empty. */
export function setNotEvaluated(data: Data, id: string, on: boolean): Data {
  const out: Data = { ...data };
  if (on) {
    out[neKey(id)] = true;
    delete out[`${id}_final`];
    delete out[id];
    delete out[inicialKey(id)];
  } else {
    delete out[neKey(id)];
  }
  return out;
}

/** "¿Cambió al enfriarse?": the current value moves to `_inicial`, the new one becomes `_final`. */
export function setCooledValue(data: Data, id: string, next: number): Data {
  const out: Data = { ...data };
  const current = Number(out[`${id}_final`]);
  const first = typeof out[inicialKey(id)] === "number" ? (out[inicialKey(id)] as number) : current;
  if (!Number.isFinite(first) || first <= 0) {
    out[`${id}_final`] = next;
    return out;
  }
  out[`${id}_final`] = next;
  if (next === first) delete out[inicialKey(id)];
  else out[inicialKey(id)] = first;
  return out;
}

/** "Quitar": restores the single value (the `_final` stays). */
export function clearCooledValue(data: Data, id: string): Data {
  const out: Data = { ...data };
  delete out[inicialKey(id)];
  return out;
}

/** True when the module carries any of the three key families the reference pin must clear. */
export function hasPartialKeys(data: Data): boolean {
  return AFFECTIVE_ATTRIBUTES.some((a) => neKey(a.id) in data || inicialKey(a.id) in data);
}

/** Reference pin: clear every `_ne` and `_inicial` (the pinned anchor is all 5). */
export function clearPartialKeys(data: Data): Data {
  const out: Data = { ...data };
  for (const a of AFFECTIVE_ATTRIBUTES) {
    delete out[neKey(a.id)];
    delete out[inicialKey(a.id)];
  }
  return out;
}

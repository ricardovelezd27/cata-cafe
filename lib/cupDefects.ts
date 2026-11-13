import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import { cupDefectTypes, cupFlags } from "@/lib/validate";

/**
 * Per-cup defect types (S10 WP1b). Pure rules shared by the cup forms, the
 * results line and (next PR) the coffee tally. The module JSON carries
 * `tazas_defecto_tipo`: one entry per cup, a SENSORY_DEFECTS id or null. JSON
 * only, on purpose (no column). Old evaluations have no such key: their
 * defective cups are "unspecified".
 * TODO(kim-validar:A3): the three defect types are Kim's simulated answer.
 */

export const DEFECT_TYPE_KEY = "tazas_defecto_tipo";

export type DefectTally = {
  byType: Record<SensoryDefect, number>;
  /** Defective cups with no type (legacy evaluations, or a half-synced draft). */
  unspecified: number;
  /** Defective cups = sum of byType + unspecified. Only the first `cups`
   *  flags are read (cupFlags pads/cuts to `cups`). */
  total: number;
};

/** Which cups were defective and of which type. Reads both shapes:
 *  - key present: a flagged cup counts under its type (or "unspecified" when
 *    its entry is null);
 *  - key absent (legacy): every flagged cup is "unspecified".
 *  Types on unflagged cups are ignored. */
export function defectTally(data: Record<string, unknown> | null | undefined, cups: number): DefectTally {
  const byType = Object.fromEntries(SENSORY_DEFECTS.map((d) => [d, 0])) as Record<SensoryDefect, number>;
  let unspecified = 0;
  const flags = cupFlags(data?.tazas_defectuosas, cups);
  const typed = !!data && DEFECT_TYPE_KEY in data;
  const types = typed ? cupDefectTypes(data?.[DEFECT_TYPE_KEY], cups) : [];
  flags.forEach((flagged, i) => {
    if (!flagged) return;
    const t = typed ? types[i] : null;
    if (t) byType[t] += 1;
    else unspecified += 1;
  });
  const total = unspecified + SENSORY_DEFECTS.reduce((a, d) => a + byType[d], 0);
  return { byType, unspecified, total };
}

/** The distinct defect types of the flagged, typed cups, in SENSORY_DEFECTS order. */
export function distinctDefectTypes(types: readonly (SensoryDefect | null)[], flags: readonly boolean[]): SensoryDefect[] {
  return SENSORY_DEFECTS.filter((d) => types.some((t, i) => t === d && flags[i] === true));
}

/** The per-cup state as the form holds it, padded to `cups`. For a legacy
 *  draft (key absent) flagged cups get the single legacy `defecto_tipo` when
 *  there is exactly one, else null (the form shows them as "pick a type"). */
export function formCupState(data: Record<string, unknown>, cups: number) {
  const flags = cupFlags(data.tazas_defectuosas, cups);
  const defective = Array.from({ length: cups }, (_, i) => flags[i] === true);
  const nu = cupFlags(data.tazas_no_uniformes, cups);
  const nonUniform = Array.from({ length: cups }, (_, i) => nu[i] === true);
  let types: (SensoryDefect | null)[];
  if (DEFECT_TYPE_KEY in data) {
    types = cupDefectTypes(data[DEFECT_TYPE_KEY], cups);
  } else {
    const legacy = cupDefectTypes(Array.isArray(data.defecto_tipo) && data.defecto_tipo.length === 1 ? [data.defecto_tipo[0]] : [], 1)[0] ?? null;
    types = Array.from({ length: cups }, (_, i) => (defective[i] ? legacy : null));
  }
  return { defective, nonUniform, types };
}

function withCups(
  data: Record<string, unknown>,
  cups: number,
  state: { defective: boolean[]; nonUniform: boolean[]; types: (SensoryDefect | null)[] },
): Record<string, unknown> {
  return {
    ...data,
    tazas_defectuosas: state.defective,
    tazas_no_uniformes: cups >= 2 ? state.nonUniform : state.nonUniform.map(() => false),
    [DEFECT_TYPE_KEY]: state.types,
    defecto_tipo: distinctDefectTypes(state.types, state.defective),
  };
}

/** The cupper picked a defect type for a cup (marks it defective, and also
 *  non-uniform with 2+ cups) or removed the mark (`type` null: clears the flag
 *  and the type; non-uniformity is left as it was). */
export function applyDefectChoice(
  data: Record<string, unknown>,
  cups: number,
  idx: number,
  type: SensoryDefect | null,
): Record<string, unknown> {
  if (idx < 0 || idx >= cups) return data;
  const s = formCupState(data, cups);
  s.defective[idx] = type !== null;
  s.types[idx] = type;
  if (type !== null && cups >= 2) s.nonUniform[idx] = true;
  return withCups(data, cups, s);
}

/** Tap on the non-uniform row: marking sets it; unmarking also clears a defect
 *  on that cup (a defective cup is always non-uniform). */
export function applyNonUniformToggle(
  data: Record<string, unknown>,
  cups: number,
  idx: number,
): Record<string, unknown> {
  if (idx < 0 || idx >= cups || cups < 2) return data;
  const s = formCupState(data, cups);
  if (s.nonUniform[idx]) {
    s.nonUniform[idx] = false;
    s.defective[idx] = false;
    s.types[idx] = null;
  } else {
    s.nonUniform[idx] = true;
  }
  return withCups(data, cups, s);
}

/** Where keyboard focus goes when the type chooser's open cup changes: into
 *  the chooser (its first type) when it opens or moves to another cup, back to
 *  the cup's button when it closes, nowhere when nothing changed. */
export function pickerFocusTarget(
  prev: number | null,
  next: number | null,
): { to: "type" } | { to: "cup"; idx: number } | null {
  if (prev === next) return null;
  if (next !== null) return { to: "type" };
  return prev === null ? null : { to: "cup", idx: prev };
}

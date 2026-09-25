// Rules that give the "muestra de referencia" (control sample) its role in
// the cupping flow. Pure — no Prisma, no React — shared by the server write
// path (upsertEvaluation / syncEvaluation), the cup client, the results page,
// the PDF/print builders and the vitest suite.
//
// 1. ORDER: the reference is cupped FIRST so the room levels on a common
//    anchor before comparing. Everything that lists samples for a session
//    (tabs, results tables, PDF sheets) puts it first; the rest keep their
//    position order.
// 2. PIN: the reference's affective quality is fixed at 5 ("ni alto ni bajo")
//    on every attribute and its cup checks are cleared, so every cupper gives
//    it exactly 79.00 and the descriptive side is the only thing they fill.
//    Enforced server-side for every save of that sample (a tampered client
//    cannot move the anchor) and mirrored client-side so the bubbles render
//    locked. Descriptive-only sessions have no quality ratings, so nothing
//    is pinned there.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

export const REFERENCE_PIN_VALUE = 5;

/** Reference first, then the others in their existing order. Stable for
 *  `null` or an unknown id (returns the same order). */
export function orderReferenceFirst<T extends { id: string }>(
  samples: readonly T[],
  referenceId: string | null | undefined,
): T[] {
  if (!referenceId) return [...samples];
  const ref = samples.find((s) => s.id === referenceId);
  if (!ref) return [...samples];
  return [ref, ...samples.filter((s) => s.id !== referenceId)];
}

/** Which evaluation modules carry affective ratings and therefore get pinned. */
export function isPinnedModule(moduleKey: string): moduleKey is "affective" | "combined" {
  return moduleKey === "affective" || moduleKey === "combined";
}

/** Returns a copy of `data` with every affective `<attr>_final` set to 5 and
 *  the cup arrays cleared (no non-uniform / defective cups, no defect types).
 *  Descriptive fields, notes and everything else are left untouched. */
export function pinReferenceAffective(
  data: Record<string, unknown>,
  cupsPerSample: number,
): Record<string, unknown> {
  const cups = Math.max(0, Math.floor(cupsPerSample));
  const pinned: Record<string, unknown> = { ...data };
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    pinned[`${attr.id}_final`] = REFERENCE_PIN_VALUE;
  }
  pinned.tazas_no_uniformes = Array(cups).fill(false);
  pinned.tazas_defectuosas = Array(cups).fill(false);
  pinned.defecto_tipo = [];
  return pinned;
}

/** True when every affective rating already sits at the pin value and no cup
 *  is marked — i.e. `pinReferenceAffective` would be a no-op. */
export function isReferencePinned(data: Record<string, unknown>): boolean {
  const allFive = AFFECTIVE_ATTRIBUTES.every(
    (attr) => data[`${attr.id}_final`] === REFERENCE_PIN_VALUE,
  );
  const noCups = (["tazas_no_uniformes", "tazas_defectuosas"] as const).every((k) => {
    const v = data[k];
    return !Array.isArray(v) || v.every((x) => x !== true);
  });
  return allFive && noCups;
}

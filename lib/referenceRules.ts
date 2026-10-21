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
import { computeEvaluationDerived } from "@/lib/evaluation";

export const REFERENCE_PIN_VALUE = 5;

// ─── Multi-reference (S6) ─────────────────────────────────────────────────────
// References ACCUMULATE: SessionSample.referenceRank is 1, 2, 3 in the order
// the owner named them (null = not a reference) and CuppingSession
// .referenceSampleId always points at the ACTIVE one (highest rank). Only the
// active reference is pinned at 79.00 — earlier ones keep the pinned data
// their cuppers already saved but unlock. Display-only: scoring never reads it.

/** Practical maximum number of references per session. */
export const MAX_REFERENCES = 3;

export type RankedSample = { id: string; referenceRank?: number | null };

/** The references of a session, ordered by rank (R1 first). */
export function referencesOf<T extends RankedSample>(samples: readonly T[]): T[] {
  return samples
    .filter((s) => typeof s.referenceRank === "number")
    .sort((a, b) => (a.referenceRank as number) - (b.referenceRank as number));
}

/** Id of the active reference (the one with the highest rank), or null. */
export function activeReferenceId(samples: readonly RankedSample[]): string | null {
  const refs = referencesOf(samples);
  return refs.length ? refs[refs.length - 1].id : null;
}

/** All references first by rank (R1, R2…), then the rest in their existing
 *  order. Stable when there are none. */
export function orderReferencesFirst<T extends RankedSample>(samples: readonly T[]): T[] {
  const refs = referencesOf(samples);
  if (refs.length === 0) return [...samples];
  const ids = new Set(refs.map((r) => r.id));
  return [...refs, ...samples.filter((s) => !ids.has(s.id))];
}

/** "R1" / "R2" badge text for a rank (null → null). */
export function referenceTag(rank: number | null | undefined): string | null {
  return typeof rank === "number" ? `R${rank}` : null;
}

/** Badge text for a reference: the plain label while it is the only one,
 *  "Referencia 1" / "Referencia 2" once there are several. */
export function referenceBadgeText(
  base: string,
  rank: number | null | undefined,
  total: number,
): string {
  return total > 1 && typeof rank === "number" ? `${base} ${rank}` : base;
}

/** What `setReferenceSample(sessionId, sampleId)` must do for a NON-null id. */
export type AddReferencePlan =
  | { kind: "noop"; activeId: string | null }
  | { kind: "full" }
  | { kind: "add"; rank: number; activeId: string };

export function planAddReference(
  samples: readonly RankedSample[],
  targetId: string,
): AddReferencePlan {
  const refs = referencesOf(samples);
  if (refs.some((r) => r.id === targetId)) {
    return { kind: "noop", activeId: activeReferenceId(samples) };
  }
  if (refs.length >= MAX_REFERENCES) return { kind: "full" };
  const rank = refs.length ? (refs[refs.length - 1].referenceRank as number) + 1 : 1;
  return { kind: "add", rank, activeId: targetId };
}

/** `setReferenceSample(sessionId, null)`: removes ONLY the active reference;
 *  the previous one becomes active again. `ranks` is the renumbering of the
 *  survivors (dense 1..n, ascending — apply in this order to respect the
 *  (sessionId, referenceRank) unique key). */
export function planRemoveActive(samples: readonly RankedSample[]): {
  removeId: string | null;
  activeId: string | null;
} {
  const refs = referencesOf(samples);
  if (refs.length === 0) return { removeId: null, activeId: null };
  return {
    removeId: refs[refs.length - 1].id,
    activeId: refs.length > 1 ? refs[refs.length - 2].id : null,
  };
}

/** Dense renumbering (1..n by current rank) after a reference sample row is
 *  deleted. Only entries whose rank changes are returned. */
export function compactReferenceRanks(
  samples: readonly RankedSample[],
): { id: string; rank: number }[] {
  return referencesOf(samples)
    .map((s, i) => ({ id: s.id, rank: i + 1, current: s.referenceRank as number }))
    .filter((r) => r.rank !== r.current)
    .map(({ id, rank }) => ({ id, rank }));
}

/** Which reference the Δ chips compare against: the user's pick when it is
 *  still a reference, otherwise the active one. */
export function resolveCompareReference(
  samples: readonly RankedSample[],
  chosenId: string | null | undefined,
): string | null {
  if (chosenId && referencesOf(samples).some((r) => r.id === chosenId)) return chosenId;
  return activeReferenceId(samples);
}

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

/** Re-pin plan for a reference chosen MID-SESSION (S6 CP-C2): the rows every
 *  cupper already wrote for the new reference must become the 79.00 anchor.
 *  Pure — `setReferenceSample` applies the returned updates inside its
 *  transaction. For each evaluation whose module JSON is not already pinned,
 *  returns the full derived payload (`computeEvaluationDerived`, same as a
 *  live save) PLUS `isDraft` echoed unchanged: `trg_recompute_aggregate` is
 *  `AFTER INSERT OR UPDATE OF "isDraft" … WHEN NEW."isDraft" = false`, so
 *  naming the column in SET is what makes the community score recompute for
 *  submitted rows. This is the ONE sanctioned server-side rewrite of a
 *  submitted evaluation. Descriptive-only sessions return []. The previous
 *  reference is never un-pinned (its real scores were never stored). */
export function planReferenceRepin<
  E extends {
    id: string;
    isDraft: boolean;
    affectiveData: unknown;
    combinedData: unknown;
  },
>(
  evaluations: readonly E[],
  moduleKey: string,
  cupsPerSample: number,
): { id: string; data: Record<string, unknown> & { isDraft: boolean } }[] {
  if (!isPinnedModule(moduleKey)) return [];
  const column = moduleKey === "affective" ? "affectiveData" : "combinedData";
  const plan: { id: string; data: Record<string, unknown> & { isDraft: boolean } }[] = [];
  for (const ev of evaluations) {
    const raw = ev[column];
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    if (isReferencePinned(data)) continue;
    const pinned = pinReferenceAffective(data, cupsPerSample);
    const fields = computeEvaluationDerived(moduleKey, pinned, cupsPerSample);
    plan.push({ id: ev.id, data: { ...fields, isDraft: ev.isDraft } });
  }
  return plan;
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

// ─── Client-side mirror of the rank order (cup + waiting room) ───────────────
// The realtime stream only carries the session's `referenceSampleId` (the
// ACTIVE reference), so clients keep the ordered id list of the references and
// derive the new list from each pointer change: a pointer that is already in
// the list means the later ones were removed (truncate); an unknown pointer
// is a newly added reference (append); null clears everything.

export function nextReferenceOrder(order: readonly string[], nextActive: string | null): string[] {
  if (!nextActive) return [];
  const i = order.indexOf(nextActive);
  return i === -1 ? [...order, nextActive] : order.slice(0, i + 1);
}

/** `refIds` first (in that order, skipping unknown ids), then the rest in
 *  their existing order. */
export function orderByReferenceIds<T extends { id: string }>(
  samples: readonly T[],
  refIds: readonly string[],
): T[] {
  const byId = new Map(samples.map((s) => [s.id, s]));
  const refs = refIds.flatMap((id) => {
    const s = byId.get(id);
    return s ? [s] : [];
  });
  const ids = new Set(refs.map((r) => r.id));
  return [...refs, ...samples.filter((s) => !ids.has(s.id))];
}

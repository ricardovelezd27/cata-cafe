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
import { DEFECT_TYPE_KEY } from "@/lib/cupDefects";
import { REF_STASH_KEY, type RefStash } from "@/lib/referenceStashKey";

import { MARKET_KEY, MARKET_NOTE_KEY } from "@/lib/marketNote";
import { clearPartialKeys, hasPartialKeys, inicialKey, neKey } from "@/lib/affectivePartial";

export { REF_STASH_KEY, type RefStash };

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
  /** B-05 (S8-22): the previous reference was UNLOCKED while a later one was
   *  active, so its stored ratings may have drifted off 79.00. It is active
   *  and pinned again, so it must be re-pinned (planReferenceRepin) in the
   *  same transaction. Always equal to `activeId`. */
  repinId: string | null;
} {
  const refs = referencesOf(samples);
  if (refs.length === 0) return { removeId: null, activeId: null, repinId: null };
  const activeId = refs.length > 1 ? refs[refs.length - 2].id : null;
  return { removeId: refs[refs.length - 1].id, activeId, repinId: activeId };
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

// ─── Reference mode (S10 WP2 / B1) ───────────────────────────────────────────
// "anchor" (default, today's behaviour): the ACTIVE reference is pinned at
// 5 / 79.00 for everyone, a Café Sensible class exercise, not part of the CVA.
// "free": everyone scores the reference like any other sample and the others
// are compared with its average. In BOTH modes references stay out of the
// ranking, the session average and "best" (lib/reports/ranking.ts anchorsOf).
// The mode lives on CuppingSession.referenceMode, is fixed once the format is
// locked, and is NEVER read by scoring, the trigger or AggregateScore.
// TODO(kim-validar:B1): simulated answer.
export const REFERENCE_MODES = ["anchor", "free"] as const;
export type ReferenceMode = (typeof REFERENCE_MODES)[number];
export const DEFAULT_REFERENCE_MODE: ReferenceMode = "anchor";

/** Normalizes a stored/posted value. Only the exact string "free" lifts the
 *  pin; anything else (including a legacy or unexpected value) reads as
 *  "anchor", i.e. today's behaviour (fail closed). */
export function normalizeReferenceMode(raw: unknown): ReferenceMode {
  return raw === "free" ? "free" : "anchor";
}

/** THE predicate every place that pins or locks a reference must use
 *  (upsertEvaluation, the offline replay, setReferenceSample's re-pin and its
 *  confirm, the sample-removal re-activation, CupClient's lock/pin/auto-save).
 *  The pin applies only to the ACTIVE reference, only in anchor mode and only
 *  for a module that carries affective ratings. */
export function shouldPinReference(input: {
  mode: unknown;
  moduleKey: string;
  isActiveReference: boolean;
}): boolean {
  return (
    input.isActiveReference &&
    normalizeReferenceMode(input.mode) === "anchor" &&
    isPinnedModule(input.moduleKey)
  );
}

/** Returns a copy of `data` with every affective `<attr>_final` set to 5 and
 *  the cup arrays cleared (no non-uniform / defective cups, no defect types).
 *  Descriptive fields, notes and everything else are left untouched. */
export function pinReferenceAffective(
  data: Record<string, unknown>,
  cupsPerSample: number,
): Record<string, unknown> {
  const cups = Math.max(0, Math.floor(cupsPerSample));
  // S10 WP3b: "no evaluado" markers and cooled values are affective inputs too; the pin clears them.
  const pinned: Record<string, unknown> = clearPartialKeys(data);
  for (const attr of AFFECTIVE_ATTRIBUTES) {
    pinned[`${attr.id}_final`] = REFERENCE_PIN_VALUE;
  }
  pinned.tazas_no_uniformes = Array(cups).fill(false);
  pinned.tazas_defectuosas = Array(cups).fill(false);
  pinned.defecto_tipo = [];
  // S10 WP1b: the per-cup defect types go with the flags.
  pinned.tazas_defecto_tipo = Array(cups).fill(null);
  // S10 WP3a (A10): the optional market note is an affective input too; the pin clears it.
  delete pinned[MARKET_KEY];
  delete pinned[MARKET_NOTE_KEY];
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
    // B2: what the pin overwrites is kept under `ref_previo` (never replaced).
    const refStash = stashBeforePin(data, pinned);
    const fields = computeEvaluationDerived(moduleKey, pinned, cupsPerSample, { refStash });
    plan.push({ id: ev.id, data: { ...fields, isDraft: ev.isDraft } });
  }
  return plan;
}

/** S8-27: how many stored evaluations a re-pin would actually REWRITE (those
 *  not already at the 79.00 anchor). Decides whether re-activating an earlier
 *  reference (removing the active one, or removing its sample) needs the
 *  owner's confirmation: 0 means pinning it again changes nothing. */
export function countRepinOverwrites(
  evaluations: Parameters<typeof planReferenceRepin>[0],
  moduleKey: string,
  cupsPerSample: number,
): number {
  return planReferenceRepin(evaluations, moduleKey, cupsPerSample).length;
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
  const noMarket = data[MARKET_KEY] === undefined && data[MARKET_NOTE_KEY] === undefined;
  return allFive && noCups && noMarket && !hasPartialKeys(data);
}

/** S10 WP3a review H1 (+ round 3): a reference change that would PIN a sample whose coffee is
 *  already revealed is refused (`reference_revealed`) ONLY when the pin would actually REWRITE
 *  stored evaluations of it (`overwrites` = `countRepinOverwrites(...)`, rows not already at the
 *  79.00 anchor): a revealed sample is frozen for evaluation, so the owner must not move the
 *  group score after the reveal. When nothing would be rewritten the pointer just moves (later
 *  saves stay refused by the reveal freeze). `targetRevealed` is the sample that would become the
 *  ACTIVE pinned reference: newly marked, or an earlier reference being reactivated. Free mode
 *  (no pin) and descriptive-only sessions are never refused. Pure; the ONE rule used by
 *  setReferenceSample (add and remove-active) and removeSamplesInTx. */
export function pinWouldTouchRevealed(input: {
  mode: unknown;
  moduleKey: string;
  targetRevealed: boolean;
  overwrites: number;
}): boolean {
  return (
    input.targetRevealed &&
    input.overwrites > 0 &&
    shouldPinReference({ mode: input.mode, moduleKey: input.moduleKey, isActiveReference: true })
  );
}

// ─── The pin never destroys a cupper's ratings (S10 WP5b, B2) ───────────────
// TODO(kim-validar:B2): simulated answer. Whenever a pin overwrites stored
// affective input that is not already the anchor state, the previous values are
// kept inside the SAME module JSON under ONE key, `ref_previo` (lib/
// referenceStashKey.ts). It is server-owned (stripped from every client payload
// by computeEvaluationDerived), invisible to scoring and reports, never
// overwritten by a later pin (the first real values win), and given back by
// `restoreFromStash` when the sample stops being the active pinned reference.
// Only where `shouldPinReference` applies: free mode never pins, never stashes.

/** EVERY key `pinReferenceAffective` overwrites (the single list: a test pins
 *  that the pin changes nothing outside it). The base `<attr>` ratings are not
 *  touched by the pin, so they are not stashed. */
export const PIN_OVERWRITTEN_KEYS: readonly string[] = [
  ...AFFECTIVE_ATTRIBUTES.map((a) => `${a.id}_final`),
  "tazas_no_uniformes",
  "tazas_defectuosas",
  "defecto_tipo",
  DEFECT_TYPE_KEY,
  // S10 WP3a (A10): the pin also deletes the optional market note.
  MARKET_KEY,
  MARKET_NOTE_KEY,
  // S10 WP3b (C4, A5): the pin also deletes every "no evaluado" mark and "as it cooled" value.
  ...AFFECTIVE_ATTRIBUTES.flatMap((a) => [neKey(a.id), inicialKey(a.id)]),
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The stash a stored module carries, or null when absent or malformed. Keys
 *  outside PIN_OVERWRITTEN_KEYS are dropped (a tampered blob cannot restore an
 *  arbitrary key). */
export function validStash(raw: unknown): RefStash | null {
  if (!isPlainObject(raw)) return null;
  const { at, valores } = raw;
  if (typeof at !== "string" || !isPlainObject(valores)) return null;
  const allowed: Record<string, unknown> = {};
  for (const key of PIN_OVERWRITTEN_KEYS) {
    if (key in valores) allowed[key] = valores[key];
  }
  return { at, valores: allowed };
}

/** The stash a write that PINS must carry. `stored` is the module as it is in
 *  the database right now (null/undefined = no stored row), `pinned` what the
 *  pin is about to write.
 *   - an existing stash wins and is carried over untouched (never overwritten);
 *   - no stored row, or stored data already at the anchor state: nothing to keep;
 *   - otherwise a new stash with the value of every overwritten key that
 *     actually changes (`null` = the key was absent). */
export function stashBeforePin(
  stored: Record<string, unknown> | null | undefined,
  pinned: Record<string, unknown>,
  now: Date = new Date(),
): RefStash | null {
  if (!stored) return null;
  const existing = validStash(stored[REF_STASH_KEY]);
  if (existing) return existing;
  if (isReferencePinned(stored)) return null;
  const valores: Record<string, unknown> = {};
  for (const key of PIN_OVERWRITTEN_KEYS) {
    const before = stored[key] === undefined ? null : stored[key];
    const after = pinned[key] === undefined ? null : pinned[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) valores[key] = before;
  }
  if (Object.keys(valores).length === 0) return null;
  return { at: now.toISOString(), valores };
}

/** "Undo": gives the stashed values back when the module STILL holds exactly
 *  the anchor state. A module the cupper re-rated after the unlock keeps its
 *  current values and just drops the stash (`restored: false`, `hadStash:
 *  true`). Always returns data WITHOUT the stash key. */
export function restoreFromStash(data: Record<string, unknown>): {
  data: Record<string, unknown>;
  restored: boolean;
  hadStash: boolean;
} {
  const hadKey = REF_STASH_KEY in data;
  const stash = validStash(data[REF_STASH_KEY]);
  const clean: Record<string, unknown> = { ...data };
  delete clean[REF_STASH_KEY];
  if (!stash || !isReferencePinned(clean)) return { data: clean, restored: false, hadStash: hadKey };
  for (const [key, value] of Object.entries(stash.valores)) {
    if (value === null || value === undefined) delete clean[key];
    else clean[key] = value;
  }
  return { data: clean, restored: true, hadStash: true };
}

/** S10 WP5b review H1 (TODO(kim-validar:B2)): what a write of an evaluation
 *  module must store, decided against the session's CURRENT reference (the
 *  caller reads it in the same transaction as the write).
 *   - `pinsNow`: the sample IS the pinned reference now: pin the payload and
 *     carry the stash. An existing stored stash wins; otherwise, when the
 *     payload itself holds REAL ratings (`!pinnedView`: a cupper who was offline
 *     when the sample was marked), the stash is taken from the PAYLOAD; else
 *     from the stored row.
 *   - not pinned now but the module was produced under the pin (`pinnedView`):
 *     the pinned keys of the payload are not the cupper's input. Every key of
 *     PIN_OVERWRITTEN_KEYS keeps the STORED row's value (absent stays absent);
 *     everything else (descriptive side, notes) is taken from the payload. No
 *     stash is written.
 *   - otherwise an ordinary save. Only modules that carry affective ratings. */
export function resolvePinnedPayload(input: {
  pinsNow: boolean;
  pinnedView: boolean;
  moduleKey: string;
  posted: Record<string, unknown>;
  stored: Record<string, unknown> | null | undefined;
  cupsPerSample: number;
  now?: Date;
}): { data: Record<string, unknown>; refStash: RefStash | null } {
  const { posted, stored } = input;
  if (!isPinnedModule(input.moduleKey)) return { data: posted, refStash: null };
  if (input.pinsNow) {
    const pinned = pinReferenceAffective(posted, input.cupsPerSample);
    const existing = validStash(stored?.[REF_STASH_KEY]);
    let refStash: RefStash | null = existing;
    if (!refStash && !input.pinnedView) {
      const { [REF_STASH_KEY]: _ignored, ...clean } = posted;
      void _ignored;
      refStash = stashBeforePin(clean, pinned, input.now);
    }
    if (!refStash) refStash = stashBeforePin(stored, pinned, input.now);
    return { data: pinned, refStash };
  }
  if (input.pinnedView) {
    const merged: Record<string, unknown> = { ...posted };
    for (const key of PIN_OVERWRITTEN_KEYS) {
      if (stored && key in stored && stored[key] !== undefined) merged[key] = stored[key];
      else delete merged[key];
    }
    return { data: merged, refStash: null };
  }
  return { data: posted, refStash: null };
}

/** Client rule (H1): when a sample stops being the pinned reference, the page's
 *  module takes the SERVER's value for every key the pin overwrites (the server
 *  restored the cupper's ratings); everything else stays local (unsaved
 *  descriptive edits). A key the server row does not have is removed. */
export function adoptServerPinKeys(
  local: Record<string, unknown>,
  server: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...local };
  delete out[REF_STASH_KEY];
  for (const key of PIN_OVERWRITTEN_KEYS) {
    if (server && key in server && server[key] !== undefined) out[key] = server[key];
    else delete out[key];
  }
  return out;
}

/** Restore plan for a sample that STOPPED being the active pinned reference
 *  (S10 WP5b). For each evaluation carrying a stash: when the anchor state is
 *  intact the stashed values come back and the full derived payload is written
 *  (`isDraft` echoed so a submitted row re-fires `trg_recompute_aggregate`,
 *  like planReferenceRepin); otherwise only the module column is rewritten
 *  without the stash (scores untouched). Evaluations without a stash are not
 *  listed. `restored` marks the first kind. */
export function planReferenceRestore<
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
): { plan: { id: string; restored: boolean; data: Record<string, unknown> }[]; skipped: string[] } {
  const plan: { id: string; restored: boolean; data: Record<string, unknown> }[] = [];
  const skipped: string[] = [];
  if (!isPinnedModule(moduleKey)) return { plan, skipped };
  const column = moduleKey === "affective" ? "affectiveData" : "combinedData";
  for (const ev of evaluations) {
    const raw = ev[column];
    if (!isPlainObject(raw) || !(REF_STASH_KEY in raw)) continue;
    const res = restoreFromStash(raw);
    if (res.restored) {
      // A restore never blocks the owner: values that fail validation leave the
      // row pinned with its stash (the caller logs the id) and are not counted.
      try {
        const fields = computeEvaluationDerived(moduleKey, res.data, cupsPerSample);
        plan.push({ id: ev.id, restored: true, data: { ...fields, isDraft: ev.isDraft } });
      } catch {
        skipped.push(ev.id);
      }
    } else {
      plan.push({ id: ev.id, restored: false, data: { [column]: res.data } });
    }
  }
  return { plan, skipped };
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

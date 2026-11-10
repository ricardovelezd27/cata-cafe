// Honest "enviados" counter for the maestro's panel (S8-11 T1, F-grupal-4).
//
// Numerator = distinct ELIGIBLE cuppers that have a submitted evaluation for
// EVERY sample of the session; denominator = eligible cuppers (joined,
// non-excluded participants including the owner). The client keeps a
// Map<cupperId, Set<sampleId>> instead of a `+1` per realtime event, so
// autosaves of an already-submitted row, duplicate deliveries and reconnects
// can never move the number. Dependency-free for vitest.

export type SubmittedRow = { cupperId: string; sampleId: string };

export type SubmitMap = Map<string, Set<string>>;

/** Server rows (isDraft = false only) → map. */
export function seedSubmitMap(rows: readonly SubmittedRow[]): SubmitMap {
  const map: SubmitMap = new Map();
  for (const r of rows) {
    const set = map.get(r.cupperId) ?? new Set<string>();
    set.add(r.sampleId);
    map.set(r.cupperId, set);
  }
  return map;
}

/** Applies one evaluations UPDATE event. Returns the SAME map when nothing
 *  changed, so a React state setter bails out of the re-render. */
export function applySubmitEvent(
  map: SubmitMap,
  ev: { cupperId: string; sampleId: string; isDraft: boolean },
): SubmitMap {
  const has = map.get(ev.cupperId)?.has(ev.sampleId) ?? false;
  if (ev.isDraft ? !has : has) return map;
  const next: SubmitMap = new Map(map);
  const set = new Set(next.get(ev.cupperId) ?? []);
  if (ev.isDraft) set.delete(ev.sampleId);
  else set.add(ev.sampleId);
  if (set.size === 0) next.delete(ev.cupperId);
  else next.set(ev.cupperId, set);
  return next;
}

export function computeSubmitProgress(
  map: SubmitMap,
  sampleIds: readonly string[],
  eligibleCupperIds: readonly string[],
): { done: number; total: number } {
  const total = eligibleCupperIds.length;
  if (sampleIds.length === 0) return { done: 0, total };
  let done = 0;
  for (const cupperId of eligibleCupperIds) {
    const subs = map.get(cupperId);
    if (subs && sampleIds.every((s) => subs.has(s))) done++;
  }
  return { done, total };
}

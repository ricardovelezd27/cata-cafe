// Warm-up reflections: the two closing questions of a Movimiento Sensorial
// exercise. Since S10 WP7 (Kim F2) a person can SAVE their answers: they live in
// the account table `warmup_reflections`, readable only by their owner (RLS with
// no policy, PHASE 27) and read only through lib/warmup/reflectionsData.ts
// scoped by user id. Nothing else ever reads them: no analytics query, admin
// view, export or AI prompt. This module holds the pure rules (input parsing)
// and the purge of the legacy localStorage keys that older builds wrote (S8-13)
// WITHOUT a user id, where sign-out left them behind on shared tablets.
// TODO(kim-validar:F2): the rule (private, re-readable by the owner) rests on a
// SIMULATED answer; confirm with Kim before describing it to users as final.

import { WARMUP_IDS, type WarmupId } from "./exercises";
import * as v from "../validate";

/** Max length of each answer. */
export const REFLECTION_MAX = 500;

/** Max saved reflections per person per exercise (S10 WP7 review, F2): the
 *  201st save is refused with `reflection_limit`. */
export const REFLECTIONS_PER_EXERCISE_MAX = 200;

export interface ReflectionInput {
  exerciseId: WarmupId;
  feel: string | null;
  discovery: string | null;
}

/** Validates what the client posts: a known exercise, each answer trimmed and
 *  at most REFLECTION_MAX, at least one non-empty. Throws `invalid_input`. */
export function parseReflectionInput(input: unknown): ReflectionInput {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const exerciseId = v.oneOf(o.exerciseId, "exerciseId", WARMUP_IDS);
  const feel = v.str(o.feel, "feel", { max: REFLECTION_MAX, required: false });
  const discovery = v.str(o.discovery, "discovery", { max: REFLECTION_MAX, required: false });
  if (feel === null && discovery === null) throw new v.ValidationError("feel");
  return { exerciseId, feel, discovery };
}

export const LEGACY_REFLECTIONS_PREFIX = "cata_warmup_reflections_";

/** Minimal Storage shape so the purge is testable without a DOM. */
export interface KeyedStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Removes every legacy reflections key. Returns how many were removed.
 *  Never throws (private mode / blocked storage → 0). */
export function purgeLegacyReflections(storage: KeyedStorage | null | undefined): number {
  if (!storage) return 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(LEGACY_REFLECTIONS_PREFIX)) doomed.push(k);
    }
    for (const k of doomed) storage.removeItem(k);
    return doomed.length;
  } catch {
    return 0;
  }
}

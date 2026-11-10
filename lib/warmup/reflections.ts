// The warm-up closing questions are a quiet pause: nothing is written
// anywhere (S8-13, F-movimiento-sensorial-5, default (b)). Older builds saved
// the answers to localStorage `cata_warmup_reflections_<exerciseId>` WITHOUT a
// user id, where nothing could read them back and sign-out left them behind
// on shared tablets. This module only knows how to purge those legacy keys.
// TODO(Kim F2): if she wants per-cupper notes (answer a), key them by user id,
// show them on the exercise page and clear them on sign-out.

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

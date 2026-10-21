// Local-only reflection notes for the warm-up closing questions. Written to
// localStorage `cata_warmup_reflections_<exerciseId>`; never sent anywhere and
// never joined with CVA / evaluation data.

export const reflectionsKey = (exerciseId: string) => `cata_warmup_reflections_${exerciseId}`;

export interface WarmupReflection {
  /** ISO timestamp. */
  at: string;
  /** Answers to the two closing questions, in order (either may be empty). */
  answers: [string, string];
}

const MAX_ENTRIES = 50;

/** Appends one entry. Returns false when there was nothing to save or the
 *  browser refused the write (private mode / quota). */
export function saveReflection(exerciseId: string, answers: [string, string]): boolean {
  const clean: [string, string] = [answers[0].trim().slice(0, 2000), answers[1].trim().slice(0, 2000)];
  if (!clean[0] && !clean[1]) return false;
  try {
    const key = reflectionsKey(exerciseId);
    const raw = window.localStorage.getItem(key);
    const prev: WarmupReflection[] = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(prev) ? prev : [];
    list.push({ at: new Date().toISOString(), answers: clean });
    window.localStorage.setItem(key, JSON.stringify(list.slice(-MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

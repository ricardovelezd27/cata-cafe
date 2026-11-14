// Shared between the tiny mount wrapper and the lazily loaded engine so the
// wrapper can skip mounting without importing the engine chunk.

/** sessionStorage key set by the engine's kill-switch after repeated frame-budget misses. */
export const KILL_FLAG = "cs_constellation_off";

export function isKilled(): boolean {
  try {
    return sessionStorage.getItem(KILL_FLAG) === "1";
  } catch {
    return false;
  }
}

/** sessionStorage key set when the arrival animation (./intro.ts) starts: once per tab. */
export const INTRO_FLAG = "cs_constellation_intro";

export function introSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_FLAG) === "1";
  } catch {
    // No storage: we cannot remember, so do not replay it on every visit.
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(INTRO_FLAG, "1");
  } catch {
    // storage unavailable — introSeen() already answers true in that case
  }
}

export function markKilled(): void {
  try {
    sessionStorage.setItem(KILL_FLAG, "1");
  } catch {
    // storage unavailable (private mode) — the in-memory stop still holds for this page
  }
}

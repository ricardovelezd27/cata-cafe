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

export function markKilled(): void {
  try {
    sessionStorage.setItem(KILL_FLAG, "1");
  } catch {
    // storage unavailable (private mode) — the in-memory stop still holds for this page
  }
}

// Durable-storage helpers (S8-15, F-offline-8). Client-only, never throws.
//
// Safari evicts script-writable storage (IndexedDB included) after ~7 days
// without use unless the site is installed or granted persistence. So: ask the
// browser once for persistence after the first successful local draft save,
// remember the answer, and let the app warn when an unsynced draft is old and
// the app is not installed.
//
// TODO(E5): when the SQLite mirror / offline-create decision lands (Kim E5), the
// native shell replaces IndexedDB here; this module stays the seam.

export const PERSIST_KEY = "cata_storage_persist";
export const STALE_DRAFT_MS = 3 * 24 * 60 * 60 * 1000;

export type PersistOutcome = "granted" | "denied" | "unsupported" | "error";
export type PersistState = { outcome: PersistOutcome; at: number };

type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };
type PersistEnv = {
  persist?: () => Promise<boolean>;
  ls?: StorageLike | null;
  now?: () => number;
};

function defaultEnv(): PersistEnv {
  if (typeof window === "undefined") return {};
  let ls: StorageLike | null = null;
  try {
    ls = window.localStorage;
  } catch {
    ls = null;
  }
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  return { persist: s?.persist ? () => s.persist() : undefined, ls, now: Date.now };
}

export function getPersistState(env: PersistEnv = defaultEnv()): PersistState | null {
  try {
    const raw = env.ls?.getItem(PERSIST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PersistState>;
    if (typeof v.at !== "number" || typeof v.outcome !== "string") return null;
    return v as PersistState;
  } catch {
    return null;
  }
}

let inFlight = false;

/** Asks for persistent storage ONCE (recorded in localStorage) and returns the recorded state. */
export async function requestPersistentStorage(
  env: PersistEnv = defaultEnv(),
): Promise<PersistState | null> {
  const existing = getPersistState(env);
  if (existing) return existing;
  if (inFlight) return null;
  inFlight = true;
  try {
    const now = env.now ?? Date.now;
    let outcome: PersistOutcome;
    if (!env.persist) outcome = "unsupported";
    else {
      try {
        outcome = (await env.persist()) ? "granted" : "denied";
      } catch {
        outcome = "error";
      }
    }
    const state: PersistState = { outcome, at: now() };
    try {
      env.ls?.setItem(PERSIST_KEY, JSON.stringify(state));
    } catch {
      // storage blocked — we will simply ask again next time
    }
    return state;
  } finally {
    inFlight = false;
  }
}

/**
 * Warn when the OLDEST unsynced draft is older than the threshold, the app is
 * not installed (standalone / native) and persistence was not granted.
 */
export function shouldWarnStaleDraft(input: {
  oldestPendingAt: number | null;
  now: number;
  standalone: boolean;
  persist?: PersistState | null;
  thresholdMs?: number;
}): boolean {
  if (input.oldestPendingAt == null || input.standalone) return false;
  if (input.persist?.outcome === "granted") return false;
  return input.now - input.oldestPendingAt > (input.thresholdMs ?? STALE_DRAFT_MS);
}

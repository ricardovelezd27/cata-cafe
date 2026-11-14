// The optional cupping timer (S10 WP3b, Kim A5, TODO(kim-validar:A5)). CLIENT ONLY and
// pure: the timestamp the cupper started it lives in localStorage per session + user
// (`cata_timer_<sessionId>_<userId>`: the start timestamp and nothing else); nothing
// reaches the server and nothing is stored in the evaluation. One clock: the elapsed
// time is always `now - start`. The two passes after the first are advanced by hand
// and are NOT stored (a reload shows the first pass again).

export const TIMER_STORAGE_PREFIX = "cata_timer_";
/** 4:00 "break the crust". */
export const TIMER_BREAK_MS = 4 * 60_000;
/** 8:00 first pass (the protocol allows 8 to 10 min). */
export const TIMER_PASS1_MS = 8 * 60_000;
/** A start older than this is a forgotten timer: ignored (and shown as not started). */
export const TIMER_STALE_MS = 12 * 60 * 60_000;

export type TimerCue = "wait" | "break" | "pass1" | "pass2" | "pass3";

export const timerStorageKey = (sessionId: string, userId: string) =>
  `${TIMER_STORAGE_PREFIX}${sessionId}_${userId}`;

/** The stored start, or null when it is missing, not a number, in the future (clock change)
 *  or stale. Never throws. */
export function parseTimerStart(raw: string | null | undefined, now: number): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > now + 5_000) return null;
  if (now - n > TIMER_STALE_MS) return null;
  return n;
}

/** Which cue is current at `elapsedMs`. `extraPasses` (0..2) is how many times the cupper
 *  advanced past the first pass by hand; it only counts from 8:00 on. */
export function timerCue(elapsedMs: number, extraPasses: number): TimerCue {
  if (!Number.isFinite(elapsedMs) || elapsedMs < TIMER_BREAK_MS) return "wait";
  if (elapsedMs < TIMER_PASS1_MS) return "break";
  const extra = Math.max(0, Math.min(2, Math.floor(extraPasses)));
  return extra === 0 ? "pass1" : extra === 1 ? "pass2" : "pass3";
}

/** True when "Siguiente pasada" applies (a later pass exists and the first one has begun). */
export function canAdvancePass(elapsedMs: number, extraPasses: number): boolean {
  return elapsedMs >= TIMER_PASS1_MS && extraPasses < 2;
}

/** mm:ss (minutes unbounded, never negative). */
export function formatTimer(elapsedMs: number): string {
  const total = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type KeyValueStorage = Pick<Storage, "length" | "key" | "removeItem">;

/** Removes every timer on this device (sign-out; lib/offline/deviceState.ts). */
export function clearTimerKeys(storage: KeyValueStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(TIMER_STORAGE_PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
}

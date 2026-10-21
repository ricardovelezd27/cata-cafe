// "Session moments": one-off overlays shown inside the cup shell (the warm-up
// interstitial today; S5's materials checklist and the reveal moment later).
// Each moment is seen at most once per (kind, session) per device — tracked
// in localStorage so it needs no server round-trip and works offline.
//
// Pure helpers (storage is injected) so tests/sessionMoments.test.ts covers
// the key format and the seen-set without a DOM.

export type SessionMomentKind = "warmup" | "materials" | "reveal";

export const SESSION_MOMENT_PREFIX = "cata_moment_";

export function sessionMomentKey(kind: SessionMomentKind, sessionId: string): string {
  return `${SESSION_MOMENT_PREFIX}${kind}_${sessionId}`;
}

export interface MomentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser localStorage, or null on the server / when access throws
 *  (private mode, blocked storage). Every caller must tolerate null. */
export function defaultMomentStorage(): MomentStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenMoment(
  kind: SessionMomentKind,
  sessionId: string,
  storage: MomentStorage | null = defaultMomentStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(sessionMomentKey(kind, sessionId)) !== null;
  } catch {
    return false;
  }
}

// In-memory listeners so a React `useSyncExternalStore` can re-read the
// seen-set after markMomentSeen/clearMomentSeen without effects.
const listeners = new Set<() => void>();
export function subscribeMoments(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  listeners.forEach((cb) => cb());
}

export function markMomentSeen(
  kind: SessionMomentKind,
  sessionId: string,
  storage: MomentStorage | null = defaultMomentStorage(),
): void {
  if (storage) {
    try {
      storage.setItem(sessionMomentKey(kind, sessionId), String(Date.now()));
    } catch {
      // Storage full / blocked: the moment simply shows again next time.
    }
  }
  notify();
}

export function clearMomentSeen(
  kind: SessionMomentKind,
  sessionId: string,
  storage: MomentStorage | null = defaultMomentStorage(),
): void {
  if (storage) {
    try {
      storage.removeItem(sessionMomentKey(kind, sessionId));
    } catch {
      // ignore
    }
  }
  notify();
}

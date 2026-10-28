// "Session moments": one-off overlays shown inside the cup shell (the warm-up
// interstitial today; S5's materials checklist and the reveal moment later).
//
// v3 (2026-10-28): a moment is seen at most once per (kind, session, USER,
// value) per device — the key carries the user (shared tablets) and the value
// is the thing that was shown (the warm-up exercise id), so changing the
// exercise re-arms the moment. Storage falls back localStorage →
// sessionStorage → an in-memory map, so a blocked browser still shows the
// moment at most once per tab. Pure helpers (storage is injected) so
// tests/sessionMoments.test.ts covers them without a DOM.

export type SessionMomentKind = "warmup" | "materials" | "reveal";

export const SESSION_MOMENT_PREFIX = "cata_moment_";

export function sessionMomentKey(kind: SessionMomentKind, sessionId: string, userId: string): string {
  return `${SESSION_MOMENT_PREFIX}${kind}_${sessionId}_${userId}`;
}

/** Pre-v3 key (no user, timestamp value): ignored for reads, removed on write. */
function legacyKey(kind: SessionMomentKind, sessionId: string): string {
  return `${SESSION_MOMENT_PREFIX}${kind}_${sessionId}`;
}

export interface MomentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The in-memory tier: always written, so a blocked browser is still "once
 *  per page". Module-level on purpose. */
const memory = new Map<string, string>();

function safeStorage(get: () => Storage | undefined): MomentStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = get();
    if (!s) return null;
    // Access can throw (private mode / blocked storage) — probe once.
    s.getItem("__cata_probe__");
    return s;
  } catch {
    return null;
  }
}

/** Browser storages in fallback order, or an empty list on the server. */
export function defaultMomentStorages(): MomentStorage[] {
  const out: MomentStorage[] = [];
  const local = safeStorage(() => window.localStorage);
  if (local) out.push(local);
  const session = safeStorage(() => window.sessionStorage);
  if (session) out.push(session);
  return out;
}

const memoryStorage: MomentStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function tiers(storages: MomentStorage[] | MomentStorage | null): MomentStorage[] {
  const list = storages === null ? [] : Array.isArray(storages) ? storages : [storages];
  return [...list, memoryStorage];
}

/** What was recorded for this (kind, session, user), from the first tier that has it. */
export function seenMomentValue(
  kind: SessionMomentKind,
  sessionId: string,
  userId: string,
  storages: MomentStorage[] | MomentStorage | null = defaultMomentStorages(),
): string | null {
  const key = sessionMomentKey(kind, sessionId, userId);
  for (const s of tiers(storages)) {
    try {
      const v = s.getItem(key);
      if (v !== null) return v;
    } catch {
      /* next tier */
    }
  }
  return null;
}

/** Seen ⇔ the recorded value equals `value` (e.g. the current exercise id). */
export function hasSeenMoment(
  kind: SessionMomentKind,
  sessionId: string,
  userId: string,
  value: string,
  storages: MomentStorage[] | MomentStorage | null = defaultMomentStorages(),
): boolean {
  return seenMomentValue(kind, sessionId, userId, storages) === value;
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

/** Records `value` in every reachable tier (the memory tier always) and
 *  drops the pre-v3 key. Never throws. */
export function markMomentSeen(
  kind: SessionMomentKind,
  sessionId: string,
  userId: string,
  value: string,
  storages: MomentStorage[] | MomentStorage | null = defaultMomentStorages(),
): void {
  const key = sessionMomentKey(kind, sessionId, userId);
  const old = legacyKey(kind, sessionId);
  for (const s of tiers(storages)) {
    try {
      s.setItem(key, value);
    } catch {
      /* quota / blocked: the next tier still records it */
    }
    try {
      s.removeItem(old);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function clearMomentSeen(
  kind: SessionMomentKind,
  sessionId: string,
  userId: string,
  storages: MomentStorage[] | MomentStorage | null = defaultMomentStorages(),
): void {
  const key = sessionMomentKey(kind, sessionId, userId);
  for (const s of tiers(storages)) {
    try {
      s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  notify();
}

/** Sign-out hygiene: every `cata_moment_*` key in every tier (shared tablets). */
export function clearMomentsForDevice(storages: MomentStorage[] | null = defaultMomentStorages()): void {
  memory.clear();
  for (const s of storages ?? []) {
    try {
      const st = s as Partial<Storage>;
      if (typeof st.length !== "number" || typeof st.key !== "function") continue;
      const doomed: string[] = [];
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (k && k.startsWith(SESSION_MOMENT_PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch {
      /* ignore */
    }
  }
  notify();
}

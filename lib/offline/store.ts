// Client-only localforage wrapper for offline evaluation persistence.
//
// IMPORTANT: this module must never be imported by a React Server Component or
// any server action — localforage touches IndexedDB/window. All access goes
// through the lazy `instance()` getter which bails out (returns null) during
// SSR, so accidental server imports degrade to a no-op instead of crashing.
//
// Every exported function additionally wraps its body in try/catch: any
// localforage call can reject (Safari private mode, quota exceeded, a user
// wiping site data mid-session, …). A storage failure must never surface as an
// unhandled rejection or crash a save — reads degrade to null/[] and writes
// resolve silently, while `isOfflineStorageUnavailable()` flips true so the UI
// can warn the cupper that local drafts are not being persisted.

import localforage from "localforage";
import type {
  Data,
  ModuleKey,
  OfflineSessionBlob,
  SyncStatus,
} from "./types";

const SESSION_PREFIX = "cata_session_";
const PROPS_PREFIX = "cata_props_";
const LAST_USER_KEY = "cata_lastUser";

let _instance: LocalForage | null = null;

function instance(): LocalForage | null {
  if (typeof window === "undefined") return null;
  if (_instance) return _instance;
  _instance = localforage.createInstance({
    name: "cata-cafe",
    storeName: "offline_sessions",
    description: "Offline cupping evaluations pending sync",
  });
  return _instance;
}

// ─── Storage-unavailable flag ────────────────────────────────────────────
// Flipped true the first time any localforage call throws/rejects. There is
// no path back to false within a session — once IndexedDB has proven
// unreliable here (quota, private mode, revoked permission), the safest
// assumption is that it stays unreliable.
let _unavailable = false;
const _listeners = new Set<() => void>();

function markUnavailable(context: string, err: unknown): void {
  if (!_unavailable) {
    _unavailable = true;
    for (const cb of _listeners) cb();
  }
  // Logged once per call site is acceptable here — storage errors are rare
  // and each one is diagnostic (which operation failed, not just "it broke").
  console.warn(`[offline-store] ${context} failed:`, err);
}

export function isOfflineStorageUnavailable(): boolean {
  return _unavailable;
}

// useSyncExternalStore-friendly subscribe: takes a no-arg notify callback
// (read the new value back via isOfflineStorageUnavailable) and returns an
// unsubscribe function. Usage:
//   useSyncExternalStore(onOfflineStorageUnavailable, isOfflineStorageUnavailable, () => false)
export function onOfflineStorageUnavailable(cb: () => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

export function sessionKey(sessionId: string, userId: string): string {
  return `${SESSION_PREFIX}${sessionId}_user_${userId}`;
}

function propsKey(sessionId: string, userId: string): string {
  return `${PROPS_PREFIX}${sessionId}_user_${userId}`;
}

// ─── Session blob (the evaluation data) ─────────────────────────────────────

export async function loadSession(
  sessionId: string,
  userId: string,
): Promise<OfflineSessionBlob | null> {
  const lf = instance();
  if (!lf) return null;
  try {
    return (await lf.getItem<OfflineSessionBlob>(sessionKey(sessionId, userId))) ?? null;
  } catch (err) {
    markUnavailable("loadSession", err);
    return null;
  }
}

export async function loadByKey(key: string): Promise<OfflineSessionBlob | null> {
  const lf = instance();
  if (!lf) return null;
  try {
    return (await lf.getItem<OfflineSessionBlob>(key)) ?? null;
  } catch (err) {
    markUnavailable("loadByKey", err);
    return null;
  }
}

export async function saveSession(blob: OfflineSessionBlob): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    await lf.setItem(sessionKey(blob.sessionId, blob.userId), blob);
  } catch (err) {
    markUnavailable("saveSession", err);
  }
}

export async function removeSession(sessionId: string, userId: string): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    await lf.removeItem(sessionKey(sessionId, userId));
  } catch (err) {
    markUnavailable("removeSession", err);
  }
}

// All session-blob keys belonging to one user (used to drive sync-on-reconnect).
export async function listUserKeys(userId: string): Promise<string[]> {
  const lf = instance();
  if (!lf) return [];
  try {
    const keys = await lf.keys();
    const suffix = `_user_${userId}`;
    return keys.filter((k) => k.startsWith(SESSION_PREFIX) && k.endsWith(suffix));
  } catch (err) {
    markUnavailable("listUserKeys", err);
    return [];
  }
}

// Read-modify-write a single module's data into the session blob, stamping it
// `pending`. `seed` provides the immutable session metadata for first write.
export async function mergeModuleData(
  sessionId: string,
  userId: string,
  sampleId: string,
  sampleLabel: string,
  moduleKey: ModuleKey,
  data: Data,
  seed: { format: string; cupsPerSample: number },
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    const now = Date.now();
    const existing = await loadSession(sessionId, userId);
    const blob: OfflineSessionBlob = existing ?? {
      sessionId,
      userId,
      updatedAt: now,
      format: seed.format,
      cupsPerSample: seed.cupsPerSample,
      samples: {},
    };
    const sample = blob.samples[sampleId] ?? { label: sampleLabel, modules: {} };
    sample.label = sampleLabel;
    sample.modules[moduleKey] = { data, syncStatus: "pending", updatedAt: now };
    blob.samples[sampleId] = sample;
    blob.updatedAt = now;
    await lf.setItem(sessionKey(sessionId, userId), blob);
  } catch (err) {
    markUnavailable("mergeModuleData", err);
  }
}

// Flip a module's syncStatus after a sync attempt resolves.
export async function setModuleStatus(
  sessionId: string,
  userId: string,
  sampleId: string,
  moduleKey: ModuleKey,
  status: SyncStatus,
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    const blob = await loadSession(sessionId, userId);
    const mod = blob?.samples[sampleId]?.modules[moduleKey];
    if (!blob || !mod) return;
    mod.syncStatus = status;
    await lf.setItem(sessionKey(sessionId, userId), blob);
  } catch (err) {
    markUnavailable("setModuleStatus", err);
  }
}

// ─── Props cache (enables offline hard-refresh rebuild) ─────────────────────

export async function cacheProps(
  sessionId: string,
  userId: string,
  props: unknown,
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    await Promise.all([
      lf.setItem(propsKey(sessionId, userId), props),
      lf.setItem(LAST_USER_KEY, userId),
    ]);
  } catch (err) {
    markUnavailable("cacheProps", err);
  }
}

export async function loadCachedProps<T>(
  sessionId: string,
  userId: string,
): Promise<T | null> {
  const lf = instance();
  if (!lf) return null;
  try {
    return (await lf.getItem<T>(propsKey(sessionId, userId))) ?? null;
  } catch (err) {
    markUnavailable("loadCachedProps", err);
    return null;
  }
}

export async function getLastUser(): Promise<string | null> {
  const lf = instance();
  if (!lf) return null;
  try {
    return (await lf.getItem<string>(LAST_USER_KEY)) ?? null;
  } catch (err) {
    markUnavailable("getLastUser", err);
    return null;
  }
}

/** Sign-out hook (lib/offline/deviceState.ts): drop the last-user pointer so
 *  the cup boundary's offline rebuild can never pick up the previous user's
 *  cached props on a shared device. User-keyed draft blobs are kept. */
export async function forgetLastUser(): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    await lf.removeItem(LAST_USER_KEY);
  } catch (err) {
    markUnavailable("forgetLastUser", err);
  }
}

// Client-only localforage wrapper for offline evaluation persistence.
//
// IMPORTANT: this module must never be imported by a React Server Component or
// any server action — localforage touches IndexedDB/window. All access goes
// through the lazy `instance()` getter which bails out (returns null) during
// SSR, so accidental server imports degrade to no-ops instead of crashing.

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
  return (await lf.getItem<OfflineSessionBlob>(sessionKey(sessionId, userId))) ?? null;
}

export async function loadByKey(key: string): Promise<OfflineSessionBlob | null> {
  const lf = instance();
  if (!lf) return null;
  return (await lf.getItem<OfflineSessionBlob>(key)) ?? null;
}

export async function saveSession(blob: OfflineSessionBlob): Promise<void> {
  const lf = instance();
  if (!lf) return;
  await lf.setItem(sessionKey(blob.sessionId, blob.userId), blob);
}

export async function removeSession(sessionId: string, userId: string): Promise<void> {
  const lf = instance();
  if (!lf) return;
  await lf.removeItem(sessionKey(sessionId, userId));
}

// All session-blob keys belonging to one user (used to drive sync-on-reconnect).
export async function listUserKeys(userId: string): Promise<string[]> {
  const lf = instance();
  if (!lf) return [];
  const keys = await lf.keys();
  const suffix = `_user_${userId}`;
  return keys.filter((k) => k.startsWith(SESSION_PREFIX) && k.endsWith(suffix));
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
  const blob = await loadSession(sessionId, userId);
  const mod = blob?.samples[sampleId]?.modules[moduleKey];
  if (!blob || !mod) return;
  mod.syncStatus = status;
  await lf.setItem(sessionKey(sessionId, userId), blob);
}

// ─── Props cache (enables offline hard-refresh rebuild) ─────────────────────

export async function cacheProps(
  sessionId: string,
  userId: string,
  props: unknown,
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  await Promise.all([
    lf.setItem(propsKey(sessionId, userId), props),
    lf.setItem(LAST_USER_KEY, userId),
  ]);
}

export async function loadCachedProps<T>(
  sessionId: string,
  userId: string,
): Promise<T | null> {
  const lf = instance();
  if (!lf) return null;
  return (await lf.getItem<T>(propsKey(sessionId, userId))) ?? null;
}

export async function getLastUser(): Promise<string | null> {
  const lf = instance();
  if (!lf) return null;
  return (await lf.getItem<string>(LAST_USER_KEY)) ?? null;
}

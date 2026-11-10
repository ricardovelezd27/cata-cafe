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
import { requestPersistentStorage } from "@/lib/platform/storage";
import type {
  Data,
  ModuleKey,
  OfflineModuleData,
  OfflineSessionBlob,
  SyncStatus,
} from "./types";
import {
  applyOutcome,
  countStatuses,
  deviceOnlyCount,
  isTerminal,
  rekeyBlob,
  reviveFailed,
  type ReplayOutcome,
  type StatusCounts,
} from "./status";
import { createKeyedQueue } from "./serialize";

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

// ─── Write serialisation ─────────────────────────────────────────────────
// Every read-modify-write on a session blob runs through one promise chain per
// storage key, so a debounced mergeModuleData can never land between another
// operation's load and its write-back (S8-09). The chain never rejects.
const serialize = createKeyedQueue();

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
    return;
  }
  // First successful local save: ask the browser once to keep this storage
  // (recorded in localStorage; later calls are no-ops). Never blocks or throws.
  void requestPersistentStorage().catch(() => {});
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

/** Account deleted (S8-19): drop every draft blob of that user on this device.
 *  The server rows are already gone or anonymized, so nothing can sync them.
 *  Never throws. Returns how many blobs were removed. */
export async function removeUserDrafts(userId: string): Promise<number> {
  const lf = instance();
  if (!lf) return 0;
  const keys = await listUserKeys(userId);
  let removed = 0;
  for (const key of keys) {
    try {
      await lf.removeItem(key);
      removed++;
    } catch (err) {
      markUnavailable("removeUserDrafts", err);
    }
  }
  return removed;
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
  await serialize(sessionKey(sessionId, userId), async () => {
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
  });
}

// One module read through the same per-key chain as every write, so the result
// reflects every save already queued ahead of it (S8-23, C-01). Null when the
// module (or storage) is gone.
export async function loadModuleSerialized(
  sessionId: string,
  userId: string,
  sampleId: string,
  moduleKey: ModuleKey,
): Promise<OfflineModuleData | null> {
  if (!instance()) return null;
  return serialize(sessionKey(sessionId, userId), async () => {
    const blob = await loadSession(sessionId, userId);
    return blob?.samples[sampleId]?.modules[moduleKey] ?? null;
  });
}

// Flip a module's syncStatus after a sync attempt resolves.
export async function setModuleStatus(
  sessionId: string,
  userId: string,
  sampleId: string,
  moduleKey: ModuleKey,
  status: SyncStatus,
  // `ifData`: only flip when the stored draft still equals the data that was
  // just sent. A newer local edit (the 500 ms local debounce is independent of
  // the server save) must stay `pending` (F-offline-2).
  opts: { ifData?: Data } = {},
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  await serialize(sessionKey(sessionId, userId), async () => {
  try {
    const blob = await loadSession(sessionId, userId);
    const mod = blob?.samples[sampleId]?.modules[moduleKey];
    if (!blob || !mod) return;
    if (opts.ifData && JSON.stringify(opts.ifData) !== JSON.stringify(mod.data)) return;
    mod.syncStatus = status;
    if (status === "synced") {
      mod.attempts = 0;
      delete mod.nextAttemptAt;
    }
    await lf.setItem(sessionKey(sessionId, userId), blob);
  } catch (err) {
    markUnavailable("setModuleStatus", err);
  }
  });
}

// Apply a replay outcome to one module. `ifUpdatedAt` is the `updatedAt` of the
// data that was SENT: when the module was edited meanwhile the result is
// ignored (the newer edit stays `pending`, replayed on the next run), so a slow
// response can never mark fresh work as synced (F-offline-2). Resolves true
// when the outcome was applied.
export async function applyReplayOutcome(
  sessionId: string,
  userId: string,
  sampleId: string,
  moduleKey: ModuleKey,
  outcome: ReplayOutcome,
  opts: { ifUpdatedAt?: number } = {},
): Promise<boolean> {
  const lf = instance();
  if (!lf) return false;
  return serialize(sessionKey(sessionId, userId), async () => {
  try {
    const blob = await loadSession(sessionId, userId);
    const mod = blob?.samples[sampleId]?.modules[moduleKey];
    if (!blob || !mod) return false;
    const next = applyOutcome(mod, outcome, { ifUpdatedAt: opts.ifUpdatedAt });
    if (!next) return false;
    blob.samples[sampleId].modules[moduleKey] = next;
    await lf.setItem(sessionKey(sessionId, userId), blob);
    return true;
  } catch (err) {
    markUnavailable("applyReplayOutcome", err);
    return false;
  }
  });
}

// All of one user's blobs (small: one per session they cupped on this device).
export async function loadUserBlobs(userId: string): Promise<OfflineSessionBlob[]> {
  const keys = await listUserKeys(userId);
  const blobs: OfflineSessionBlob[] = [];
  for (const key of keys) {
    const blob = await loadByKey(key);
    if (blob) blobs.push(blob);
  }
  return blobs;
}

/** Status histogram across every session of one user on this device. */
export async function countUserStatuses(userId: string): Promise<StatusCounts> {
  return countStatuses(await loadUserBlobs(userId));
}

/** How many modules exist only on this device (everything not `synced`). */
export async function countDeviceOnly(userId: string): Promise<number> {
  return deviceOnlyCount(await countUserStatuses(userId));
}

/** Manual retry: `failed` modules go back into the queue with a clean slate. */
export async function reviveFailedModules(userId: string): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    for (const listed of await loadUserBlobs(userId)) {
      await serialize(sessionKey(listed.sessionId, listed.userId), async () => {
        // Reload inside the chain: the listed copy may be stale by now.
        const blob = await loadSession(listed.sessionId, listed.userId);
        if (!blob) return;
        let changed = false;
        for (const sample of Object.values(blob.samples)) {
          for (const [key, mod] of Object.entries(sample.modules) as [ModuleKey, OfflineModuleData][]) {
            if (mod.syncStatus === "failed") {
              sample.modules[key] = reviveFailed(mod);
              changed = true;
            }
          }
        }
        if (changed) await lf.setItem(sessionKey(blob.sessionId, blob.userId), blob);
      });
    }
  } catch (err) {
    markUnavailable("reviveFailedModules", err);
  }
}

/** One row of the "Notas sin sincronizar" panel. */
export type UnsyncedEntry = {
  sessionId: string;
  sampleId: string;
  sampleLabel: string;
  moduleKey: ModuleKey;
  status: SyncStatus;
  updatedAt: number;
  data: Data;
};

/** Terminal modules the cupper may want to read, copy or dismiss (S8-05
 *  `closed_unsent`, S8-09 `orphaned` and `failed`). Newest first. */
export async function listTerminalEntries(userId: string): Promise<UnsyncedEntry[]> {
  const out: UnsyncedEntry[] = [];
  for (const blob of await loadUserBlobs(userId)) {
    for (const [sampleId, sample] of Object.entries(blob.samples)) {
      for (const [key, mod] of Object.entries(sample.modules) as [ModuleKey, OfflineModuleData][]) {
        if (!mod || !isTerminal(mod.syncStatus)) continue;
        out.push({
          sessionId: blob.sessionId,
          sampleId,
          sampleLabel: sample.label,
          moduleKey: key,
          status: mod.syncStatus,
          updatedAt: mod.updatedAt,
          data: mod.data,
        });
      }
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Explicit, confirmed removal of one module (the orphan panel's dismiss).
 *  Drops the sample/blob when it becomes empty. Never called automatically. */
export async function removeModule(
  sessionId: string,
  userId: string,
  sampleId: string,
  moduleKey: ModuleKey,
): Promise<void> {
  const lf = instance();
  if (!lf) return;
  await serialize(sessionKey(sessionId, userId), async () => {
  try {
    const blob = await loadSession(sessionId, userId);
    const sample = blob?.samples[sampleId];
    if (!blob || !sample?.modules[moduleKey]) return;
    delete sample.modules[moduleKey];
    if (Object.keys(sample.modules).length === 0) delete blob.samples[sampleId];
    if (Object.keys(blob.samples).length === 0) {
      await lf.removeItem(sessionKey(sessionId, userId));
    } else {
      await lf.setItem(sessionKey(sessionId, userId), blob);
    }
  } catch (err) {
    markUnavailable("removeModule", err);
  }
  });
}

/** Guest claim (F-guest-5): move every blob (and cached props) of `fromUserId`
 *  to `toUserId` so the pending work replays under the signed-in account. */
export async function rekeyUserBlobs(fromUserId: string, toUserId: string): Promise<number> {
  const lf = instance();
  if (!lf || fromUserId === toUserId) return 0;
  let moved = 0;
  try {
    for (const listed of await loadUserBlobs(fromUserId)) {
      // Both keys are read-modify-written: chain on each (nested, fixed order).
      await serialize(sessionKey(listed.sessionId, fromUserId), () =>
        serialize(sessionKey(listed.sessionId, toUserId), async () => {
          const blob = await loadSession(listed.sessionId, fromUserId);
          if (!blob) return;
          const target = await loadSession(blob.sessionId, toUserId);
          await lf.setItem(sessionKey(blob.sessionId, toUserId), rekeyBlob(blob, toUserId, target));
          await lf.removeItem(sessionKey(blob.sessionId, fromUserId));
          const props = await lf.getItem<Record<string, unknown>>(propsKey(blob.sessionId, fromUserId));
          if (props) {
            await lf.setItem(propsKey(blob.sessionId, toUserId), { ...props, userId: toUserId });
            await lf.removeItem(propsKey(blob.sessionId, fromUserId));
          }
          moved += 1;
        }),
      );
    }
  } catch (err) {
    markUnavailable("rekeyUserBlobs", err);
  }
  return moved;
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

/** Record who is signed in on this device (the app shell calls it on mount so
 *  a user change can be detected even if the cup screen was never opened). */
export async function rememberUser(userId: string): Promise<void> {
  const lf = instance();
  if (!lf) return;
  try {
    await lf.setItem(LAST_USER_KEY, userId);
  } catch (err) {
    markUnavailable("rememberUser", err);
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

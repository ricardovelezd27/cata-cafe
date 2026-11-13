// Pure status machine for offline drafts (S8-09). Dependency-free so it can be
// unit-tested; lib/offline/store.ts applies these transitions to IndexedDB and
// hooks/useOfflineSync.ts feeds them the server's replay outcomes.
//
// Rules that must hold (audit 15 §4):
//   - a draft is never dropped silently: every non-`synced` status keeps the data
//   - terminal statuses (failed, closed_unsent, orphaned) are not retried on a timer
//   - an edit made while a replay was in flight wins: the replay result is only
//     applied when the module's `updatedAt` still equals the one that was sent

import type {
  OfflineModuleData,
  OfflineSessionBlob,
  SyncStatus,
} from "./types";

/** Automatic replay attempts before a module is parked as `failed`. */
export const MAX_AUTO_ATTEMPTS = 5;
export const RETRY_BASE_MS = 15_000;
export const RETRY_MAX_MS = 5 * 60_000;

/** What one replay of one module came back with. `retry` = a thrown error or a
 *  network failure (counts an attempt). `waiting` = the "pending" answer (live
 *  group session the master has not started): stays pending, no attempt burnt,
 *  no timed retry; it goes out on the next resume / online / manual sync. */
export type ReplayOutcome =
  | "synced"
  | "conflict"
  | "closed"
  | "revealed"
  | "gone"
  | "rejected"
  | "retry"
  | "waiting";

export const ALL_STATUSES: SyncStatus[] = [
  "pending",
  "synced",
  "conflict",
  "failed",
  "closed_unsent",
  "revealed_unsent",
  "orphaned",
];

/** Statuses the replay loop never touches on its own. */
export function isTerminal(status: SyncStatus): boolean {
  return (
    status === "failed" ||
    status === "closed_unsent" ||
    status === "revealed_unsent" ||
    status === "orphaned"
  );
}

/** Data that exists only on this device. Everything but `synced`. */
export function isUnsynced(status: SyncStatus): boolean {
  return status !== "synced";
}

/** A `pending` module, or a `failed` one (retries exhausted but the cupper can
 *  still send it by hand), blocks the final submit. Truly terminal statuses
 *  (closed_unsent, orphaned) and `conflict` (the modal's job) never do, so they
 *  cannot hold the cupper hostage (F-offline-4). */
export function blocksSubmit(status: SyncStatus): boolean {
  return status === "pending" || status === "failed";
}

/** Whether a stored module is what the cupper should see (and edit) in the form
 *  on mount: the local draft is newer than the server copy for `pending` and for
 *  `failed` (retries exhausted but still recoverable). Conflicts are the modal's
 *  job; closed/orphaned drafts are read-only in the notes panel. */
export function hydratesForm(status: SyncStatus): boolean {
  return status === "pending" || status === "failed";
}

export function statusForOutcome(
  outcome: ReplayOutcome,
  attempts: number,
): { status: SyncStatus; attempts: number } {
  switch (outcome) {
    case "synced":
      return { status: "synced", attempts: 0 };
    case "conflict":
      return { status: "conflict", attempts: 0 };
    case "closed":
      return { status: "closed_unsent", attempts: 0 };
    case "revealed":
      return { status: "revealed_unsent", attempts: 0 };
    case "gone":
    case "rejected":
      return { status: "orphaned", attempts: 0 };
    case "waiting":
      return { status: "pending", attempts };
    case "retry": {
      const next = attempts + 1;
      return { status: next >= MAX_AUTO_ATTEMPTS ? "failed" : "pending", attempts: next };
    }
  }
}

/** 15 s doubling to 5 min, +-20% jitter. `attempt` is 1-based (attempts so far). */
export function retryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_MAX_MS);
  const jitter = (rand() - 0.5) * 0.4 * base;
  return Math.max(1000, Math.round(base + jitter));
}

/**
 * Apply a replay result to a module. Returns null (leave the module alone) when
 * the module was edited after the replay's snapshot (`ifUpdatedAt` differs): the
 * newer local edit stays `pending` and is replayed next run, so a slow response
 * can never mark fresh work as synced (F-offline-2).
 */
export function applyOutcome(
  mod: OfflineModuleData,
  outcome: ReplayOutcome,
  opts: { ifUpdatedAt?: number; now?: number } = {},
): OfflineModuleData | null {
  if (opts.ifUpdatedAt !== undefined && mod.updatedAt !== opts.ifUpdatedAt) return null;
  // S8-23 (C-05c): a failed send of a module whose next timed attempt is not yet
  // due (a pass triggered by returning to the tab, not by the schedule) is not a
  // consumed attempt; otherwise five app switches on a captive portal park the
  // draft as `failed`. TODO(S8-23): confirm with the owner that "not due" is the
  // right reading of "nothing was attempted".
  if (outcome === "retry" && mod.nextAttemptAt !== undefined && mod.nextAttemptAt > (opts.now ?? Date.now())) {
    return mod;
  }
  const { status, attempts } = statusForOutcome(outcome, mod.attempts ?? 0);
  const next: OfflineModuleData = { ...mod, syncStatus: status, attempts };
  delete next.waiting;
  if (outcome === "waiting") {
    next.waiting = true;
    delete next.nextAttemptAt;
  } else if (status === "pending") {
    next.nextAttemptAt = (opts.now ?? Date.now()) + retryDelayMs(attempts);
  } else {
    delete next.nextAttemptAt;
  }
  return next;
}

/** S8-23 (C-05a): the banner phase after a pass. A module only `waiting` for the
 *  live session to start is not a failure: it reads as neutral (idle; the
 *  per-session indicator shows the pending copy), never "sync failed". */
export function phaseAfterPass(o: {
  anyRetry: boolean;
  stuck: boolean;
  anyWaiting: boolean;
}): "failed" | "synced" | "idle" {
  if (o.anyRetry || o.stuck) return "failed";
  if (o.anyWaiting) return "idle";
  return "synced";
}

/** Terminal orphaned notes older than this stop counting for the sign-out warning. */
export const ORPHAN_WARN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** S8-23 (C-05b): modules whose loss the sign-out / claim dialog should warn
 *  about: everything unsynced, except orphaned notes older than 30 days (the
 *  person has had a month to read them; removing one in the panel already drops
 *  it from the store). */
export function warnableCount(blobs: Iterable<OfflineSessionBlob>, now: number = Date.now()): number {
  let n = 0;
  for (const blob of blobs) {
    for (const sample of Object.values(blob.samples)) {
      for (const mod of Object.values(sample.modules)) {
        if (!mod || !isUnsynced(mod.syncStatus)) continue;
        if (mod.syncStatus === "orphaned" && now - mod.updatedAt > ORPHAN_WARN_MAX_AGE_MS) continue;
        n += 1;
      }
    }
  }
  return n;
}

/** S8-23 (C-01/C-02): what a replay pass should send for one module, decided
 *  immediately before the request from a FRESH read of the store. The pass
 *  works from a snapshot taken at its start, so by the time it reaches a module
 *  the cupper may have edited it (and the live save already delivered that
 *  edit). Sending the snapshot would put older data on the server after newer
 *  data. Returns null when the module is gone or no longer waiting to be sent,
 *  otherwise the CURRENT data and its `updatedAt` (never the snapshot's). The
 *  snapshot is accepted only to make call sites say what they are replacing. */
export function moduleToSend(
  current: OfflineModuleData | null | undefined,
  snapshot?: OfflineModuleData | null,
): { data: OfflineModuleData["data"]; updatedAt: number } | null {
  void snapshot;
  if (!current) return null;
  if (current.syncStatus !== "pending" && current.syncStatus !== "failed") return null;
  return { data: current.data, updatedAt: current.updatedAt };
}

/** Manual retry: park `failed` modules back into the queue with a clean slate. */
export function reviveFailed(mod: OfflineModuleData): OfflineModuleData {
  if (mod.syncStatus !== "failed") return mod;
  const next: OfflineModuleData = { ...mod, syncStatus: "pending", attempts: 0 };
  delete next.nextAttemptAt;
  return next;
}

export type StatusCounts = Record<SyncStatus, number>;

export function emptyCounts(): StatusCounts {
  return { pending: 0, synced: 0, conflict: 0, failed: 0, closed_unsent: 0, revealed_unsent: 0, orphaned: 0 };
}

export function countStatuses(blobs: Iterable<OfflineSessionBlob>): StatusCounts {
  const counts = emptyCounts();
  for (const blob of blobs) {
    for (const sample of Object.values(blob.samples)) {
      for (const mod of Object.values(sample.modules)) {
        if (mod) counts[mod.syncStatus] += 1;
      }
    }
  }
  return counts;
}

/** Modules that exist only on this device. */
export function deviceOnlyCount(counts: StatusCounts): number {
  return ALL_STATUSES.reduce((n, s) => (isUnsynced(s) ? n + counts[s] : n), 0);
}

/** Rewrite a blob for a new owner (guest claim: the anonymous id is deleted and
 *  the work must replay under the signed-in account). When the target already
 *  holds a blob for the same session, modules merge and the newer edit wins. */
export function rekeyBlob(
  from: OfflineSessionBlob,
  toUserId: string,
  existing?: OfflineSessionBlob | null,
): OfflineSessionBlob {
  const base: OfflineSessionBlob = existing
    ? { ...existing, samples: { ...existing.samples } }
    : { ...from, userId: toUserId, samples: {} };
  for (const [sampleId, sample] of Object.entries(from.samples)) {
    const target = base.samples[sampleId] ?? { label: sample.label, modules: {} };
    const modules = { ...target.modules };
    for (const [key, mod] of Object.entries(sample.modules) as [
      keyof typeof sample.modules,
      OfflineModuleData | undefined,
    ][]) {
      if (!mod) continue;
      const have = modules[key];
      if (!have || have.updatedAt < mod.updatedAt) modules[key] = mod;
    }
    base.samples[sampleId] = { label: target.label || sample.label, modules };
  }
  base.userId = toUserId;
  base.updatedAt = Math.max(base.updatedAt, from.updatedAt);
  return base;
}

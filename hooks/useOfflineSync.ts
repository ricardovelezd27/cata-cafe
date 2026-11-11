"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { replayEvaluation, replayPhysical, replayExtrinsic } from "@/app/actions/offline";
import {
  applyReplayOutcome,
  loadModuleSerialized,
  loadSession,
  loadUserBlobs,
  reviveFailedModules,
  setModuleStatus,
} from "@/lib/offline/store";
import type { EvalModuleKey } from "@/lib/evaluation";
import { moduleToSend, phaseAfterPass, type ReplayOutcome } from "@/lib/offline/status";
import {
  EVALUATION_MODULES,
  type Data,
  type ModuleKey,
  type SyncConflict,
} from "@/lib/offline/types";
import { useResume } from "@/hooks/useResume";

export type SyncPhase = "idle" | "syncing" | "synced" | "failed";

// Fired on window after every replay run (success or failure) — see syncAll.
export const OFFLINE_SYNC_EVENT = "cata-offline-sync";

// In-run retries of ONE module (thrown error / network failure). Across runs the
// module's own `attempts` counter decides when it is parked as `failed`.
const MAX_RETRIES = 3;
const SYNCED_BANNER_MS = 3000;
const STALE_RERUN_MS = 1000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1s, 2s, 4s (attempt is 1-based) ± 250ms jitter.
function backoffDelay(attempt: number): number {
  const base = 1000 * 2 ** (attempt - 1);
  const jitter = Math.round((Math.random() - 0.5) * 500);
  return Math.max(0, base + jitter);
}

// CupClient and SessionSyncStatus both mount this hook, and the per-instance
// ref could not stop two instances replaying the same module at once. One lock
// for the whole page (S8-09, F-offline-2).
// A late caller awaits the pass in flight instead of silently returning, so a
// manual "Enviar" or a sign-out guard recount never reads a half-done queue.
let inflight: Promise<void> | null = null;

type ReplayResult = ReplayOutcome | "offline";

// Drives sync-on-reconnect for the current user. A replay runs on every
// offline→online edge, on resume (tab visible again, bfcache restore), once on
// an online mount, and on a bounded jittered schedule (15 s doubling to 5 min)
// while anything is still `pending`. Modules that hit a permanent outcome are
// parked (`closed_unsent`, `orphaned`, `failed`) and never retried on a timer.
export function useOfflineSync({
  userId,
  online,
}: {
  userId: string;
  online: boolean;
}) {
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);

  const onlineRef = useRef(online);
  const runRef = useRef(0);
  const prevOnline = useRef(online);
  const didMount = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAllRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});

  // Replay a single module with in-run retries. Retries ONLY on thrown errors;
  // every returned status is final for this run.
  const replayModule = useCallback(
    async (
      sampleId: string,
      moduleKey: ModuleKey,
      data: Data,
      cupsPerSample: number,
      force: boolean,
      // S8-18: the draft's last edit time, so the server can order this replay.
      clientTs?: number,
    ): Promise<ReplayResult> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (!onlineRef.current) return "offline";
        try {
          if (EVALUATION_MODULES.includes(moduleKey)) {
            const res = await replayEvaluation({
              sessionSampleId: sampleId,
              moduleKey: moduleKey as EvalModuleKey,
              data,
              cupsPerSample,
              force,
              clientTs,
            });
            // "pending" = the master has not started this live session yet; the
            // draft stays pending without burning an attempt (no fast retry).
            return res.status === "pending" ? "waiting" : res.status;
          }
          const res =
            moduleKey === "physical"
              ? await replayPhysical({ sessionSampleId: sampleId, data })
              : await replayExtrinsic({ sessionSampleId: sampleId, data });
          return res.status;
        } catch {
          if (attempt < MAX_RETRIES) await wait(backoffDelay(attempt));
        }
      }
      return "retry";
    },
    [],
  );

  // Conflicts are rebuilt from the durable blobs, never kept only in React
  // state: a reload (or a second tab) must not lose them (F-offline-3).
  const rebuildConflicts = useCallback(async () => {
    const found: SyncConflict[] = [];
    for (const blob of await loadUserBlobs(userId)) {
      for (const [sampleId, sample] of Object.entries(blob.samples)) {
        for (const moduleKey of Object.keys(sample.modules) as ModuleKey[]) {
          if (sample.modules[moduleKey]?.syncStatus !== "conflict") continue;
          found.push({
            sessionId: blob.sessionId,
            userId: blob.userId,
            sampleId,
            sampleLabel: sample.label,
            moduleKey,
            cupsPerSample: blob.cupsPerSample,
          });
        }
      }
    }
    setConflicts(found);
  }, [userId]);

  const scheduleNext = useCallback(async (rerunSoon: boolean) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    let due: number | null = null;
    if (rerunSoon) {
      due = Date.now() + STALE_RERUN_MS;
    } else {
      for (const blob of await loadUserBlobs(userId)) {
        for (const sample of Object.values(blob.samples)) {
          for (const mod of Object.values(sample.modules)) {
            if (mod?.syncStatus !== "pending" || mod.waiting) continue;
            const at = mod.nextAttemptAt ?? Date.now() + 15_000;
            if (due === null || at < due) due = at;
          }
        }
      }
    }
    setNextRetryAt(rerunSoon ? null : due);
    if (due === null || !onlineRef.current) return;
    timerRef.current = setTimeout(
      () => void syncAllRef.current(),
      Math.max(1000, due - Date.now()),
    );
  }, [userId]);

  const runPass = useCallback(
    async (manual: boolean) => {
      const myRun = ++runRef.current;
      setSyncPhase("syncing");

      let anyRetry = false;
      let skippedStale = false;
      let anyWaiting = false;

      try {
        if (manual) await reviveFailedModules(userId);
        const blobs = await loadUserBlobs(userId);
        outer: for (const blob of blobs) {
          for (const [sampleId, sample] of Object.entries(blob.samples)) {
            for (const moduleKey of Object.keys(sample.modules) as ModuleKey[]) {
              // Bail cooperatively if a newer run started or we dropped offline.
              if (runRef.current !== myRun || !onlineRef.current) {
                anyRetry = true;
                break outer;
              }
              const mod = sample.modules[moduleKey];
              if (!mod || mod.syncStatus !== "pending") continue;

              // C-01/C-02: `mod` is the pass-start snapshot. Re-read it now and
              // send what is stored NOW, or nothing if a live save already
              // delivered it, so an older draft can never land after a newer one.
              const fresh = moduleToSend(
                await loadModuleSerialized(blob.sessionId, blob.userId, sampleId, moduleKey),
                mod,
              );
              if (!fresh) continue;
              const sentAt = fresh.updatedAt;
              const result = await replayModule(
                sampleId,
                moduleKey,
                fresh.data,
                blob.cupsPerSample,
                false,
                sentAt,
              );
              if (result === "offline") {
                anyRetry = true;
                break outer;
              }
              const applied = await applyReplayOutcome(
                blob.sessionId,
                blob.userId,
                sampleId,
                moduleKey,
                result,
                { ifUpdatedAt: sentAt },
              );
              // Edited while the request was in flight: the newer edit stays
              // pending and goes out on a quick follow-up run.
              if (!applied) skippedStale = true;
              else if (result === "retry") anyRetry = true;
              else if (result === "waiting") anyWaiting = true;
            }
          }
        }
        await rebuildConflicts();

        // A module parked as `failed` (5 attempts) is not retried on a timer, so
        // the banner must keep offering the manual retry instead of "synced".
        const stuck = (await loadUserBlobs(userId)).some((b) =>
          Object.values(b.samples).some((s) =>
            Object.values(s.modules).some((m) => m?.syncStatus === "failed"),
          ),
        );

        if (runRef.current === myRun) {
          const phase = phaseAfterPass({ anyRetry, stuck, anyWaiting });
          setSyncPhase(phase);
          if (phase === "synced") {
            setTimeout(() => {
              if (runRef.current === myRun) setSyncPhase("idle");
            }, SYNCED_BANNER_MS);
          }
        }
        await scheduleNext(skippedStale);
      } finally {
        // Let independent pending-count readers (the app-shell
        // PendingDraftsBadge, the results-page sync pill) recount now instead of
        // waiting for the next mount or `online` event.
        window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
      }
    },
    [userId, replayModule, rebuildConflicts, scheduleNext],
  );

  // One replay at a time across every hook instance. A late caller waits for the
  // pass in flight; a manual one then runs its own (it revives `failed` modules).
  const syncAll = useCallback(
    async (manual = false) => {
      if (!onlineRef.current) return;
      while (inflight) {
        await inflight.catch(() => {});
        if (!manual || !onlineRef.current) return;
      }
      const pass = runPass(manual);
      inflight = pass;
      try {
        await pass;
      } finally {
        if (inflight === pass) inflight = null;
      }
    },
    [runPass],
  );

  useEffect(() => {
    syncAllRef.current = syncAll;
  }, [syncAll]);

  // Resolve a submit-conflict from the modal. `replace` forces the local
  // version over the already-submitted one; otherwise the local module is
  // discarded (marked synced).
  const resolveConflict = useCallback(
    async (conflict: SyncConflict, replace: boolean) => {
      if (replace) {
        const blob = await loadSession(conflict.sessionId, conflict.userId);
        const mod = blob?.samples[conflict.sampleId]?.modules[conflict.moduleKey];
        if (mod) {
          const result = await replayModule(
            conflict.sampleId,
            conflict.moduleKey,
            mod.data,
            conflict.cupsPerSample,
            true,
            mod.updatedAt,
          );
          if (result === "offline" || result === "retry" || result === "waiting" || result === "conflict") return; // keep it for a later retry
          await applyReplayOutcome(
            conflict.sessionId,
            conflict.userId,
            conflict.sampleId,
            conflict.moduleKey,
            result,
            { ifUpdatedAt: mod.updatedAt },
          );
        }
      } else {
        await setModuleStatus(
          conflict.sessionId,
          conflict.userId,
          conflict.sampleId,
          conflict.moduleKey,
          "synced",
        );
      }
      await rebuildConflicts();
      window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
    },
    [replayModule, rebuildConflicts],
  );

  // Conflicts survive a reload: show them as soon as the hook mounts, even
  // offline.
  useEffect(() => {
    // Mirrors durable storage into React state once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void rebuildConflicts();
  }, [rebuildConflicts]);

  useEffect(() => {
    onlineRef.current = online;
    const reconnected = online && !prevOnline.current;
    const firstOnlineMount = online && !didMount.current;
    if (reconnected || firstOnlineMount) void syncAll();
    if (!online && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    prevOnline.current = online;
    didMount.current = true;
  }, [online, syncAll]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useResume(() => {
    if (onlineRef.current) void syncAll();
  });

  const retrySync = useCallback(() => syncAll(true), [syncAll]);

  return {
    syncPhase,
    conflicts,
    resolveConflict,
    retrySync,
    nextRetryAt,
  };
}

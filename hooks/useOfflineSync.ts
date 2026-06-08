"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { syncEvaluation } from "@/app/actions/offline";
import { upsertPhysical, upsertExtrinsic } from "@/app/actions/sessions";
import {
  listUserKeys,
  loadByKey,
  loadSession,
  setModuleStatus,
} from "@/lib/offline/store";
import type { EvalModuleKey } from "@/lib/evaluation";
import {
  EVALUATION_MODULES,
  type Data,
  type ModuleKey,
  type SyncConflict,
} from "@/lib/offline/types";

export type SyncPhase = "idle" | "syncing" | "synced" | "failed";

const MAX_RETRIES = 3;
const SYNCED_BANNER_MS = 3000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1s, 2s, 4s (attempt is 1-based) ± 250ms jitter.
function backoffDelay(attempt: number): number {
  const base = 1000 * 2 ** (attempt - 1);
  const jitter = Math.round((Math.random() - 0.5) * 500);
  return Math.max(0, base + jitter);
}

type ReplayResult = "synced" | "conflict" | "failed";

// Drives sync-on-reconnect for the current user. On every offline→online edge
// (and once on an online mount, to flush anything left from a prior session) it
// replays every `pending` module through the server actions with bounded
// exponential-backoff retries, collecting submit-conflicts for the modal.
export function useOfflineSync({
  userId,
  online,
}: {
  userId: string;
  online: boolean;
}) {
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const onlineRef = useRef(online);
  const syncingRef = useRef(false);
  const runRef = useRef(0);
  const prevOnline = useRef(online);
  const didMount = useRef(false);

  // Replay a single module with retries. Retries ONLY on thrown errors; a
  // `conflict` is a successful response and is returned immediately.
  const replayModule = useCallback(
    async (
      sampleId: string,
      moduleKey: ModuleKey,
      data: Data,
      cupsPerSample: number,
      force: boolean,
    ): Promise<ReplayResult> => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (!onlineRef.current) return "failed";
        try {
          if (EVALUATION_MODULES.includes(moduleKey)) {
            const res = await syncEvaluation({
              sessionSampleId: sampleId,
              moduleKey: moduleKey as EvalModuleKey,
              data,
              cupsPerSample,
              force,
            });
            return res.status;
          }
          if (moduleKey === "physical") {
            await upsertPhysical({ sessionSampleId: sampleId, data });
          } else {
            await upsertExtrinsic({ sessionSampleId: sampleId, data });
          }
          return "synced";
        } catch {
          if (attempt < MAX_RETRIES) await wait(backoffDelay(attempt));
        }
      }
      return "failed";
    },
    [],
  );

  const syncAll = useCallback(async () => {
    if (syncingRef.current || !onlineRef.current) return;
    syncingRef.current = true;
    const myRun = ++runRef.current;
    setSyncPhase("syncing");

    let anyFailed = false;
    const collected: SyncConflict[] = [];

    try {
      const keys = await listUserKeys(userId);
      outer: for (const key of keys) {
        const blob = await loadByKey(key);
        if (!blob) continue;
        for (const [sampleId, sample] of Object.entries(blob.samples)) {
          for (const moduleKey of Object.keys(sample.modules) as ModuleKey[]) {
            // Bail cooperatively if a newer run started or we dropped offline.
            if (runRef.current !== myRun || !onlineRef.current) {
              anyFailed = true;
              break outer;
            }
            const mod = sample.modules[moduleKey];
            if (!mod || mod.syncStatus !== "pending") continue;

            const result = await replayModule(
              sampleId,
              moduleKey,
              mod.data,
              blob.cupsPerSample,
              false,
            );
            if (result === "synced") {
              await setModuleStatus(blob.sessionId, blob.userId, sampleId, moduleKey, "synced");
            } else if (result === "conflict") {
              await setModuleStatus(blob.sessionId, blob.userId, sampleId, moduleKey, "conflict");
              collected.push({
                sessionId: blob.sessionId,
                userId: blob.userId,
                sampleId,
                sampleLabel: sample.label,
                moduleKey,
                cupsPerSample: blob.cupsPerSample,
              });
            } else {
              anyFailed = true;
            }
          }
        }
      }

      if (collected.length) {
        setConflicts((prev) => {
          const seen = new Set(prev.map((c) => `${c.sessionId}:${c.sampleId}:${c.moduleKey}`));
          const fresh = collected.filter(
            (c) => !seen.has(`${c.sessionId}:${c.sampleId}:${c.moduleKey}`),
          );
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }

      if (runRef.current === myRun) {
        setSyncPhase(anyFailed ? "failed" : "synced");
        if (!anyFailed) {
          setTimeout(() => {
            if (runRef.current === myRun) setSyncPhase("idle");
          }, SYNCED_BANNER_MS);
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [userId, replayModule]);

  // Resolve a submit-conflict from the modal. `replace` forces the local
  // version over the already-submitted one; otherwise the local module is
  // discarded (marked synced).
  const resolveConflict = useCallback(
    async (conflict: SyncConflict, replace: boolean) => {
      if (replace) {
        const blob = await loadSession(conflict.sessionId, conflict.userId);
        const data = blob?.samples[conflict.sampleId]?.modules[conflict.moduleKey]?.data;
        if (data) {
          const result = await replayModule(
            conflict.sampleId,
            conflict.moduleKey,
            data,
            conflict.cupsPerSample,
            true,
          );
          if (result === "failed") return; // keep the conflict for a later retry
        }
      }
      await setModuleStatus(
        conflict.sessionId,
        conflict.userId,
        conflict.sampleId,
        conflict.moduleKey,
        "synced",
      );
      setConflicts((prev) =>
        prev.filter(
          (c) =>
            !(
              c.sessionId === conflict.sessionId &&
              c.sampleId === conflict.sampleId &&
              c.moduleKey === conflict.moduleKey
            ),
        ),
      );
    },
    [replayModule],
  );

  useEffect(() => {
    onlineRef.current = online;
    const reconnected = online && !prevOnline.current;
    const firstOnlineMount = online && !didMount.current;
    if (reconnected || firstOnlineMount) void syncAll();
    prevOnline.current = online;
    didMount.current = true;
  }, [online, syncAll]);

  return {
    syncPhase,
    conflicts,
    resolveConflict,
    retrySync: syncAll,
  };
}

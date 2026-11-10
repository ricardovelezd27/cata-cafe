"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import {
  listUserKeys,
  loadByKey,
  isOfflineStorageUnavailable,
  onOfflineStorageUnavailable,
} from "@/lib/offline/store";
import { OFFLINE_SYNC_EVENT } from "@/hooks/useOfflineSync";
import { isStandalone } from "@/lib/platform/env";
import { getPersistState, shouldWarnStaleDraft } from "@/lib/platform/storage";

// App-shell-wide indicator: counts every evaluation module across every
// session that is still `pending` (saved locally, not yet replayed to the
// server) for the current user. Independent of the cup screen — a cupper who
// closed the tab mid-tasting still sees this on the dashboard, coffees list,
// etc. Renders nothing when there is nothing pending or when IndexedDB has
// already proven unavailable in this browser (nothing to report).
export function PendingDraftsBadge({
  userId,
  locale,
  label,
  staleLabel,
}: {
  userId: string;
  locale: string;
  /** Raw translation template containing the literal "{count}" placeholder. */
  label: string;
  /** Shown when the oldest unsynced draft is over 3 days old and the app is not installed. */
  staleLabel?: string;
}) {
  const [count, setCount] = useState(0);
  const [firstSessionId, setFirstSessionId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const storageUnavailable = useSyncExternalStore(
    onOfflineStorageUnavailable,
    isOfflineStorageUnavailable,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const keys = await listUserKeys(userId);
      let total = 0;
      let first: string | null = null;
      let oldest: number | null = null;
      for (const key of keys) {
        const blob = await loadByKey(key);
        if (!blob) continue;
        for (const sample of Object.values(blob.samples)) {
          for (const mod of Object.values(sample.modules)) {
            if (mod?.syncStatus === "pending") {
              total += 1;
              if (typeof mod.updatedAt === "number" && (oldest === null || mod.updatedAt < oldest)) {
                oldest = mod.updatedAt;
              }
              if (!first) first = blob.sessionId;
            }
          }
        }
      }
      if (!cancelled) {
        setCount(total);
        setFirstSessionId(first);
        setStale(
          shouldWarnStaleDraft({
            oldestPendingAt: oldest,
            now: Date.now(),
            standalone: isStandalone(),
            persist: getPersistState(),
          }),
        );
      }
    };

    void refresh();
    window.addEventListener("online", refresh);
    // Recount as soon as a replay run finishes (cup screen or results pill),
    // so the badge never keeps announcing drafts that just synced.
    window.addEventListener(OFFLINE_SYNC_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      window.removeEventListener(OFFLINE_SYNC_EVENT, refresh);
    };
  }, [userId]);

  if (count === 0 || storageUnavailable) return null;

  const text = label.replace("{count}", String(count));
  const pill = <Badge tone="accent">{text}</Badge>;

  return (
    <div className="px-4 lg:px-6 pt-2">
      {firstSessionId ? (
        <Link
          href={`/${locale}/app/sessions/${firstSessionId}/cup`}
          className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 rounded-pill"
        >
          {pill}
        </Link>
      ) : (
        pill
      )}
      {stale && staleLabel && (
        <p role="status" className="mt-1 max-w-prose text-xs text-on-surface-variant">
          {staleLabel}
        </p>
      )}
    </div>
  );
}

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
  closedLabel,
}: {
  userId: string;
  locale: string;
  /** Raw translation template containing the literal "{count}" placeholder. */
  label: string;
  /** Raw template with "{count}": drafts kept on the device because their
   *  session closed before they reached the server (S8-05). */
  closedLabel?: string;
}) {
  const [count, setCount] = useState(0);
  const [firstSessionId, setFirstSessionId] = useState<string | null>(null);
  const [closedCount, setClosedCount] = useState(0);
  const [firstClosedSessionId, setFirstClosedSessionId] = useState<string | null>(null);

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
      let closedTotal = 0;
      let firstClosed: string | null = null;
      for (const key of keys) {
        const blob = await loadByKey(key);
        if (!blob) continue;
        for (const sample of Object.values(blob.samples)) {
          for (const mod of Object.values(sample.modules)) {
            if (mod?.syncStatus === "pending") {
              total += 1;
              if (!first) first = blob.sessionId;
            } else if (mod?.syncStatus === "closed_unsent") {
              closedTotal += 1;
              if (!firstClosed) firstClosed = blob.sessionId;
            }
          }
        }
      }
      if (!cancelled) {
        setCount(total);
        setFirstSessionId(first);
        setClosedCount(closedTotal);
        setFirstClosedSessionId(firstClosed);
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

  if ((count === 0 && closedCount === 0) || storageUnavailable) return null;

  const text = label.replace("{count}", String(count));
  const pill = <Badge tone="accent">{text}</Badge>;
  const closedPill =
    closedCount > 0 && closedLabel ? (
      <Badge tone="accent">{closedLabel.replace("{count}", String(closedCount))}</Badge>
    ) : null;
  const linkClass =
    "inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 rounded-pill";

  return (
    <div className="flex flex-wrap gap-2 px-4 lg:px-6 pt-2">
      {count > 0 &&
        (firstSessionId ? (
          <Link href={`/${locale}/app/sessions/${firstSessionId}/cup`} className={linkClass}>
            {pill}
          </Link>
        ) : (
          pill
        ))}
      {closedPill &&
        (firstClosedSessionId ? (
          <Link
            href={`/${locale}/app/sessions/${firstClosedSessionId}/results?closed=1`}
            className={linkClass}
          >
            {closedPill}
          </Link>
        ) : (
          closedPill
        ))}
    </div>
  );
}

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
import {
  UnsyncedNotesPanel,
  type UnsyncedNotesTranslations,
} from "@/components/offline/UnsyncedNotesPanel";

// App-shell-wide indicator: counts every evaluation module across every
// session that is still on this device only, for the current user. Independent
// of the cup screen — a cupper who closed the tab mid-tasting still sees this
// on the dashboard, coffees list, etc. Three tones (S8-09):
//   - pending / failed: waiting to sync (accent); link to the cup screen
//   - conflict: needs the cupper's decision (danger)
//   - terminal (closed_unsent, orphaned): can never sync; opens the
//     "Notas sin sincronizar" panel (accent when only closed, danger otherwise)
// Renders nothing when there is nothing to report or when IndexedDB has already
// proven unavailable in this browser.
export function PendingDraftsBadge({
  userId,
  locale,
  label,
  notesLabel,
  conflictLabel,
  panelTranslations,
  staleLabel,
}: {
  userId: string;
  locale: string;
  /** Raw translation template containing the literal "{count}" placeholder. */
  label: string;
  /** Raw template with "{count}": terminal notes (closed session, deleted
   *  sample), opens the panel. */
  notesLabel: string;
  /** Raw template with "{count}": conflicts waiting for a decision. */
  conflictLabel: string;
  panelTranslations: UnsyncedNotesTranslations;
  /** Shown when the oldest unsynced draft is over 3 days old and the app is not installed. */
  staleLabel?: string;
}) {
  const [counts, setCounts] = useState({ waiting: 0, conflict: 0, terminal: 0, severe: 0 });
  const [firstSessionId, setFirstSessionId] = useState<string | null>(null);
  const [firstConflictSessionId, setFirstConflictSessionId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
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
      const next = { waiting: 0, conflict: 0, terminal: 0, severe: 0 };
      let first: string | null = null;
      let firstConflict: string | null = null;
      let oldest: number | null = null;
      for (const key of keys) {
        const blob = await loadByKey(key);
        if (!blob) continue;
        for (const sample of Object.values(blob.samples)) {
          for (const mod of Object.values(sample.modules)) {
            // Stale-draft warning (S8-15): the oldest module still waiting to
            // reach the server (pending, or failed after repeated attempts).
            if (
              (mod?.syncStatus === "pending" || mod?.syncStatus === "failed") &&
              typeof mod.updatedAt === "number" &&
              (oldest === null || mod.updatedAt < oldest)
            ) {
              oldest = mod.updatedAt;
            }
            switch (mod?.syncStatus) {
              case "pending":
                next.waiting += 1;
                if (!first) first = blob.sessionId;
                break;
              case "failed":
                // Stuck after repeated attempts: counts as waiting (manual
                // retry lives in the banner) but is also a terminal note.
                next.terminal += 1;
                next.severe += 1;
                break;
              case "conflict":
                next.conflict += 1;
                if (!firstConflict) firstConflict = blob.sessionId;
                break;
              case "closed_unsent":
              case "revealed_unsent":
                next.terminal += 1;
                break;
              case "orphaned":
                next.terminal += 1;
                next.severe += 1;
                break;
              default:
                break;
            }
          }
        }
      }
      if (!cancelled) {
        setCounts(next);
        setFirstSessionId(first);
        setFirstConflictSessionId(firstConflict);
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

  if (
    (counts.waiting === 0 && counts.conflict === 0 && counts.terminal === 0) ||
    storageUnavailable
  ) {
    return null;
  }

  const linkClass =
    "inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 rounded-pill";
  const waitingPill = (
    <Badge tone="accent">{label.replace("{count}", String(counts.waiting))}</Badge>
  );

  return (
    <div className="flex flex-wrap gap-2 px-4 lg:px-6 pt-2">
      {counts.waiting > 0 &&
        (firstSessionId ? (
          <Link href={`/${locale}/app/sessions/${firstSessionId}/cup`} className={linkClass}>
            {waitingPill}
          </Link>
        ) : (
          waitingPill
        ))}
      {counts.conflict > 0 &&
        (() => {
          const pill = (
            <Badge tone="danger">
              {conflictLabel.replace("{count}", String(counts.conflict))}
            </Badge>
          );
          return firstConflictSessionId ? (
            <Link href={`/${locale}/app/sessions/${firstConflictSessionId}/cup`} className={linkClass}>
              {pill}
            </Link>
          ) : (
            pill
          );
        })()}
      {counts.terminal > 0 && (
        <>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className={linkClass}
            aria-haspopup="dialog"
          >
            <Badge tone={counts.severe > 0 ? "danger" : "accent"}>
              {notesLabel.replace("{count}", String(counts.terminal))}
            </Badge>
          </button>
          <UnsyncedNotesPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            userId={userId}
            locale={locale}
            translations={panelTranslations}
          />
        </>
      )}
      {stale && staleLabel && (
        <p role="status" className="mt-1 max-w-prose text-xs text-on-surface-variant">
          {staleLabel}
        </p>
      )}
    </div>
  );
}

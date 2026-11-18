"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, CloudOff, WifiOff } from "lucide-react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { loadSession } from "@/lib/offline/store";
import { SyncConflictModal, type SyncConflictTranslations } from "@/components/offline/SyncConflictModal";
import { Notice, type NoticeTone } from "@/components/ui/Notice";

export type SessionSyncStatusTranslations = SyncConflictTranslations & {
  // RAW templates containing the literal "{count}" — substituted client-side
  // (the plural was resolved server-side with a placeholder count).
  syncing: string;
  pending: string;
  offline: string;
  retry: string;
  synced: string;
  /** RAW template with "{count}": drafts kept on the device because the
   *  session was already closed (S8-05). */
  closedUnsent?: string;
  /** RAW template with "{count}": notes refused because the sample was revealed (S10 WP3a). */
  revealedUnsent?: string;
};

// Results-page twin of the cup screen's OfflineBanner: shows a live pill ONLY
// when this session has evaluation modules saved on the device that have not
// reached the server (a save that failed under load, a tab closed mid-debounce,
// an offline stretch). Drives the same reconnect replay the cup screen uses,
// refreshes the page once the replay lands so the tables pick up the data,
// and hosts the submit-conflict modal so a conflict can be resolved here
// instead of only back in /cup. Renders nothing when nothing is pending.
export function SessionSyncStatus({
  sessionId,
  userId,
  translations: t,
}: {
  sessionId: string;
  userId: string;
  translations: SessionSyncStatusTranslations;
}) {
  const router = useRouter();
  const { online } = useConnectivity();
  const { syncPhase, conflicts, resolveConflict, retrySync } = useOfflineSync({ userId, online });
  const [pendingCount, setPendingCount] = useState(0);
  const [closedUnsentCount, setClosedUnsentCount] = useState(0);
  const [revealedUnsentCount, setRevealedUnsentCount] = useState(0);
  // Show the green "synced" line only for a replay that actually pushed
  // something — the hook reports "synced" after every no-op run too.
  const [justSynced, setJustSynced] = useState(false);
  const hadPendingRef = useRef(false);

  const rescan = useCallback(async () => {
    const blob = await loadSession(sessionId, userId);
    let count = 0;
    let closedCount = 0;
    let revealedCount = 0;
    if (blob) {
      for (const sample of Object.values(blob.samples)) {
        for (const mod of Object.values(sample.modules)) {
          if (mod?.syncStatus === "pending" || mod?.syncStatus === "failed") count += 1;
          else if (mod?.syncStatus === "closed_unsent" || mod?.syncStatus === "orphaned") closedCount += 1;
          else if (mod?.syncStatus === "revealed_unsent") revealedCount += 1;
        }
      }
    }
    setPendingCount(count);
    setClosedUnsentCount(closedCount);
    setRevealedUnsentCount(revealedCount);
    if (count > 0) hadPendingRef.current = true;
  }, [sessionId, userId]);

  useEffect(() => {
    const handler = () => void rescan();
    handler();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [rescan]);

  // Re-count after every replay run; when a run drained a queue that was
  // non-empty, flash the synced line and pull fresh server data once.
  useEffect(() => {
    void (async () => {
      await rescan();
      if (syncPhase === "synced" && hadPendingRef.current) {
        hadPendingRef.current = false;
        setJustSynced(true);
        router.refresh();
        setTimeout(() => setJustSynced(false), 3000);
      }
    })();
  }, [syncPhase, rescan, router]);

  const fill = (template: string) => template.replace("{count}", String(pendingCount));

  let line: { tone: "info" | "warn" | "success"; icon: ReactNode; text: string; retry: boolean } | null =
    null;
  if (pendingCount > 0 && !online) {
    line = { tone: "warn", icon: <WifiOff size={14} aria-hidden />, text: fill(t.offline), retry: false };
  } else if (pendingCount > 0 && syncPhase === "syncing") {
    line = {
      tone: "info",
      icon: <RefreshCw size={14} aria-hidden className="animate-spin" />,
      text: fill(t.syncing),
      retry: false,
    };
  } else if (pendingCount > 0) {
    line = { tone: "warn", icon: <CloudOff size={14} aria-hidden />, text: fill(t.pending), retry: true };
  } else if (
    (closedUnsentCount > 0 && t.closedUnsent) ||
    (revealedUnsentCount > 0 && t.revealedUnsent)
  ) {
    // S10 WP6 C3: when both kinds exist, say both (the line used to hide the second).
    const parts: string[] = [];
    if (closedUnsentCount > 0 && t.closedUnsent) {
      parts.push(t.closedUnsent.replace("{count}", String(closedUnsentCount)));
    }
    if (revealedUnsentCount > 0 && t.revealedUnsent) {
      parts.push(t.revealedUnsent.replace("{count}", String(revealedUnsentCount)));
    }
    line = { tone: "warn", icon: <CloudOff size={14} aria-hidden />, text: parts.join(" "), retry: false };
  } else if (justSynced) {
    line = { tone: "success", icon: <CheckCircle2 size={14} aria-hidden />, text: t.synced, retry: false };
  }

  // P2b (E-05): the frame is a Notice. Same lines, same conditions, same retry; the
  // terracotta goes: what is waiting or unsent needs attention (warning), "syncing" and
  // "synced" are information. `role="status"` (polite) comes from Notice, as before.
  const noticeTone: Record<"info" | "warn" | "success", NoticeTone> = {
    info: "info",
    warn: "warning",
    success: "info",
  };

  return (
    <>
      {line && (
        <Notice
          tone={noticeTone[line.tone]}
          icon={line.icon}
          className="mx-4 mt-4 lg:mx-6"
          action={
            line.retry ? (
              <button
                type="button"
                onClick={() => void retrySync()}
                className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-2 hover:opacity-80"
              >
                {t.retry}
              </button>
            ) : undefined
          }
        >
          {line.text}
        </Notice>
      )}
      <SyncConflictModal
        conflicts={conflicts.filter((c) => c.sessionId === sessionId)}
        onResolve={async (conflict, replace) => {
          await resolveConflict(conflict, replace);
          await rescan();
          if (replace) router.refresh();
        }}
        translations={t}
      />
    </>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import type { SyncPhase } from "@/hooks/useOfflineSync";
import { reloadIdentity } from "@/lib/identityResolve";
import { isIdentityChanged, onIdentityChanged, registerIdentityNoticeHost } from "@/lib/identityChange";
import { Notice, type NoticeTone } from "@/components/ui/Notice";
import { TextAction } from "@/components/ui";

export type OfflineBannerTranslations = {
  bannerOffline: string;
  bannerReconnecting: string;
  bannerSynced: string;
  bannerSyncFailed: string;
  retrySync: string;
  bannerStorageUnavailable: string;
  /** offline.reloadNow: label of the identity notice's reload button. Optional:
   *  pre-upgrade prop blobs lack it. (The new-version notice is no longer
   *  rendered here: components/offline/StaleBundleNotice.tsx, S10 WP9b.) */
  reloadNow?: string;
  /** errors.codes.identity_changed (S10 WP8 fourth review): the cup page shows the
   *  "this device changed user" notice HERE because the cup shell covers the
   *  layout bar. Optional: pre-upgrade prop blobs lack it. */
  bannerIdentityChanged?: string;
  /** RAW template with "{seconds}" (optional: older cached props lack it). */
  bannerNextAttempt?: string;
};

// Persistent connectivity banner shown at the top of the cupping canvas.
// Renders nothing when online and idle.
export function OfflineBanner({
  online,
  syncPhase,
  onRetry,
  translations: t,
  storageUnavailable = false,
  nextRetryAt = null,
  renderedUserId,
}: {
  online: boolean;
  syncPhase: SyncPhase;
  onRetry: () => void;
  translations: OfflineBannerTranslations;
  /** Epoch ms of the next automatic attempt (useOfflineSync), shown as a
   *  countdown next to the failed-sync message. */
  nextRetryAt?: number | null;
  /** IndexedDB has proven unreliable in this browser (quota, private mode…) —
   *  takes priority over every connectivity state: if local drafts can't be
   *  saved at all, telling the cupper "saved locally" would be misleading. */
  storageUnavailable?: boolean;
  /** The user this page was rendered for: the identity notice's reload button
   *  re-keys a claimed guest's drafts through reloadIdentity (S10 WP8b). */
  renderedUserId?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!nextRetryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextRetryAt]);
  // S10 WP8: a positive "a different user is signed in" finding (module latch).
  // Shown FIRST, before the new-version notice. Registering as the notice host
  // keeps the layout's IdentityWatcher bar from showing the same message too.
  const identityChanged = useSyncExternalStore(onIdentityChanged, isIdentityChanged, () => false);
  const hostsIdentityNotice = !!t.bannerIdentityChanged;
  useEffect(() => {
    if (!hostsIdentityNotice) return;
    return registerIdentityNoticeHost();
  }, [hostsIdentityNotice]);
  const showIdentity = identityChanged && hostsIdentityNotice;
  const secondsLeft = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;

  let tone: "offline" | "info" | "success" | "warn" | null = null;
  let message = "";
  let icon = null;
  let showRetry = false;

  if (showIdentity) {
    tone = "warn";
    message = t.bannerIdentityChanged ?? "";
    icon = <RefreshCw size={15} aria-hidden />;
  } else if (storageUnavailable) {
    tone = "warn";
    message = t.bannerStorageUnavailable;
    icon = <AlertTriangle size={15} aria-hidden />;
  } else if (!online) {
    tone = "offline";
    message = t.bannerOffline;
    icon = <WifiOff size={15} aria-hidden />;
  } else if (syncPhase === "syncing") {
    tone = "info";
    message = t.bannerReconnecting;
    icon = <RefreshCw size={15} aria-hidden className="animate-spin" />;
  } else if (syncPhase === "synced") {
    tone = "success";
    message = t.bannerSynced;
    icon = <CheckCircle2 size={15} aria-hidden />;
  } else if (syncPhase === "failed") {
    tone = "warn";
    message = t.bannerSyncFailed;
    if (secondsLeft !== null && t.bannerNextAttempt) {
      message = `${message} ${t.bannerNextAttempt.replace("{seconds}", String(secondsLeft))}`;
    }
    icon = <AlertTriangle size={15} aria-hidden />;
    showRetry = true;
  }

  if (!tone) return null;

  // P2b (E-05): the frame is the kit's Notice. Same states, text, order (identity first)
  // and handlers; only the colours change: no terracotta for information. Offline and
  // the warnings need attention (warning); reconnecting and synced are information.
  // `role="status"` (polite) comes from Notice, as before.
  const noticeTone: Record<string, NoticeTone> = {
    offline: "warning",
    info: "info",
    success: "info",
    warn: "warning",
  };

  return (
    <Notice
      tone={noticeTone[tone]}
      icon={icon}
      className="mb-3"
      action={
        showIdentity ? (
          <TextAction tone="none"
            type="button"
            onClick={() => {
              if (renderedUserId) void reloadIdentity(renderedUserId);
              else window.location.reload();
            }}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            {t.reloadNow ?? "Reload"}
          </TextAction>
        ) : showRetry ? (
          <TextAction tone="none" type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 hover:opacity-80">
            {t.retrySync}
          </TextAction>
        ) : undefined
      }
    >
      {message}
    </Notice>
  );
}

"use client";

import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import type { SyncPhase } from "@/hooks/useOfflineSync";

export type OfflineBannerTranslations = {
  bannerOffline: string;
  bannerReconnecting: string;
  bannerSynced: string;
  bannerSyncFailed: string;
  retrySync: string;
};

// Persistent connectivity banner shown at the top of the cupping canvas.
// Renders nothing when online and idle.
export function OfflineBanner({
  online,
  syncPhase,
  onRetry,
  translations: t,
}: {
  online: boolean;
  syncPhase: SyncPhase;
  onRetry: () => void;
  translations: OfflineBannerTranslations;
}) {
  let tone: "offline" | "info" | "success" | "warn" | null = null;
  let message = "";
  let icon = null;
  let showRetry = false;

  if (!online) {
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
    icon = <AlertTriangle size={15} aria-hidden />;
    showRetry = true;
  }

  if (!tone) return null;

  const palette: Record<string, string> = {
    offline: "bg-red-defect/10 text-red-defect border-red-defect/30",
    info: "bg-amber-warm/10 text-amber-warm border-amber-warm/30",
    success: "bg-green-dark/10 text-green-dark border-green-dark/30",
    warn: "bg-amber-warm/10 text-amber-warm border-amber-warm/40",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-4 py-2 mb-3 rounded-md border font-sans text-sm ${palette[tone]}`}
    >
      {icon}
      <span className="flex-1">{message}</span>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
        >
          {t.retrySync}
        </button>
      )}
    </div>
  );
}

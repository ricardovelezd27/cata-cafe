"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui";

// Full-screen state shown when a session is opened offline and there is no
// cached data on this device to rebuild it from.
export function OfflineFirstLoadError({
  title,
  retryLabel,
  onRetry,
}: {
  title: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 text-error">
        <WifiOff size={30} aria-hidden />
      </div>
      <p className="max-w-md font-display text-card leading-snug text-on-surface">
        {title}
      </p>
      <Button
        type="button"
        onClick={onRetry}
      >
        {retryLabel}
      </Button>
    </div>
  );
}

"use client";

import { WifiOff } from "lucide-react";

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
      style={{ background: "#FDFBF7" }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-defect/10 text-red-defect">
        <WifiOff size={30} aria-hidden />
      </div>
      <p className="max-w-md font-display text-xl leading-snug text-brown-dark">
        {title}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-6 py-2.5 rounded-md bg-green-dark font-sans text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {retryLabel}
      </button>
    </div>
  );
}

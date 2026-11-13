"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { isStaleBundle, onStaleBundle } from "@/lib/staleBundle";
import { staleNoticeRendersIn, type StaleNoticeSlot } from "@/lib/staleNoticePlacement";

// "New version, reload" notice (S9-01 C-06). The flag is latched by
// lib/staleBundle.ts from any /app page that sees a "Server Action not found"
// after a deploy. It is rendered from TWO slots, never both at once
// (lib/staleNoticePlacement.ts): slot "app" in app/[locale]/app/layout.tsx for
// every page, and slot "cup" inside CupClient, because the cup page's fixed
// SessionShell (z-index 40) covers the layout copy. Non-blocking: drafts stay
// on the device, still pending.
//
// The role="status" live region is always mounted and empty until the flag
// flips, so screen readers announce the text when it is filled in.
export function StaleBundleNotice({
  message,
  reloadLabel,
  slot = "app",
}: {
  message: string;
  reloadLabel: string;
  slot?: StaleNoticeSlot;
}) {
  const stale = useSyncExternalStore(onStaleBundle, isStaleBundle, () => false);
  const pathname = usePathname();
  const show = stale && staleNoticeRendersIn(slot, pathname);
  return (
    <div role="status" aria-live="polite">
      {show && (
        <div className="mx-4 lg:mx-6 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-outline-variant bg-secondary-fixed px-4 py-2 text-sm text-on-secondary-fixed">
          <RefreshCw size={15} aria-hidden className="shrink-0 text-secondary" />
          <span className="flex-1 min-w-[12rem]">{message}</span>
          <Button
            size="sm"
            variant="accentOutline"
            onClick={() => window.location.reload()}
            className="shrink-0 hover:bg-secondary-fixed-dim!"
          >
            {reloadLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

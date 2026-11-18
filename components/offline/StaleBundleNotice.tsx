"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { Notice } from "@/components/ui/Notice";
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
      {/* P2b (E-05): a warning Notice inside the always-present live region (so the
          region announces it, and the Notice carries no second role). Same text, same
          reload. */}
      {show && (
        <Notice
          tone="warning"
          live={false}
          icon={<RefreshCw size={15} aria-hidden />}
          className="mx-4 lg:mx-6 mt-2"
          action={
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              {reloadLabel}
            </Button>
          }
        >
          {message}
        </Notice>
      )}
    </div>
  );
}

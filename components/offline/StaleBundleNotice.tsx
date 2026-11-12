"use client";

import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { isStaleBundle, onStaleBundle } from "@/lib/staleBundle";

// App-shell-wide "new version, reload" notice (S9-01 C-06, mounted once in
// app/[locale]/app/layout.tsx next to PendingDraftsBadge). The flag is latched
// by lib/staleBundle.ts from any /app page that sees a "Server Action not
// found" after a deploy (cup saves, the results sync pill, the replay), so the
// notice must live where the pending-drafts badge lives, not only on /cup.
// Non-blocking: drafts stay on the device, still pending. Renders nothing
// until the flag is set. This is the ONE place the notice is rendered
// (OfflineBanner no longer has this branch).
export function StaleBundleNotice({ message, reloadLabel }: { message: string; reloadLabel: string }) {
  const stale = useSyncExternalStore(onStaleBundle, isStaleBundle, () => false);
  if (!stale) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 lg:mx-6 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-outline-variant bg-secondary-fixed px-4 py-2 text-sm text-on-secondary-fixed"
    >
      <RefreshCw size={15} aria-hidden className="shrink-0 text-secondary" />
      <span className="flex-1 min-w-[12rem]">{message}</span>
      <Button
        size="sm"
        variant="accentOutline"
        onClick={() => window.location.reload()}
        className="shrink-0"
      >
        {reloadLabel}
      </Button>
    </div>
  );
}

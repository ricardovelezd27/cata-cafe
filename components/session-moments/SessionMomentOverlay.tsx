"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  hasSeenMoment,
  markMomentSeen,
  subscribeMoments,
  type SessionMomentKind,
} from "@/lib/sessionMoments";

/**
 * Session-moment shell: a full-screen layer mounted as a SIBLING of
 * `SessionShell` (never inside its top bar) that a content provider fills
 * (warm-up interstitial today; materials checklist / reveal moment later).
 *
 * Rules the shell enforces so every provider inherits them:
 *  - shows at most once per (kind, session) per device — `useSessionMoment`
 *    owns the localStorage seen-set (`cata_moment_<kind>_<sessionId>`);
 *  - never opens during SSR / before hydration (server snapshot = "seen");
 *  - always skippable (Escape + the provider's own buttons);
 *  - renders offline: providers must only use static content already in the
 *    bundle — the shell never fetches, never touches flushSave/useOfflineSync.
 */
export function useSessionMoment({
  kind,
  sessionId,
  when,
}: {
  kind: SessionMomentKind;
  sessionId: string;
  /** Provider predicate — e.g. "the session has a warm-up configured and
   *  is still active". */
  when: boolean;
}): { open: boolean; dismiss: () => void } {
  // Seen-set read through useSyncExternalStore: the SERVER snapshot says
  // "seen" so SSR/hydration never renders the layer open; the client
  // snapshot reads localStorage; markMomentSeen notifies subscribers.
  const seen = useSyncExternalStore(
    subscribeMoments,
    () => hasSeenMoment(kind, sessionId),
    () => true,
  );
  // Local dismissal in case storage is blocked (seen would stay false).
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    markMomentSeen(kind, sessionId);
    setDismissed(true);
  }, [kind, sessionId]);

  return { open: when && !seen && !dismissed, dismiss };
}

export function SessionMomentOverlay({
  open,
  onDismiss,
  label,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  /** Accessible name for the layer. */
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;
  return (
    <div
      role="region"
      aria-label={label}
      data-session-moment
      // Above SessionShell (z-40) and its sidebar, below ResponsiveDialog (200).
      className="fixed inset-0 z-[60] bg-surface"
    >
      {children}
    </div>
  );
}

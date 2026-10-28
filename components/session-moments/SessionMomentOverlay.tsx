"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
 *  - shows at most once per (kind, session, user, value) per device —
 *    `useSessionMoment` owns the seen-set (`lib/sessionMoments.ts`);
 *  - never opens during SSR / before hydration (server snapshot = "seen");
 *  - always skippable: the PROVIDER's content owns Escape (the warm-up
 *    player does) — the shell only traps Tab and restores focus;
 *  - renders offline: providers must only use static content already in the
 *    bundle — the shell never fetches, never touches flushSave/useOfflineSync.
 */
export function useSessionMoment({
  kind,
  sessionId,
  userId,
  value,
  when,
}: {
  kind: SessionMomentKind;
  sessionId: string;
  userId: string;
  /** What is being shown (the warm-up exercise id): a different value re-arms. */
  value: string;
  /** Provider predicate — e.g. the overlay gate result. */
  when: boolean;
}): { open: boolean; dismiss: () => void } {
  // Seen-set read through useSyncExternalStore: the SERVER snapshot says
  // "seen" so SSR/hydration never renders the layer open; the client
  // snapshot reads the storage tiers; markMomentSeen notifies subscribers.
  const seen = useSyncExternalStore(
    subscribeMoments,
    () => hasSeenMoment(kind, sessionId, userId, value),
    () => true,
  );
  // Local dismissal in case every storage tier is blocked.
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    markMomentSeen(kind, sessionId, userId, value);
    setDismissed(true);
  }, [kind, sessionId, userId, value]);

  return { open: when && !seen && !dismissed, dismiss };
}

export function SessionMomentOverlay({
  open,
  label,
  children,
}: {
  open: boolean;
  /** Accessible name for the layer. */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Initial focus on the first control + Tab trap while open; restores focus
  // to the previously focused element on close.
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusables()[0] ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        root?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={label}
      data-session-moment
      // Above SessionShell (z-40) and its sidebar, below ResponsiveDialog (200).
      className="fixed inset-0 z-[60] bg-surface outline-none"
    >
      {children}
    </div>
  );
}

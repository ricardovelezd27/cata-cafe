/**
 * "A full-screen layer makes what is under it inert" (audit H-03, DESIGN.md
 * Accessibility).
 *
 * The cupping screen (`components/ui/SessionShell.tsx`) is a fixed, full-screen
 * layer rendered INSIDE the app layout's `<main>`, so the layout's sidebar, top
 * bar, bottom bar and notices stay in the DOM under it. While a layer is
 * mounted those parts are made `inert` (removed from the tab order and from the
 * accessibility tree). They are the only things that read this store; the
 * layer itself, its siblings in `<main>` (the session-moment overlay, the
 * notices the cup page shows) and everything portalled to `<body>` (dialogs,
 * toasts, the warm-up veil) are never touched.
 *
 * It changes focusability only: nothing here knows about saving, navigation
 * guards or realtime.
 *
 * Pure and dependency-free so it can be unit-tested; a counter, not a boolean,
 * so two layers mounted at once (or a remount racing an unmount in React's
 * strict/dev double effects) cannot leave the shell stuck either way.
 */

export type ShellLayerStore = {
  /** Registers a layer; returns its release (idempotent). */
  cover(): () => void;
  /** True while at least one layer is mounted. */
  isCovered(): boolean;
  /** useSyncExternalStore-compatible subscription. */
  subscribe(listener: () => void): () => void;
};

export function createShellLayerStore(): ShellLayerStore {
  let count = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of [...listeners]) l();
  };

  return {
    cover() {
      count += 1;
      if (count === 1) emit();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        count = Math.max(0, count - 1);
        if (count === 0) emit();
      };
    },
    isCovered() {
      return count > 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The one store of the app (module-level, client side). */
export const shellLayer = createShellLayerStore();

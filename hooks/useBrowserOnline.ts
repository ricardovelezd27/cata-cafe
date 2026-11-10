"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Lightweight `navigator.onLine` subscription (no /api/health probe, no
 * interval). Use where many instances may render; use `useConnectivity` when
 * the real reachability of the server matters. Server snapshot = online.
 */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

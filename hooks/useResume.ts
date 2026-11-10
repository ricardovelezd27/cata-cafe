"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onResume` whenever the app comes back to the foreground: the tab
 * becomes visible again, the page is restored from the back/forward cache
 * (`pageshow`, iOS Safari) or the browser reports `online`. A phone that was
 * locked mid-cupping replays its queue on unlock instead of waiting for the
 * next connectivity edge (S8-09, F-offline-6).
 *
 * The single seam for "the app resumed": the native shell (S8-15) adds its
 * `appStateChange` source here, behind the same hook.
 */
export function useResume(onResume: () => void): void {
  const cbRef = useRef(onResume);
  useEffect(() => {
    cbRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    const fire = () => cbRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", fire);
    window.addEventListener("online", fire);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", fire);
      window.removeEventListener("online", fire);
    };
  }, []);
}

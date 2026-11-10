"use client";

import { useEffect, useRef } from "react";
import { useForegroundResume } from "@/hooks/useForegroundResume";

/**
 * Fires `onResume` whenever the app comes back to the foreground: the tab
 * becomes visible again, the page is restored from the back/forward cache
 * (`pageshow`, iOS Safari) or the browser reports `online`. A phone that was
 * locked mid-cupping replays its queue on unlock instead of waiting for the
 * next connectivity edge (S8-09, F-offline-6).
 *
 * Thin wrapper over S8-15's `useForegroundResume` (the single resume seam,
 * lib/platform/resume.ts): visible/online come from its gate with no minimum
 * hidden time, so every return to the foreground still replays; a bfcache
 * restore (`pageshow` with `persisted`), which the gate does not see, is
 * forwarded here.
 */
export function useResume(onResume: () => void): void {
  const cbRef = useRef(onResume);
  useEffect(() => {
    cbRef.current = onResume;
  }, [onResume]);

  useForegroundResume(() => cbRef.current(), { minHiddenMs: 0 });

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) cbRef.current();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
}

"use client";

import { useEffect, useRef } from "react";
import { createResumeGate, type ResumeReason } from "@/lib/platform/resume";

/**
 * Calls `cb(reason)` when the page returns to the foreground after >= minHiddenMs
 * hidden, or when the network comes back (deduped within 1 s). It only re-attaches
 * things; it never saves — the existing pagehide flush stays the writer.
 */
export function useForegroundResume(
  cb: (reason: ResumeReason) => void,
  opts: { minHiddenMs?: number; enabled?: boolean } = {},
) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });
  const { minHiddenMs, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const gate = createResumeGate({ now: Date.now, minHiddenMs });
    if (document.visibilityState === "hidden") gate.hidden();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        gate.hidden();
        return;
      }
      const r = gate.visible();
      if (r) cbRef.current(r);
    };
    const onOnline = () => {
      const r = gate.online();
      if (r) cbRef.current(r);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [minHiddenMs, enabled]);
}

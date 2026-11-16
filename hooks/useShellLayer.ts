"use client";

import { useEffect, useSyncExternalStore } from "react";
import { shellLayer } from "@/lib/shellLayer";

/**
 * True while a full-screen layer (the cupping screen) covers the app shell.
 * The shell's own parts (sidebar, top bar, bottom bar, notices, skip link)
 * put `inert` on themselves with it. Server snapshot = false: the layer is a
 * client effect, so the server never renders the shell inert.
 */
export function useShellCovered(): boolean {
  return useSyncExternalStore(shellLayer.subscribe, shellLayer.isCovered, () => false);
}

/**
 * Called by a full-screen layer: the shell under it is inert while the
 * component is mounted, and usable again on unmount (a client navigation away
 * from the page unmounts it, so leaving the cup page releases the shell).
 */
export function useCoverShell(active = true): void {
  useEffect(() => {
    if (!active) return;
    return shellLayer.cover();
  }, [active]);
}

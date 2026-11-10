"use client";

import { useEffect } from "react";
import { purgeLegacyReflections } from "@/lib/warmup/reflections";

/**
 * Mount-time cleanup of the legacy unkeyed warm-up reflection notes
 * (`cata_warmup_reflections_*`, no longer written, S8-13). Sign-out already
 * purges them; this covers users who never sign out (S8-21). Best effort.
 */
export function LegacyStorageCleanup() {
  useEffect(() => {
    try {
      purgeLegacyReflections(window.localStorage);
    } catch {
      // storage can throw (private window, blocked site data)
    }
  }, []);
  return null;
}

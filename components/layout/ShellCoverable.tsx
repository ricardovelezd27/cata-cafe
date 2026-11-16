"use client";

import type { ReactNode } from "react";
import { useShellCovered } from "@/hooks/useShellLayer";

/**
 * Wraps the app shell's notices (the pending-drafts badge, the layout copy of
 * the stale-bundle and identity notices) so they are inert under the
 * full-screen cupping layer (H-03), like the sidebar and the bars. The cup page
 * shows its own copies of those notices inside its own layer, which this never
 * touches.
 *
 * `display: contents`: the wrapper adds no box, so the column's layout is the
 * same as without it (inert still applies to every descendant).
 */
export function ShellCoverable({ children }: { children: ReactNode }) {
  const covered = useShellCovered();
  return (
    <div className="contents" inert={covered}>
      {children}
    </div>
  );
}

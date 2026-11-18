"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SHEET_PARAM, closeMove, sheetSampleId, withSheet } from "@/lib/sheetAddress";

/**
 * The open coffee lives in the address (`?sample=<id>`), not in React state.
 *
 * Next.js integrates the native `history.pushState` / `replaceState` with its
 * router (node_modules/next/dist/docs/01-app/01-getting-started/
 * 04-linking-and-navigating.md, "Native History API"): `useSearchParams`
 * follows them and no request goes to the server. So:
 *  - opening a coffee PUSHES an entry: the browser's Back closes the sheet and
 *    the page under it has not moved;
 *  - a reload, or a link with the parameter, opens the same coffee;
 *  - closing goes back when this visit pushed the entry, else removes the
 *    parameter in place (`closeMove`);
 *  - an id that is not one of this session's samples opens nothing and is
 *    removed from the address.
 * The entries belong to this route only: the cup page's leave guard listens to
 * `popstate` while IT is mounted and never sees them.
 */
export function useSheetAddress(sampleIds: readonly string[]): {
  sampleId: string | null;
  open: (sampleId: string) => void;
  close: () => void;
} {
  const raw = useSearchParams().get(SHEET_PARAM);
  const sampleId = sheetSampleId(raw, sampleIds);
  const pushedHere = useRef(false);

  const urlWith = (id: string | null) =>
    `${window.location.pathname}${withSheet(window.location.search, id)}${window.location.hash}`;

  useEffect(() => {
    if (raw === null) pushedHere.current = false;
    else if (sampleId === null) window.history.replaceState(null, "", urlWith(null));
  }, [raw, sampleId]);

  return {
    sampleId,
    open: (id) => {
      if (new URLSearchParams(window.location.search).has(SHEET_PARAM)) {
        // already on a sheet (the organizer's matrix, another cell): same entry
        window.history.replaceState(null, "", urlWith(id));
      } else {
        window.history.pushState(null, "", urlWith(id));
        pushedHere.current = true;
      }
    },
    close: () => {
      if (!new URLSearchParams(window.location.search).has(SHEET_PARAM)) return;
      if (closeMove(pushedHere.current) === "back") {
        pushedHere.current = false;
        window.history.back();
      } else {
        window.history.replaceState(null, "", urlWith(null));
      }
    },
  };
}

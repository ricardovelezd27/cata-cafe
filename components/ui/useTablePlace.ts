"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { readTablePlace, sameSearch, writeTablePlace, type TablePlace, type TableSort, type TableSpec } from "@/lib/viewAddress";

// The browser half of a DataTable's place in the address (audit D-01, P5a).
// The rules are `lib/viewAddress.ts`; this reads them once at mount (the
// address the page was rendered for, so the server and the browser agree)
// and writes every change back with `history.replaceState`: a filter is not a
// step of its own in "back", but "back" to this page finds it.

/** Prefixes in use on the page right now: two tables never write the same keys. */
const claimed = new Map<string, number>();

/** Typing writes after a pause: Safari refuses more than 100 history writes in 10 s. */
const QUERY_WRITE_DELAY_MS = 300;

/** The place the address holds for this table (or the defaults when it keeps none). */
export function useTablePlace({
  prefix,
  enabled,
  spec,
  initialSort,
}: {
  prefix: string;
  enabled: boolean;
  spec: TableSpec;
  initialSort: TableSort | null;
}) {
  const params = useSearchParams();
  const [place, setPlace] = useState<TablePlace>(() =>
    enabled
      ? readTablePlace(params.toString(), prefix, spec, initialSort)
      : { q: "", sort: initialSort, page: 1, facets: {} },
  );
  const owner = useRef(false);

  // Claim the prefix; a second table with the same one keeps its place in memory only.
  useEffect(() => {
    if (!enabled) return;
    const count = claimed.get(prefix) ?? 0;
    claimed.set(prefix, count + 1);
    owner.current = count === 0;
    if (count > 0 && process.env.NODE_ENV !== "production") {
      console.warn(`DataTable: two tables use the address prefix "${prefix}"; give one an addressKey.`);
    }
    return () => {
      const left = (claimed.get(prefix) ?? 1) - 1;
      if (left <= 0) claimed.delete(prefix);
      else claimed.set(prefix, left);
      owner.current = false;
    };
  }, [enabled, prefix]);

  return { place, setPlace, owner };
}

/** Write the place (with the page the table can show) into the address after each change. */
export function useWriteTablePlace({
  owner,
  prefix,
  place,
  shownPage,
  initialSort,
}: {
  owner: RefObject<boolean>;
  prefix: string;
  place: TablePlace;
  shownPage: number;
  initialSort: TableSort | null;
}) {
  const lastQ = useRef(place.q);
  const sortKey = initialSort ? `${initialSort.key}.${initialSort.dir}` : "";
  useEffect(() => {
    if (!owner.current) return;
    const first = sortKey ? { key: sortKey.slice(0, sortKey.lastIndexOf(".")), dir: sortKey.endsWith("desc") ? ("desc" as const) : ("asc" as const) } : null;
    const write = () => {
      const next = writeTablePlace(window.location.search, prefix, { ...place, page: shownPage }, first);
      if (!sameSearch(next, window.location.search)) {
        window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
      }
      lastQ.current = place.q;
    };
    if (place.q === lastQ.current) {
      write();
      return;
    }
    const timer = window.setTimeout(write, QUERY_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [owner, prefix, place, shownPage, sortKey]);
}

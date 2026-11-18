// Where a person is on a page lives in the address (DESIGN.md "Keep the
// reader's place", audit D-01, package P5a): the results tab and every
// DataTable's search, filters, sort and page. A reload, "back" and a language
// switch keep them. Pure, no DOM; the browser half is in the components
// (native `history.replaceState`, which Next 16 integrates with
// `useSearchParams`, as R3's `lib/sheetAddress.ts` does for the open coffee).
//
// Every reader is strict: a value that is not one of the page's own is
// ignored, and the writer leaves it out, so the next write removes it.

/** Apply updates to a query string (`null` deletes a key); returns "" or "?…". */
export function withParams(search: string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

// ── The results tab ──────────────────────────────────────────────────────────

export const RESULTS_TAB_PARAM = "tab";
export type ResultsTab = "resumen" | "panel";

/** The tab the address names: "panel" only (the results view is the address without `tab`). */
export function resultsTabFrom(value: string | null): ResultsTab {
  return value === "panel" ? "panel" : "resumen";
}

/** The `tab` value to write for a tab the viewer may see (`null` = no key). */
export function resultsTabParam(tab: ResultsTab): string | null {
  return tab === "panel" ? "panel" : null;
}

// ── A table's place ──────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc";
export type TableSort = { key: string; dir: SortDir };
export type TablePlace = {
  q: string;
  sort: TableSort | null;
  page: number;
  facets: Record<string, string>;
};

/** What a table accepts: its sortable columns and, per facet, its values. */
export type TableSpec = {
  sortKeys: readonly string[];
  facets: readonly { key: string; values: readonly string[] }[];
};

export const MAX_QUERY_LENGTH = 120;

/**
 * The keys of one table. With no `prefix` they are `q`, `sort`, `page` and
 * `f-<facet>`; a page with two tables gives one a prefix (`users-q`, …) so the
 * two never share a key.
 */
export function tableKeys(prefix: string) {
  const p = prefix ? `${prefix}-` : "";
  return {
    q: `${p}q`,
    sort: `${p}sort`,
    page: `${p}page`,
    facetPrefix: `${p}f-`,
    facet: (key: string) => `${p}f-${key}`,
  };
}

/** A table's place, read from the address; anything not the table's own is ignored. */
export function readTablePlace(search: string, prefix: string, spec: TableSpec, initialSort: TableSort | null): TablePlace {
  const params = new URLSearchParams(search);
  const keys = tableKeys(prefix);

  const rawQ = (params.get(keys.q) ?? "").trim();
  const q = rawQ.length > 0 && rawQ.length <= MAX_QUERY_LENGTH ? rawQ : "";

  let sort = initialSort;
  const rawSort = params.get(keys.sort);
  if (rawSort !== null) {
    const dot = rawSort.lastIndexOf(".");
    const key = dot > 0 ? rawSort.slice(0, dot) : "";
    const dir = rawSort.slice(dot + 1);
    if (spec.sortKeys.includes(key) && (dir === "asc" || dir === "desc")) sort = { key, dir };
  }

  const rawPage = params.get(keys.page);
  const page = rawPage !== null && /^[1-9]\d{0,4}$/.test(rawPage) ? Number(rawPage) : 1;

  const facets: Record<string, string> = {};
  for (const facet of spec.facets) {
    const value = params.get(keys.facet(facet.key));
    if (value !== null && value !== "" && facet.values.includes(value)) facets[facet.key] = value;
  }
  return { q, sort, page, facets };
}

/**
 * The query string with this table's place written in: defaults (no search,
 * the table's own first sort, page 1, "all") are left out, and every key of
 * this table that the place does not hold (an unknown facet, a bad value) is
 * removed. Keys that are not this table's are kept as they are.
 */
export function writeTablePlace(search: string, prefix: string, place: TablePlace, initialSort: TableSort | null): string {
  const params = new URLSearchParams(search);
  const keys = tableKeys(prefix);
  for (const key of [...params.keys()]) {
    if (key.startsWith(keys.facetPrefix)) params.delete(key);
  }
  const q = place.q.trim();
  if (q && q.length <= MAX_QUERY_LENGTH) params.set(keys.q, q);
  else params.delete(keys.q);

  const isInitial = place.sort && initialSort && place.sort.key === initialSort.key && place.sort.dir === initialSort.dir;
  if (place.sort && !isInitial) params.set(keys.sort, `${place.sort.key}.${place.sort.dir}`);
  else params.delete(keys.sort);

  if (place.page > 1) params.set(keys.page, String(place.page));
  else params.delete(keys.page);

  for (const [key, value] of Object.entries(place.facets)) {
    if (value) params.set(keys.facet(key), value);
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Two query strings that hold the same keys and values, in any order. */
export function sameSearch(a: string, b: string): boolean {
  const norm = (s: string) => [...new URLSearchParams(s).entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
  return norm(a) === norm(b);
}

// ── A sideways row's edges ───────────────────────────────────────────────────

export type EdgeHint = { start: boolean; end: boolean };

/** Which edges of a sideways-scrolling row have more behind them (1 px slack for rounding). */
export function edgeHint(scrollLeft: number, scrollWidth: number, clientWidth: number): EdgeHint {
  if (scrollWidth <= clientWidth + 1) return { start: false, end: false };
  return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
}

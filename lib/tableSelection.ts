// Pure helpers behind DataTable's row selection (components/ui/DataTable.tsx).
// Kept dependency-free so the rules are unit-tested in tests/tableSelection.test.ts.

/** Drop every selected id that is no longer present in the table's rows
 *  (deleted elsewhere, or removed by a router.refresh()). Returns the same
 *  Set instance when nothing changed so callers can skip a re-render. */
export function pruneSelection(
  selected: ReadonlySet<string>,
  presentIds: Iterable<string>,
): Set<string> {
  const present = presentIds instanceof Set ? (presentIds as Set<string>) : new Set(presentIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (present.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : (selected as Set<string>);
}

/** Header-checkbox semantics: if every id on the page is already selected,
 *  deselect them all; otherwise select every id on the page. Ids from other
 *  pages are untouched (selection accumulates across pages). */
export function togglePage(selected: ReadonlySet<string>, pageIds: string[]): Set<string> {
  const next = new Set(selected);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  for (const id of pageIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export type PageSelectionState = "none" | "some" | "all";

export function pageState(selected: ReadonlySet<string>, pageIds: string[]): PageSelectionState {
  if (pageIds.length === 0) return "none";
  let count = 0;
  for (const id of pageIds) if (selected.has(id)) count++;
  if (count === 0) return "none";
  return count === pageIds.length ? "all" : "some";
}

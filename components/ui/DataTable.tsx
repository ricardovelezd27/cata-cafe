"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { FilterBar, type FacetOption } from "./FilterBar";
import { Pagination } from "./Pagination";
import { Button } from "./Button";
import { pageState, pruneSelection, togglePage } from "@/lib/tableSelection";

export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  /** Required when sortable and the raw row value at `key` isn't directly comparable. */
  sortValue?: (row: T) => string | number;
  /** Default: String((row as Record<string, unknown>)[key] ?? "—") */
  render?: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  /** Reserved — mobile rendering is fully caller-controlled via renderMobileCard. */
  hideOnMobile?: boolean;
  headerClassName?: string;
  cellClassName?: string;
};

export type Facet<T> = {
  key: string;
  label: string;
  options: FacetOption[];
  match: (row: T, value: string) => boolean;
};

/** Per-row selection handle passed as the 3rd argument of renderMobileCard
 *  (null when the table has no `selection` config). */
export type RowSelection = {
  selectable: boolean;
  selected: boolean;
  toggle: () => void;
};

/** Opt-in row selection. DataTable owns the selected-id Set (uncontrolled):
 *  it accumulates across pages/filters, is pruned against `rows` whenever they
 *  change (a router.refresh() after a bulk action drops the gone ids), and the
 *  bulk-actions render prop receives `clear()` for a deterministic reset. The
 *  header checkbox toggles the selectable rows of the CURRENT PAGE only. */
export type SelectionConfig<T> = {
  isSelectable: (r: T) => boolean;
  /** Accessible name for a row's checkbox — interpolated into translations.selectRow. */
  rowLabel: (r: T) => string;
  /** Rendered in the toolbar above the table whenever ≥1 row is selected. */
  renderBulkActions: (ids: string[], clear: () => void) => ReactNode;
  translations: {
    selectAll: string;
    /** Contains the literal placeholder {name}. */
    selectRow: string;
    /** Contains the literal placeholder {count}. */
    selectedCount: string;
    clearSelection: string;
  };
};

const CHECKBOX_CLASS =
  "h-4 w-4 cursor-pointer rounded border-outline-variant accent-primary-container disabled:cursor-default disabled:opacity-40";

/** Hoisted to module scope — never redeclare components inside render. Shared
 *  with callers' mobile cards so every table's checkbox looks the same. */
export function SelectionCheckbox({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className={CHECKBOX_CLASS}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** `indeterminate` is a DOM property, not an attribute — set it via a ref. */
function HeaderCheckbox({
  state,
  onChange,
  ariaLabel,
  disabled,
}: {
  state: "none" | "some" | "all";
  onChange: () => void;
  ariaLabel: string;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={CHECKBOX_CLASS}
      checked={state === "all"}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
    />
  );
}

type SortState = { key: string; dir: "asc" | "desc" };

function compareValues(a: string | number, b: string | number, locale?: string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), locale);
}

function alignToClass(align: "left" | "center" | "right" = "left"): string {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

function alignToJustify(align: "left" | "center" | "right" = "left"): string {
  return align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
}

/** Hoisted to module scope — never redeclare components inside render. */
function Th({
  label,
  align,
  sortable,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  active: boolean;
  dir: "asc" | "desc";
  onSort: () => void;
  className?: string;
}) {
  const icon = !sortable ? null : active ? (
    dir === "asc" ? (
      <ArrowUp size={12} className="text-primary-container" aria-hidden />
    ) : (
      <ArrowDown size={12} className="text-primary-container" aria-hidden />
    )
  ) : (
    <ArrowUpDown size={12} className="text-outline-variant" aria-hidden />
  );

  return (
    <th
      scope="col"
      aria-sort={sortable ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined}
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant whitespace-nowrap ${alignToClass(align)} ${className ?? ""}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex w-full items-center gap-1 cursor-pointer select-none transition-colors hover:text-on-surface ${alignToJustify(align)}`}
        >
          {label}
          {icon}
        </button>
      ) : (
        <span className={`inline-flex w-full items-center gap-1 ${alignToJustify(align)}`}>{label}</span>
      )}
    </th>
  );
}

export function DataTable<T>({
  rows,
  rowKey,
  columns,
  searchText,
  facets,
  getRowHref,
  rowActions,
  selection,
  renderMobileCard,
  emptyState,
  noResults,
  perPage = 10,
  initialSort,
  locale,
  translations,
}: {
  rows: T[];
  rowKey: (r: T) => string;
  columns: Column<T>[];
  searchText?: (r: T) => (string | null | undefined)[];
  facets?: Facet<T>[];
  getRowHref?: (r: T) => string | null;
  rowActions?: (r: T) => ReactNode;
  /** Opt-in checkbox selection + bulk-actions toolbar (see SelectionConfig). */
  selection?: SelectionConfig<T>;
  renderMobileCard: (r: T, actions: ReactNode | null, selection: RowSelection | null) => ReactNode;
  emptyState: ReactNode;
  noResults: string;
  perPage?: number;
  initialSort?: SortState;
  locale: string;
  translations: {
    searchPlaceholder: string;
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    all: string;
  };
}) {
  const [search, setSearch] = useState("");
  const [facetValues, setFacetValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Prune selected ids that vanished from `rows` (deleted elsewhere / after a
  // router.refresh()). Adjusting state during render per React's guidance —
  // pruneSelection returns the same instance when nothing changed, so this
  // cannot loop.
  const pruned = selection ? pruneSelection(selected, rows.map(rowKey)) : selected;
  if (pruned !== selected) setSelected(pruned);

  const filtered = useMemo(() => {
    let result = rows;

    const q = search.trim().toLowerCase();
    if (q && searchText) {
      result = result.filter((row) =>
        searchText(row)
          .filter((v): v is string => !!v)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (facets) {
      for (const facet of facets) {
        const value = facetValues[facet.key];
        if (value) {
          result = result.filter((row) => facet.match(row, value));
        }
      }
    }

    return result;
  }, [rows, search, searchText, facets, facetValues]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return filtered;

    const getValue =
      column.sortValue ??
      ((row: T) => {
        const raw = (row as Record<string, unknown>)[column.key];
        return typeof raw === "number" ? raw : String(raw ?? "");
      });

    // Stable sort: keep original relative order for ties.
    return filtered
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const cmp = compareValues(getValue(a.row), getValue(b.row), locale);
        if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
        return a.index - b.index;
      })
      .map((w) => w.row);
  }, [filtered, sort, columns, locale]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * perPage, safePage * perPage);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * perPage + 1;
  const to = Math.min(safePage * perPage, sorted.length);

  const showingText = translations.showing
    .replace("{from}", String(from))
    .replace("{to}", String(to))
    .replace("{total}", String(sorted.length));

  const handleSort = (key: string) => {
    setSort((prev) => (prev && prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const handleFacetChange = (key: string, value: string) => {
    setFacetValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleClearFacets = () => {
    setFacetValues({});
    setPage(1);
  };

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const showControls = !!searchText || !!facets?.length;
  const hasTrailingColumn = !!getRowHref || !!rowActions;

  // ── Selection helpers ────────────────────────────────────────────────────
  const selectablePageIds = selection
    ? pageItems.filter((row) => selection.isSelectable(row)).map(rowKey)
    : [];
  const headerState = pageState(pruned, selectablePageIds);
  const selectedIds = [...pruned];
  const clearSelection = () => setSelected(new Set());
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rowSelection = (row: T): RowSelection | null => {
    if (!selection) return null;
    const id = rowKey(row);
    return {
      selectable: selection.isSelectable(row),
      selected: pruned.has(id),
      toggle: () => toggleRow(id),
    };
  };

  return (
    <div className="space-y-4">
      {selection && selectedIds.length > 0 && (
        <div
          role="region"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-card border border-outline-variant bg-surface-container-low px-4 py-2"
        >
          <span className="text-sm font-semibold text-on-surface">
            {selection.translations.selectedCount.replace("{count}", String(selectedIds.length))}
          </span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            {selection.translations.clearSelection}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {selection.renderBulkActions(selectedIds, clearSelection)}
          </div>
        </div>
      )}

      {showControls && (
        <div className="flex flex-wrap items-center gap-3">
          {searchText && (
            <div className="w-full max-w-sm">
              <SearchInput value={search} onChange={handleSearchChange} placeholder={translations.searchPlaceholder} />
            </div>
          )}
          {facets && facets.length > 0 && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <FilterBar
                facets={facets.map((f) => ({ key: f.key, label: f.label, options: f.options }))}
                values={facetValues}
                onChange={handleFacetChange}
                onClear={handleClearFacets}
                translations={{ clearFilters: translations.clearFilters, all: translations.all }}
              />
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">{noResults}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-card border border-outline-variant md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-outline-variant bg-surface-container">
                <tr>
                  {selection && (
                    <th scope="col" className="w-10 px-3 py-3">
                      <HeaderCheckbox
                        state={headerState}
                        disabled={selectablePageIds.length === 0}
                        ariaLabel={selection.translations.selectAll}
                        onChange={() => setSelected((prev) => togglePage(prev, selectablePageIds))}
                      />
                    </th>
                  )}
                  {columns.map((col) => {
                    const active = sort?.key === col.key;
                    const dir: "asc" | "desc" = active && sort ? sort.dir : "asc";
                    return (
                      <Th
                        key={col.key}
                        label={col.label}
                        align={col.align}
                        sortable={col.sortable}
                        active={active}
                        dir={dir}
                        onSort={() => handleSort(col.key)}
                        className={col.headerClassName}
                      />
                    );
                  })}
                  {hasTrailingColumn && <th className="px-4 py-3" scope="col" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {pageItems.map((row) => {
                  const href = getRowHref?.(row) ?? null;
                  const sel = rowSelection(row);
                  return (
                    <tr
                      key={rowKey(row)}
                      className={`transition-colors hover:bg-surface-container-low ${
                        sel?.selected ? "bg-primary-fixed/40" : "bg-surface-container-lowest"
                      }`}
                    >
                      {sel && (
                        <td className="w-10 px-3 py-3">
                          {sel.selectable && (
                            <SelectionCheckbox
                              checked={sel.selected}
                              onChange={sel.toggle}
                              ariaLabel={selection!.translations.selectRow.replace(
                                "{name}",
                                selection!.rowLabel(row),
                              )}
                            />
                          )}
                        </td>
                      )}
                      {columns.map((col) => {
                        const content = col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? "—");
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-3 text-on-surface ${alignToClass(col.align)} ${col.cellClassName ?? ""}`}
                          >
                            {content}
                          </td>
                        );
                      })}
                      {hasTrailingColumn && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {rowActions?.(row)}
                            {href && (
                              <Link
                                href={href}
                                tabIndex={-1}
                                aria-hidden
                                className="inline-flex text-on-surface-variant transition-colors hover:text-primary-container"
                              >
                                <ChevronRight size={16} aria-hidden />
                              </Link>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {pageItems.map((row) => (
              <div key={rowKey(row)}>
                {renderMobileCard(row, rowActions?.(row) ?? null, rowSelection(row))}
              </div>
            ))}
          </div>
        </>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        showingText={showingText}
        translations={{ prev: translations.prev, next: translations.next }}
      />
    </div>
  );
}

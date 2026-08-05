"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { FilterBar, type FacetOption } from "./FilterBar";
import { Pagination } from "./Pagination";

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
  renderMobileCard: (r: T, actions: ReactNode | null) => ReactNode;
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

  return (
    <div className="space-y-4">
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
                  return (
                    <tr key={rowKey(row)} className="bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
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
              <div key={rowKey(row)}>{renderMobileCard(row, rowActions?.(row) ?? null)}</div>
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

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Coffee as CoffeeIcon } from "lucide-react";
import { DataTable, type Column, type Facet, Badge, ScorePill, EmptyState } from "@/components/ui";

export type CoffeeRow = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  variety: string | null;
  processType: string | null;
  visibility: string; // "private" | "shared" | "public"
  createdBy: string;
  isMine: boolean;
  ownerName?: string | null;
  _count: { sessionSamples: number };
  coffeeHistory: Array<{
    tastedAt: string;
    individualScore: number | null;
    communityScore: number | null;
  }>;
};

export type CoffeesTableTranslations = {
  // Column headers
  colName: string;
  colOrigin: string;
  colProcess: string;
  colVariety: string;
  colSessions: string;
  colLastScore: string;
  colLastDate: string;
  // Row badges / links
  view: string;
  listPublic: string;
  listPrivate: string;
  listShared: string;
  sharedWithMe: string;
  adminOwnerPrefix: string;
  // Fully-empty state (zero coffees at all)
  noData: string;
  // Generic table controls (DataTable / FilterBar / Pagination)
  searchPlaceholder: string;
  showing: string;
  prev: string;
  next: string;
  clearFilters: string;
  all: string;
  noResults: string;
  // Facets
  filterProcess: string;
  filterCountry: string;
  filterOwnership: string;
  ownershipMine: string;
  ownershipShared: string;
  ownershipPublic: string;
};

type Props = {
  coffees: CoffeeRow[];
  locale: string;
  translations: CoffeesTableTranslations;
  isAdmin?: boolean;
};

// Category (data-viz-ish) colors per process type — no MD3 token equivalent
// exists for an open-ended, data-driven category palette, so these hexes are
// kept deliberately (see DESIGN.md "Flavor Family Colors" for the same
// pattern). Only the *shape* (pill sizing, weight) borrows from Badge.
const PROCESS_COLORS: Record<string, string> = {
  Lavado: "#4A90D9",
  Natural: "#E8834A",
  Honey: "#C17817",
  Anaeróbico: "#8B5CF6",
  "Maceración Carbónica": "#8B5CF6",
  Láctico: "#7A6E5F",
  "Co-fermentación": "#7A6E5F",
  Otro: "#7A6E5F",
};

/** Hoisted to module scope — never redeclare components inside render. */
function ProcessBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-on-surface-variant text-xs">—</span>;
  const bg = PROCESS_COLORS[type] ?? "#7A6E5F";
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: bg }}
    >
      {type}
    </span>
  );
}

/** Hoisted to module scope — never redeclare components inside render. */
function VisibilityBadge({
  visibility,
  labels,
}: {
  visibility: string;
  labels: { public: string; shared: string; private: string };
}) {
  if (visibility === "public") return <Badge tone="success">{labels.public}</Badge>;
  if (visibility === "shared") return <Badge tone="accent">{labels.shared}</Badge>;
  return <Badge tone="neutral">{labels.private}</Badge>;
}

function relativeDate(iso: string, locale: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 2592000) return rtf.format(Math.round(diff / 604800), "week");
  if (abs < 31536000) return rtf.format(Math.round(diff / 2592000), "month");
  return rtf.format(Math.round(diff / 31536000), "year");
}

export default function CoffeesTable({ coffees, locale, translations: t, isAdmin = false }: Props) {
  const visibilityLabels = { public: t.listPublic, shared: t.listShared, private: t.listPrivate };

  const columns: Column<CoffeeRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: t.colName,
        sortable: true,
        sortValue: (row) => row.name,
        render: (row) => (
          <div>
            <span className="inline-flex items-center gap-2">
              <Link
                href={`/${locale}/app/coffees/${row.id}`}
                className="font-semibold text-on-surface hover:text-primary-container"
              >
                {row.name}
              </Link>
              {(row.isMine || isAdmin) && (
                <VisibilityBadge visibility={row.visibility} labels={visibilityLabels} />
              )}
              {!row.isMine && !isAdmin && row.visibility === "shared" && (
                <Badge tone="accent">{t.sharedWithMe}</Badge>
              )}
            </span>
            {row.ownerName && (
              <span className="block text-xs text-on-surface-variant">
                {t.adminOwnerPrefix} {row.ownerName}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "origin",
        label: t.colOrigin,
        sortable: true,
        sortValue: (row) => row.country ?? "",
        render: (row) =>
          row.country ? (
            <span>
              {row.country}
              {row.region && <span className="block text-xs text-on-surface-variant">{row.region}</span>}
            </span>
          ) : (
            <span className="text-on-surface-variant">—</span>
          ),
      },
      {
        key: "process",
        label: t.colProcess,
        sortable: true,
        sortValue: (row) => row.processType ?? "",
        render: (row) => <ProcessBadge type={row.processType} />,
      },
      {
        key: "variety",
        label: t.colVariety,
        sortable: true,
        sortValue: (row) => row.variety ?? "",
        render: (row) => row.variety ?? <span className="text-on-surface-variant">—</span>,
      },
      {
        key: "sessions",
        label: t.colSessions,
        align: "center",
        sortable: true,
        sortValue: (row) => row._count.sessionSamples,
        render: (row) => row._count.sessionSamples,
      },
      {
        key: "score",
        label: t.colLastScore,
        sortable: true,
        sortValue: (row) => row.coffeeHistory[0]?.individualScore ?? -1,
        render: (row) => <ScorePill score={row.coffeeHistory[0]?.individualScore ?? null} />,
      },
      {
        key: "date",
        label: t.colLastDate,
        sortable: true,
        sortValue: (row) => row.coffeeHistory[0]?.tastedAt ?? "",
        render: (row) => {
          const latest = row.coffeeHistory[0] ?? null;
          return (
            <span className="whitespace-nowrap text-xs text-on-surface-variant">
              {latest ? relativeDate(latest.tastedAt, locale) : "—"}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, isAdmin, t],
  );

  const facets: Facet<CoffeeRow>[] = useMemo(() => {
    const processOptions = Array.from(
      new Set(coffees.map((c) => c.processType).filter((v): v is string => !!v)),
    )
      .sort((a, b) => a.localeCompare(b, locale))
      .map((v) => ({ value: v, label: v }));

    const countryOptions = Array.from(
      new Set(coffees.map((c) => c.country).filter((v): v is string => !!v)),
    )
      .sort((a, b) => a.localeCompare(b, locale))
      .map((v) => ({ value: v, label: v }));

    return [
      {
        key: "process",
        label: t.filterProcess,
        options: processOptions,
        match: (row, value) => row.processType === value,
      },
      {
        key: "country",
        label: t.filterCountry,
        options: countryOptions,
        match: (row, value) => row.country === value,
      },
      {
        key: "ownership",
        label: t.filterOwnership,
        options: [
          { value: "mine", label: t.ownershipMine },
          { value: "shared", label: t.ownershipShared },
          { value: "public", label: t.ownershipPublic },
        ],
        match: (row, value) => {
          if (value === "mine") return row.isMine;
          if (value === "shared") return !row.isMine && row.visibility === "shared";
          if (value === "public") return !row.isMine && row.visibility === "public";
          return true;
        },
      },
    ];
  }, [coffees, locale, t]);

  return (
    <DataTable
      rows={coffees}
      rowKey={(row) => row.id}
      columns={columns}
      searchText={(row) => [row.name, row.country, row.variety, row.region]}
      facets={facets}
      getRowHref={(row) => `/${locale}/app/coffees/${row.id}`}
      renderMobileCard={(row) => {
        const latest = row.coffeeHistory[0] ?? null;
        return (
          <div className="space-y-2 rounded-card border border-outline-variant bg-surface-container-lowest px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Link
                  href={`/${locale}/app/coffees/${row.id}`}
                  className="font-semibold leading-tight text-on-surface hover:text-primary-container"
                >
                  {row.name}
                </Link>
                {(row.isMine || isAdmin) && (
                  <VisibilityBadge visibility={row.visibility} labels={visibilityLabels} />
                )}
                {!row.isMine && !isAdmin && row.visibility === "shared" && (
                  <Badge tone="accent">{t.sharedWithMe}</Badge>
                )}
              </span>
              <ProcessBadge type={row.processType} />
            </div>
            {row.ownerName && (
              <div className="text-xs text-on-surface-variant">
                {t.adminOwnerPrefix} {row.ownerName}
              </div>
            )}
            {(row.country || row.region) && (
              <div className="text-xs text-on-surface-variant">
                {[row.country, row.region].filter(Boolean).join(", ")}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <ScorePill score={latest?.individualScore ?? null} />
              <Link
                href={`/${locale}/app/coffees/${row.id}`}
                className="text-xs font-semibold text-primary-container hover:underline"
              >
                {t.view}
              </Link>
            </div>
          </div>
        );
      }}
      emptyState={
        <EmptyState icon={<CoffeeIcon size={20} aria-hidden />} title={t.noData} />
      }
      noResults={t.noResults}
      initialSort={{ key: "name", dir: "asc" }}
      locale={locale}
      translations={{
        searchPlaceholder: t.searchPlaceholder,
        showing: t.showing,
        prev: t.prev,
        next: t.next,
        clearFilters: t.clearFilters,
        all: t.all,
      }}
    />
  );
}

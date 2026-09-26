"use client";

import { useMemo } from "react";
import Link from "next/link";
import { GuestGateLink } from "@/components/guest/GuestGateLink";
import { Coffee } from "lucide-react";
import { DataTable, type Column, type Facet } from "@/components/ui/DataTable";
import { ScorePill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export type HistoryRow = {
  id: string;
  coffeeId: string;
  coffeeName: string;
  // Null for a detached row — its session was deleted (see snapshot fallback
  // in profile/history/page.tsx). Never linked in that case.
  sessionId: string | null;
  sessionName: string;
  individualScore: number | null;
  communityScore: number | null;
  /** ISO date string — serializable across the server/client boundary. */
  tastedAt: string;
};

export type HistoryTableTranslations = {
  table: {
    searchPlaceholder: string;
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    all: string;
  };
  colCoffee: string;
  colSession: string;
  colDate: string;
  yourScore: string;
  communityScore: string;
  filterScoreBand: string;
  filterYear: string;
  emptyBody: string;
  newSessionLabel: string;
  noResults: string;
  sessionDeleted: string;
};

export function HistoryTable({
  rows,
  locale,
  newSessionHref,
  translations: t,
}: {
  rows: HistoryRow[];
  locale: string;
  newSessionHref: string;
  translations: HistoryTableTranslations;
}) {
  const years = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => new Date(r.tastedAt).getFullYear()))).sort((a, b) => b - a),
    [rows],
  );

  const columns: Column<HistoryRow>[] = [
    {
      key: "coffee",
      label: t.colCoffee,
      render: (row) => (
        <GuestGateLink
          href={`/${locale}/app/coffees/${row.coffeeId}`}
          className="font-semibold text-on-surface transition-colors hover:text-primary-container"
        >
          {row.coffeeName}
        </GuestGateLink>
      ),
    },
    {
      key: "session",
      label: t.colSession,
      render: (row) =>
        row.sessionId ? (
          <Link
            href={`/${locale}/app/sessions/${row.sessionId}/results`}
            className="text-on-surface-variant transition-colors hover:text-primary-container"
          >
            {row.sessionName}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
            {row.sessionName}
            <span className="rounded-pill border border-outline-variant bg-surface-container px-1.5 py-0.5 text-[10px]">
              {t.sessionDeleted}
            </span>
          </span>
        ),
    },
    {
      key: "date",
      label: t.colDate,
      sortable: true,
      sortValue: (row) => row.tastedAt,
      render: (row) => (
        <span className="tabular-nums">{new Date(row.tastedAt).toLocaleDateString(locale)}</span>
      ),
    },
    {
      key: "individualScore",
      label: t.yourScore,
      align: "right",
      render: (row) => <ScorePill score={row.individualScore} />,
    },
    {
      key: "communityScore",
      label: t.communityScore,
      align: "right",
      render: (row) => <ScorePill score={row.communityScore} />,
    },
  ];

  const facets: Facet<HistoryRow>[] = [
    {
      key: "scoreBand",
      label: t.filterScoreBand,
      options: [
        { value: "high", label: "85+" },
        { value: "mid", label: "75–84" },
        { value: "low", label: "<75" },
      ],
      match: (row, value) => {
        if (row.individualScore == null) return false;
        if (value === "high") return row.individualScore >= 85;
        if (value === "mid") return row.individualScore >= 75 && row.individualScore < 85;
        return row.individualScore < 75;
      },
    },
    {
      key: "year",
      label: t.filterYear,
      options: years.map((y) => ({ value: String(y), label: String(y) })),
      match: (row, value) => String(new Date(row.tastedAt).getFullYear()) === value,
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      searchText={(row) => [row.coffeeName, row.sessionName]}
      facets={facets}
      renderMobileCard={(row) => (
        <div className="space-y-2 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <GuestGateLink
                href={`/${locale}/app/coffees/${row.coffeeId}`}
                className="block truncate font-semibold text-on-surface transition-colors hover:text-primary-container"
              >
                {row.coffeeName}
              </GuestGateLink>
              {row.sessionId ? (
                <Link
                  href={`/${locale}/app/sessions/${row.sessionId}/results`}
                  className="block truncate text-xs text-on-surface-variant transition-colors hover:text-primary-container"
                >
                  {row.sessionName}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 truncate text-xs text-on-surface-variant">
                  {row.sessionName}
                  <span className="shrink-0 rounded-pill border border-outline-variant bg-surface-container px-1.5 py-0.5 text-[10px]">
                    {t.sessionDeleted}
                  </span>
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-on-surface-variant">
              {new Date(row.tastedAt).toLocaleDateString(locale)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                {t.yourScore}
              </div>
              <ScorePill score={row.individualScore} />
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                {t.communityScore}
              </div>
              <ScorePill score={row.communityScore} />
            </div>
          </div>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={<Coffee size={20} />}
          title={t.emptyBody}
          action={
            <GuestGateLink
              href={newSessionHref}
              className="inline-flex items-center rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary"
            >
              {t.newSessionLabel}
            </GuestGateLink>
          }
        />
      }
      noResults={t.noResults}
      perPage={10}
      initialSort={{ key: "date", dir: "desc" }}
      locale={locale}
      translations={t.table}
    />
  );
}

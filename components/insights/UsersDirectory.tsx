"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { DataTable, type Column, type Facet } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ROLE_LABELS } from "@/lib/constants";
import type { AnalyticsUser } from "@/app/actions/analytics";

export interface UsersDirectoryTranslations {
  table: {
    searchPlaceholder: string;
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    all: string;
  };
  colName: string;
  colEmail: string;
  colCountry: string;
  colRole: string;
  colSessions: string;
  colCoffees: string;
  colJoined: string;
  empty: string;
  emailUnavailable: string;
  noResults: string;
  guestBadge: string;
  filterType: string;
  typeRegistered: string;
  typeGuest: string;
}

interface UsersDirectoryProps {
  users: AnalyticsUser[];
  locale: string;
  t: UsersDirectoryTranslations;
}

function roleLabel(role: string, locale: string): string {
  const entry = ROLE_LABELS[role];
  if (!entry) return role;
  return entry[locale === "en" ? "en" : "es"];
}

export function UsersDirectory({ users, locale, t }: UsersDirectoryProps) {
  const columns: Column<AnalyticsUser>[] = [
    {
      key: "displayName",
      label: t.colName,
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold text-on-surface">{row.displayName}</span>
          {row.isAnonymous && <Badge tone="neutral">{t.guestBadge}</Badge>}
        </span>
      ),
    },
    {
      key: "email",
      label: t.colEmail,
      render: (row) =>
        row.isAnonymous ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <span className={row.email ? "text-on-surface" : "text-on-surface-variant italic"}>
            {row.email ?? t.emailUnavailable}
          </span>
        ),
    },
    {
      key: "country",
      label: t.colCountry,
      render: (row) => <span>{row.country ?? "—"}</span>,
    },
    {
      key: "role",
      label: t.colRole,
      render: (row) => <Badge tone="neutral">{roleLabel(row.role, locale)}</Badge>,
    },
    {
      key: "sessionsCount",
      label: t.colSessions,
      sortable: true,
      align: "center",
      render: (row) => <span className="tabular-nums">{row.sessionsCount}</span>,
    },
    {
      key: "coffeesCount",
      label: t.colCoffees,
      sortable: true,
      align: "center",
      render: (row) => <span className="tabular-nums">{row.coffeesCount}</span>,
    },
    {
      key: "createdAt",
      label: t.colJoined,
      sortable: true,
      sortValue: (row) => row.createdAt,
      render: (row) => (
        <span className="tabular-nums">
          {new Date(row.createdAt).toLocaleDateString(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      ),
    },
  ];

  const facets: Facet<AnalyticsUser>[] = useMemo(
    () => [
      {
        key: "type",
        label: t.filterType,
        options: [
          { value: "registered", label: t.typeRegistered },
          { value: "guest", label: t.typeGuest },
        ],
        match: (row, value) => {
          if (value === "registered") return !row.isAnonymous;
          if (value === "guest") return row.isAnonymous;
          return true;
        },
      },
    ],
    [t],
  );

  return (
    <DataTable
      rows={users}
      rowKey={(row) => row.userId}
      columns={columns}
      searchText={(row) => [row.displayName, row.email]}
      facets={facets}
      renderMobileCard={(row) => (
        <div className="space-y-2 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold text-on-surface">{row.displayName}</p>
                {row.isAnonymous && <Badge tone="neutral">{t.guestBadge}</Badge>}
              </div>
              <p
                className={`truncate text-xs ${
                  row.isAnonymous
                    ? "text-on-surface-variant"
                    : row.email
                      ? "text-on-surface-variant"
                      : "text-on-surface-variant italic"
                }`}
              >
                {row.isAnonymous ? "—" : (row.email ?? t.emailUnavailable)}
              </p>
            </div>
            <Badge tone="neutral">{roleLabel(row.role, locale)}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
            {row.country && <span>{row.country}</span>}
            <span className="tabular-nums">
              {row.sessionsCount} · {t.colSessions}
            </span>
            <span className="tabular-nums">
              {row.coffeesCount} · {t.colCoffees}
            </span>
            <span className="tabular-nums">
              {new Date(row.createdAt).toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      )}
      emptyState={<EmptyState icon={<Users size={20} />} title={t.empty} />}
      noResults={t.noResults}
      perPage={10}
      initialSort={{ key: "createdAt", dir: "desc" }}
      locale={locale}
      translations={t.table}
    />
  );
}

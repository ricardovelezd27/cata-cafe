"use client";

import { useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { setAnalyticsAccess } from "@/app/actions/analytics";
import type { AnalyticsUser } from "@/app/actions/analytics";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export interface AccessTranslations {
  search: string;
  accessLabel: string;
  superAdmin: string;
  emailUnavailable: string;
  toggleError: string;
  empty: string;
  /** S10 (D-13): the kit's table controls and the column headers. */
  table: {
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    all: string;
  };
  colName: string;
  colEmail: string;
  colCountry: string;
}

interface AccessManagerProps {
  users: AnalyticsUser[];
  locale: string;
  t: AccessTranslations;
}

/** Rows per page of the access list (D-13: it was one list 26,722 px tall). */
const PER_PAGE = 25;

/**
 * The analytics access list (super-admin only): the kit's DataTable (search
 * by name or address, pagination), one switch per person. The rows are the
 * ones the page has always shipped; nothing new reaches the browser. A switch
 * flips at once and flips back with the line `toggleError` when the server
 * refuses (`setAnalyticsAccess` returns an ActionResult), as before.
 */
export function AccessManager({ users: initialUsers, locale, t }: AccessManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function toggle(user: AnalyticsUser) {
    const next = !user.analyticsAccess;
    setErrorId(null);
    // Optimistic update, revert on failure.
    setUsers((prev) =>
      prev.map((u) => (u.userId === user.userId ? { ...u, analyticsAccess: next } : u)),
    );
    try {
      const result = await setAnalyticsAccess(user.userId, next);
      if (!result.ok) throw new Error(result.error);
    } catch {
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === user.userId ? { ...u, analyticsAccess: !next } : u,
        ),
      );
      setErrorId(user.userId);
    }
  }

  const nameCell = (user: AnalyticsUser) => (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-on-surface">{user.displayName}</span>
        {user.isSuperAdmin && (
          <Badge tone="success" size="xs">
            <ShieldCheck size={11} aria-hidden />
            {t.superAdmin}
          </Badge>
        )}
      </div>
      {errorId === user.userId && (
        <span role="alert" className="mt-0.5 block text-xs text-error">
          {t.toggleError}
        </span>
      )}
    </div>
  );

  const accessSwitch = (user: AnalyticsUser) => {
    const on = user.isSuperAdmin || user.analyticsAccess;
    return (
      <label className="flex cursor-pointer select-none items-center gap-2">
        {/* H-07: on phones the text is visually hidden, not removed, so
            the switch inside this label keeps its name. */}
        <span className="text-xs text-on-surface-variant max-sm:sr-only">{t.accessLabel}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={user.isSuperAdmin}
          onClick={() => toggle(user)}
          // A 44 px box around the unchanged 40 x 24 track (F-03); the
          // negative margin keeps the row's height.
          className="-my-[10px] inline-flex min-h-[44px] min-w-[44px] items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`relative h-6 w-10 rounded-full transition-colors ${
              on ? "bg-primary-container" : "bg-outline-variant"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface-container-lowest shadow transition-transform ${
                on ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </label>
    );
  };

  const columns: Column<AnalyticsUser>[] = [
    {
      key: "name",
      label: t.colName,
      sortable: true,
      sortValue: (u) => u.displayName.toLowerCase(),
      render: nameCell,
    },
    {
      key: "email",
      label: t.colEmail,
      sortable: true,
      sortValue: (u) => (u.email ?? "").toLowerCase(),
      render: (u) => (
        <span className="block truncate text-xs text-on-surface-variant">{u.email ?? t.emailUnavailable}</span>
      ),
    },
    {
      key: "country",
      label: t.colCountry,
      sortable: true,
      sortValue: (u) => u.country ?? "",
      render: (u) => <span className="text-xs text-on-surface-variant">{u.country ?? "–"}</span>,
    },
    {
      key: "access",
      label: t.accessLabel,
      align: "right",
      render: accessSwitch,
    },
  ];

  return (
    <DataTable
      rows={users}
      rowKey={(u) => u.userId}
      columns={columns}
      // The same fields today's search read: the name and the address.
      searchText={(u) => [u.displayName, u.email]}
      renderMobileCard={(u) => (
        <div className="flex items-center gap-3 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <div className="min-w-0 flex-1 space-y-0.5">
            {nameCell(u)}
            <span className="block truncate text-xs text-on-surface-variant">
              {u.email ?? t.emailUnavailable}
              {u.country ? ` · ${u.country}` : ""}
            </span>
          </div>
          {accessSwitch(u)}
        </div>
      )}
      emptyState={<EmptyState icon={<Users size={20} />} title={t.empty} />}
      noResults={t.empty}
      perPage={PER_PAGE}
      locale={locale}
      translations={{ searchPlaceholder: t.search, ...t.table }}
    />
  );
}

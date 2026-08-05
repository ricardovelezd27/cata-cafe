"use client";

import Link from "next/link";
import { Coffee, Pencil } from "lucide-react";
import { DataTable, type Column, type Facet } from "@/components/ui/DataTable";
import { Badge, StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteSessionButton, type DeleteSessionTranslations } from "./DeleteSessionButton";
import { DuplicateButton } from "@/components/DuplicateButton";

export type SessionRow = {
  id: string;
  name: string;
  /** ISO date string — serializable across the server/client boundary. */
  date: string;
  status: string;
  format: string;
  isGroup: boolean;
  samplesCount: number;
  participantsCount: number;
  groupName: string | null;
  isOwner: boolean;
  href: string;
};

export type SessionsTableTranslations = {
  table: {
    searchPlaceholder: string;
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    all: string;
  };
  colName: string;
  colDate: string;
  colSamples: string;
  colParticipants: string;
  colStatus: string;
  filterStatus: string;
  filterFormat: string;
  filterRole: string;
  roleMine: string;
  roleParticipant: string;
  participantBadge: string;
  emptyTitle: string;
  emptyBody: string;
  groupBadge: string;
  formats: { descriptive: string; affective: string; combined: string };
  statuses: { draft: string; active: string; closed: string };
  noResults: string;
  editLabel: string;
  newSessionLabel: string;
  duplicateLabel: string;
  duplicateError: string;
};

function formatLabel(format: string, formats: SessionsTableTranslations["formats"]): string {
  if (format === "descriptive") return formats.descriptive;
  if (format === "affective") return formats.affective;
  if (format === "combined") return formats.combined;
  return format;
}

export function SessionsTable({
  rows,
  locale,
  hasDraft,
  newSessionHref,
  translations: t,
  deleteTranslations,
}: {
  rows: SessionRow[];
  locale: string;
  hasDraft: boolean;
  newSessionHref: string;
  translations: SessionsTableTranslations;
  deleteTranslations: DeleteSessionTranslations;
}) {
  const statusOptions = [
    ...(hasDraft ? [{ value: "draft", label: t.statuses.draft }] : []),
    { value: "active", label: t.statuses.active },
    { value: "closed", label: t.statuses.closed },
  ];

  const columns: Column<SessionRow>[] = [
    {
      key: "name",
      label: t.colName,
      render: (row) => (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={row.href}
              className="font-semibold text-on-surface transition-colors hover:text-primary-container"
            >
              {row.name}
            </Link>
            {row.isGroup && (
              <Badge tone="accent" size="xs">
                {t.groupBadge}
              </Badge>
            )}
            {row.groupName && (
              <Badge tone="neutral" size="xs">
                {row.groupName}
              </Badge>
            )}
            {!row.isOwner && (
              <Badge tone="outline" size="xs">
                {t.participantBadge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">{formatLabel(row.format, t.formats)}</p>
        </div>
      ),
    },
    {
      key: "date",
      label: t.colDate,
      sortable: true,
      sortValue: (row) => row.date,
      render: (row) => <span className="tabular-nums">{new Date(row.date).toLocaleDateString(locale)}</span>,
    },
    {
      key: "samples",
      label: t.colSamples,
      align: "center",
      render: (row) => <span className="tabular-nums">{row.samplesCount}</span>,
    },
    {
      key: "participants",
      label: t.colParticipants,
      align: "center",
      render: (row) =>
        row.isGroup ? (
          <span className="tabular-nums">{row.participantsCount}</span>
        ) : (
          <span className="text-on-surface-variant">—</span>
        ),
    },
    {
      key: "status",
      label: t.colStatus,
      render: (row) => <StatusPill status={row.status} labels={t.statuses} />,
    },
  ];

  const facets: Facet<SessionRow>[] = [
    {
      key: "status",
      label: t.filterStatus,
      options: statusOptions,
      match: (row, value) => row.status === value,
    },
    {
      key: "format",
      label: t.filterFormat,
      options: [
        { value: "descriptive", label: t.formats.descriptive },
        { value: "affective", label: t.formats.affective },
        { value: "combined", label: t.formats.combined },
      ],
      match: (row, value) => row.format === value,
    },
    {
      key: "role",
      label: t.filterRole,
      options: [
        { value: "mine", label: t.roleMine },
        { value: "participant", label: t.roleParticipant },
      ],
      match: (row, value) => (value === "mine" ? row.isOwner : !row.isOwner),
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      searchText={(row) => [row.name, row.groupName]}
      facets={facets}
      getRowHref={(row) => row.href}
      rowActions={(row) =>
        row.isOwner ? (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/${locale}/app/sessions/${row.id}/edit`}
              aria-label={t.editLabel}
              className="inline-flex rounded-sm p-1.5 text-on-surface-variant transition-colors hover:text-primary-container"
            >
              <Pencil size={16} />
            </Link>
            <DuplicateButton
              kind="session"
              id={row.id}
              locale={locale}
              label={t.duplicateLabel}
              errorText={t.duplicateError}
              variant="icon"
            />
            <DeleteSessionButton sessionId={row.id} locale={locale} translations={deleteTranslations} />
          </div>
        ) : null
      }
      renderMobileCard={(row, actions) => (
        <div className="space-y-2 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Link
                href={row.href}
                className="block truncate font-semibold text-on-surface transition-colors hover:text-primary-container"
              >
                {row.name}
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                {row.isGroup && (
                  <Badge tone="accent" size="xs">
                    {t.groupBadge}
                  </Badge>
                )}
                {row.groupName && (
                  <Badge tone="neutral" size="xs">
                    {row.groupName}
                  </Badge>
                )}
                {!row.isOwner && (
                  <Badge tone="outline" size="xs">
                    {t.participantBadge}
                  </Badge>
                )}
              </div>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
            <span className="tabular-nums">{new Date(row.date).toLocaleDateString(locale)}</span>
            <span>{formatLabel(row.format, t.formats)}</span>
            <span className="tabular-nums">
              {row.samplesCount} · {t.colSamples}
            </span>
            {row.isGroup && (
              <span className="tabular-nums">
                {row.participantsCount} · {t.colParticipants}
              </span>
            )}
          </div>
          <StatusPill status={row.status} labels={t.statuses} />
        </div>
      )}
      emptyState={
        <EmptyState
          icon={<Coffee size={20} />}
          title={t.emptyTitle}
          body={t.emptyBody}
          action={
            <Link
              href={newSessionHref}
              className="inline-flex items-center rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary"
            >
              {t.newSessionLabel}
            </Link>
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

"use client";

import Link from "next/link";
import { Coffee, Pencil } from "lucide-react";
import { DataTable, type Column, type Facet } from "@/components/ui/DataTable";
import { Badge, StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteSessionButton, type DeleteSessionTranslations } from "./DeleteSessionButton";
import { DuplicateButton } from "@/components/DuplicateButton";
import { DeadlineBanner, type DeadlineBannerTranslations } from "@/components/session/DeadlineBanner";

export type SessionRow = {
  id: string;
  name: string;
  /** ISO date string — serializable across the server/client boundary. Null
   *  when the stored date cannot be serialised (lib/safeDate.ts). */
  date: string | null;
  status: string;
  format: string;
  isGroup: boolean;
  samplesCount: number;
  participantsCount: number;
  groupName: string | null;
  isOwner: boolean;
  isParticipant: boolean;
  ownerName: string | null;
  href: string;
  /** ISO closing date + owner's zone, for the deadline line (S8-05). */
  closesAt: string | null;
  closesAtZone: string | null;
};

export type SessionsTableTranslations = {
  table: {
    searchPlaceholder: string;
    showing: string;
    prev: string;
    next: string;
    clearFilters: string;
    caption: string;
    actions?: string;
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
  roleOthers: string;
  participantBadge: string;
  adminOwnerPrefix: string;
  emptyTitle: string;
  emptyBody: string;
  groupBadge: string;
  formats: { descriptive: string; affective: string; combined: string };
  statuses: { draft: string; active: string; closed: string };
  noResults: string;
  editLabel: string;
  duplicateLabel: string;
  duplicateError: string;
  duplicateDropped: string;
  deadline: DeadlineBannerTranslations;
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
  translations: t,
  deleteTranslations,
  isAdmin = false,
}: {
  rows: SessionRow[];
  locale: string;
  hasDraft: boolean;
  translations: SessionsTableTranslations;
  deleteTranslations: DeleteSessionTranslations;
  isAdmin?: boolean;
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
              className="inline-block min-h-[24px] min-w-[24px] font-semibold text-on-surface transition-colors hover:text-primary-container"
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
            {!row.isOwner && row.isParticipant && (
              <Badge tone="outline" size="xs">
                {t.participantBadge}
              </Badge>
            )}
          </div>
          <p className="text-caption text-on-surface-variant">{formatLabel(row.format, t.formats)}</p>
          {row.closesAt && row.status !== "closed" && (
            <p className="text-caption">
              <DeadlineBanner closesAt={row.closesAt} zone={row.closesAtZone} locale={locale} translations={t.deadline} compact />
            </p>
          )}
          {row.ownerName && (
            <p className="text-caption text-on-surface-variant">
              {t.adminOwnerPrefix} {row.ownerName}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      label: t.colDate,
      sortable: true,
      sortValue: (row) => row.date ?? "",
      render: (row) => <span className="tabular-nums">{row.date ? new Date(row.date).toLocaleDateString(locale) : "–"}</span>,
    },
    {
      key: "samples",
      label: t.colSamples,
      numeric: true,
      render: (row) => <span className="tabular-nums">{row.samplesCount}</span>,
    },
    {
      key: "participants",
      label: t.colParticipants,
      numeric: true,
      render: (row) =>
        row.isGroup ? (
          <span className="tabular-nums">{row.participantsCount}</span>
        ) : (
          <span className="text-on-surface-variant">–</span>
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
        ...(isAdmin ? [{ value: "others", label: t.roleOthers }] : []),
      ],
      match: (row, value) => {
        if (value === "mine") return row.isOwner;
        if (value === "participant") return row.isParticipant && !row.isOwner;
        if (value === "others") return !row.isOwner && !row.isParticipant;
        return true;
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      searchText={(row) => [row.name, row.groupName, row.ownerName]}
      facets={facets}
      getRowHref={(row) => row.href}
      rowActions={(row) =>
        row.isOwner ? (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/${locale}/app/sessions/${row.id}/edit`}
              aria-label={t.editLabel}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm p-1.5 text-on-surface-variant transition-colors hover:text-primary-container"
            >
              <Pencil size={16} />
            </Link>
            <DuplicateButton
              kind="session"
              id={row.id}
              locale={locale}
              label={t.duplicateLabel}
              errorText={t.duplicateError}
              droppedText={t.duplicateDropped}
              variant="icon"
            />
            <DeleteSessionButton sessionId={row.id} locale={locale} translations={deleteTranslations} />
          </div>
        ) : null
      }
      renderMobileCard={(row, actions) => (
        // D-13 (Q1): the whole card is the session's link (one target): the title's link
        // stretches over the card through an ::after layer. The owner's three 44 px
        // actions stay as a row above that layer (DESIGN.md: an interactive card is the
        // link itself, so the actions cannot live inside a second, nested control).
        // `isolate` keeps that z-10 inside the card, so the phone's fixed bottom bar
        // still paints over a card that scrolls under it.
        <div className="relative isolate space-y-2 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Link
                href={row.href}
                className="block min-h-[24px] truncate font-semibold text-on-surface transition-colors hover:text-primary-container after:absolute after:inset-0 after:rounded-card after:content-['']"
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
                {!row.isOwner && row.isParticipant && (
                  <Badge tone="outline" size="xs">
                    {t.participantBadge}
                  </Badge>
                )}
              </div>
              {row.ownerName && (
                <p className="text-caption text-on-surface-variant">
                  {t.adminOwnerPrefix} {row.ownerName}
                </p>
              )}
            </div>
            {actions && <div className="relative z-10 flex shrink-0 items-center gap-1">{actions}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-on-surface-variant">
            <span className="tabular-nums">{row.date ? new Date(row.date).toLocaleDateString(locale) : "–"}</span>
            <span>{formatLabel(row.format, t.formats)}</span>
            {row.closesAt && row.status !== "closed" && (
              <DeadlineBanner closesAt={row.closesAt} zone={row.closesAtZone} locale={locale} translations={t.deadline} compact />
            )}
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

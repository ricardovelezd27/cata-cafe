import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { sessionHref } from "@/lib/sessionRouting";
import { SessionsTable, type SessionRow, type SessionsTableTranslations } from "./SessionsTable";
import type { DeleteSessionTranslations } from "./DeleteSessionButton";

export default async function SessionsList({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("session");
  const tc = await getTranslations("common");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ownSessions, joinedParticipants] = user
    ? await Promise.all([
        prisma.cuppingSession.findMany({
          where: { createdBy: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            samples: { select: { id: true } },
            participants: { select: { userId: true } },
            group: { select: { name: true } },
          },
        }),
        prisma.sessionParticipant.findMany({
          where: { userId: user.id, status: "joined" },
          include: {
            session: {
              include: {
                samples: { select: { id: true } },
                participants: { select: { userId: true } },
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        }),
      ])
    : [[], []];

  const joinedSessions = joinedParticipants.map((p) => p.session);

  const rows: SessionRow[] = [
    ...ownSessions.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date.toISOString(),
      status: s.status,
      format: s.format,
      isGroup: s.isGroup,
      samplesCount: s.samples.length,
      participantsCount: s.participants.length,
      groupName: s.group?.name ?? null,
      isOwner: true,
      href: sessionHref(s, { locale, isOwner: true }),
    })),
    ...joinedSessions.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date.toISOString(),
      status: s.status,
      format: s.format,
      isGroup: s.isGroup,
      samplesCount: s.samples.length,
      participantsCount: s.participants.length,
      groupName: null,
      isOwner: false,
      href: sessionHref(s, { locale, isOwner: false }),
    })),
  ];

  const hasDraft = rows.some((r) => r.status === "draft");

  const deleteTranslations: DeleteSessionTranslations = {
    title: t("deleteSession.title"),
    body: t("deleteSession.body"),
    confirm: t("deleteSession.confirm"),
    cancel: t("deleteSession.cancel"),
    error: t("deleteSession.error"),
  };

  const tableTranslations: SessionsTableTranslations = {
    table: {
      searchPlaceholder: tc("searchPlaceholder"),
      // t.raw — "showing" carries {from}/{to}/{total} ICU placeholders that the
      // client replaces manually; t() without args would render the raw key.
      showing: tc.raw("showing"),
      prev: tc("prev"),
      next: tc("next"),
      clearFilters: tc("clearFilters"),
      all: tc("all"),
    },
    colName: t("table.colName"),
    colDate: t("table.colDate"),
    colSamples: t("table.colSamples"),
    colParticipants: t("table.colParticipants"),
    colStatus: t("table.colStatus"),
    filterStatus: t("table.filterStatus"),
    filterFormat: t("table.filterFormat"),
    filterRole: t("table.filterRole"),
    roleMine: t("table.roleMine"),
    roleParticipant: t("table.roleParticipant"),
    participantBadge: t("table.participantBadge"),
    emptyTitle: t("table.emptyTitle"),
    emptyBody: t("table.emptyBody"),
    groupBadge: t("table.groupBadge"),
    formats: {
      descriptive: t("formats.descriptive"),
      affective: t("formats.affective"),
      combined: t("formats.combined"),
    },
    statuses: {
      draft: tc("statusDraft"),
      active: tc("statusActive"),
      closed: tc("statusClosed"),
    },
    noResults: tc("noResults"),
    editLabel: tc("edit"),
    newSessionLabel: t("new"),
    duplicateLabel: tc("duplicate"),
    duplicateError: tc("duplicateError"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("list")}
        action={
          <Link
            href={`/${locale}/app/sessions/new`}
            className="inline-flex items-center rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary"
          >
            {t("new")}
          </Link>
        }
      />

      <SessionsTable
        rows={rows}
        locale={locale}
        hasDraft={hasDraft}
        newSessionHref={`/${locale}/app/sessions/new`}
        translations={tableTranslations}
        deleteTranslations={deleteTranslations}
      />
    </div>
  );
}

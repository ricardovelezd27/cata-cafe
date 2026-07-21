import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clipboard, UserCheck, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { StatCard } from "@/components/dashboard/StatCard";
import { GroupNameControls } from "@/components/groups/GroupNameControls";
import { GroupActivityFeed, type GroupActivityEvent } from "@/components/groups/GroupActivityFeed";
import { MemberList } from "@/components/groups/MemberList";
import { QuickAddCoCuppers } from "@/components/groups/QuickAddCoCuppers";
import { AddByEmailForm } from "@/components/groups/AddByEmailForm";
import { GroupEmailComposer } from "@/components/groups/GroupEmailComposer";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as join/[token].
export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [group, cuppers, sessions] = await Promise.all([
    prisma.tastingGroup.findFirst({
      where: { id, createdBy: user.id },
      include: { members: { orderBy: { createdAt: "asc" } } },
    }),
    getCoCupperCandidates(user.id),
    prisma.cuppingSession.findMany({
      where: { createdBy: user.id, isGroup: true, status: { in: ["draft", "active"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

  if (!group) notFound();

  const t = await getTranslations("groups");

  // Co-cupper candidates only ever carry a linked userId (they come from
  // sessionParticipant rows, always tied to a Profile) — never carry an email
  // by themselves, so de-duping against existing members only needs the
  // userId side of each member row (email-only/unregistered members can never
  // collide with a candidate this way).
  const memberUserIds = new Set(
    group.members.map((m) => m.userId).filter((v): v is string => !!v),
  );
  const eligibleCuppers = cuppers.filter((c) => !memberUserIds.has(c.userId));

  // ── Group stats + activity (linked members only — email-only invitees have
  //    no account yet, so no activity can exist for them) ─────────────────────
  const linkedIds = [...memberUserIds];
  const nameByUserId = new Map(
    group.members
      .filter((m): m is typeof m & { userId: string } => !!m.userId)
      .map((m) => [m.userId, m.displayName ?? m.email]),
  );

  let sharedSessionsCount = 0;
  let groupEvalCount = 0;
  let events: GroupActivityEvent[] = [];

  if (linkedIds.length > 0) {
    const [sharedSessions, evalCount, feedEvals, feedJoins] = await Promise.all([
      prisma.sessionParticipant.findMany({
        where: { userId: { in: linkedIds }, session: { createdBy: user.id } },
        select: { sessionId: true },
        distinct: ["sessionId"],
      }),
      prisma.evaluation.count({
        where: {
          cupperId: { in: linkedIds },
          isDraft: false,
          sessionSample: { session: { createdBy: user.id } },
        },
      }),
      prisma.evaluation.findMany({
        where: {
          cupperId: { in: linkedIds },
          isDraft: false,
          submittedAt: { not: null },
          sessionSample: { session: { createdBy: user.id } },
        },
        orderBy: { submittedAt: "desc" },
        take: 12,
        select: {
          submittedAt: true,
          cupperId: true,
          sessionSample: { select: { label: true, session: { select: { name: true } } } },
        },
      }),
      prisma.sessionParticipant.findMany({
        where: {
          userId: { in: linkedIds },
          status: "joined",
          session: { createdBy: user.id },
        },
        orderBy: { joinedAt: "desc" },
        take: 12,
        select: { joinedAt: true, userId: true, session: { select: { name: true } } },
      }),
    ]);

    sharedSessionsCount = sharedSessions.length;
    groupEvalCount = evalCount;

    const evalEvents: GroupActivityEvent[] = feedEvals
      .filter((e): e is typeof e & { submittedAt: Date } => !!e.submittedAt)
      .map((e) => ({
        message: t("activityEval", {
          name: nameByUserId.get(e.cupperId) ?? "—",
          sample: e.sessionSample.label,
          session: e.sessionSample.session.name,
        }),
        timestamp: e.submittedAt,
      }));
    const joinEvents: GroupActivityEvent[] = feedJoins.map((j) => ({
      message: t("activityJoined", {
        name: nameByUserId.get(j.userId) ?? "—",
        session: j.session.name,
      }),
      timestamp: j.joinedAt,
    }));
    events = [...evalEvents, ...joinEvents]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 12);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <Link
        href={`/${locale}/app/groups`}
        className="inline-flex items-center gap-1.5 text-sm text-brown-mid hover:text-green-dark transition-colors"
      >
        <ArrowLeft size={16} /> {t("backToGroups")}
      </Link>

      <GroupNameControls
        groupId={group.id}
        name={group.name}
        locale={locale}
        t={{
          rename: t("rename"),
          delete: t("delete"),
          confirmDelete: t("confirmDelete"),
          saveName: t("saveName"),
          groupName: t("groupName"),
          errorGeneric: t("errorGeneric"),
        }}
      />

      {/* Group stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t("members")}
          value={String(group.members.length)}
          subtext=""
          icon={<Users size={18} />}
        />
        <StatCard
          label={t("statLinked")}
          value={String(linkedIds.length)}
          subtext=""
          icon={<UserCheck size={18} />}
        />
        <StatCard
          label={t("statSharedSessions")}
          value={String(sharedSessionsCount)}
          subtext=""
          icon={<Clipboard size={18} />}
        />
        <StatCard
          label={t("statGroupEvals")}
          value={String(groupEvalCount)}
          subtext=""
          accent
          icon={<CheckCircle2 size={18} />}
        />
      </div>

      {/* Roster */}
      <div className="space-y-3">
        <h2 className="font-serif text-xl text-green-dark">{t("members")}</h2>
        <MemberList
          groupId={group.id}
          members={group.members.map((m) => ({
            id: m.id,
            email: m.email,
            displayName: m.displayName,
            userId: m.userId,
          }))}
          t={{
            unregistered: t("unregistered"),
            removeMember: t("removeMember"),
            confirmRemoveMember: t("confirmRemoveMember"),
            errorGeneric: t("errorGeneric"),
          }}
        />
      </div>

      {/* Activity feed */}
      <GroupActivityFeed
        title={t("activityTitle")}
        events={events}
        emptyText={t("activityEmpty")}
        locale={locale}
      />

      {/* Add members */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-xs text-brown-mid font-semibold uppercase tracking-wide">
            {t("coCuppersTitle")}
          </h3>
          <QuickAddCoCuppers
            groupId={group.id}
            candidates={eligibleCuppers.map((c) => ({
              userId: c.userId,
              displayName: c.displayName,
            }))}
            t={{
              noCoCuppers: t("noCoCuppers"),
              added: t("added"),
              errorGeneric: t("errorGeneric"),
            }}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-xs text-brown-mid font-semibold uppercase tracking-wide">
            {t("addByEmail")}
          </h3>
          <AddByEmailForm
            groupId={group.id}
            t={{
              emailPlaceholder: t("emailPlaceholder"),
              displayNamePlaceholder: t("displayNamePlaceholder"),
              addMember: t("addMember"),
              errorGeneric: t("errorGeneric"),
            }}
          />
        </div>
      </div>

      {/* Email composer */}
      <div className="space-y-3">
        <h2 className="font-serif text-xl text-green-dark">{t("composeEmail")}</h2>
        <GroupEmailComposer
          groupId={group.id}
          sessions={sessions}
          t={{
            subject: t("subject"),
            message: t("message"),
            includeInviteLink: t("includeInviteLink"),
            selectSession: t("selectSession"),
            send: t("send"),
            sending: t("sending"),
            sendSummaryTemplate: t.raw("sendSummary"),
            sendSkippedNotice: t("sendSkippedNotice"),
            errorGeneric: t("errorGeneric"),
          }}
        />
      </div>
    </div>
  );
}

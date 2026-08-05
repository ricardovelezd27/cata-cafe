import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clipboard, UserCheck, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { claimGroupMembershipsByEmail } from "@/lib/groupMembership";
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

const SESSION_STATUS_COLORS: Record<string, string> = {
  draft: "#C17817",
  active: "#3D5A3E",
  closed: "#8B7355",
};

// Never send a co-member's full email address to the client — this runs
// server-side and only the masked string ever ends up in the rendered HTML.
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

type GroupSessionRow = { id: string; name: string; date: Date; status: string; isGroup: boolean };

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

  // Link any email-only memberships to this account first — an invitee who
  // already had an account (signup trigger never fired) would otherwise fail
  // the members.some visibility check below and 404 on their own invite link.
  await claimGroupMembershipsByEmail(user.id, user.email);

  // Visible to the owner OR any linked member — the owner-gate for mutations
  // stays inside the server actions; this OR is purely about read visibility.
  const group = await prisma.tastingGroup.findFirst({
    where: {
      id,
      OR: [{ createdBy: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      owner: { select: { displayName: true } },
    },
  });

  if (!group) notFound();

  const isOwner = group.createdBy === user.id;
  const t = await getTranslations("groups");

  // Sessions linked to this group via the CuppingSession.groupId FK (Groups
  // v2) — real relation now, no more inferring "shared sessions" from
  // participant rows. Used by both views' "Sesiones del grupo" section, and
  // by the owner's "shared sessions" stat below.
  const groupSessions: GroupSessionRow[] = await prisma.cuppingSession.findMany({
    where: { groupId: id },
    orderBy: { date: "desc" },
    select: { id: true, name: true, date: true, status: true, isGroup: true },
  });

  // Only needed for the member (non-owner) view's per-session link rule.
  let participantSessionIds = new Set<string>();
  const inviteTokenBySessionId = new Map<string, string>();

  if (!isOwner && groupSessions.length > 0) {
    const sessionIds = groupSessions.map((s) => s.id);
    const [participantRows, inviteRows] = await Promise.all([
      prisma.sessionParticipant.findMany({
        where: { userId: user.id, sessionId: { in: sessionIds } },
        select: { sessionId: true },
      }),
      prisma.sessionInvite.findMany({
        where: { sessionId: { in: sessionIds } },
        orderBy: { createdAt: "desc" },
        select: { sessionId: true, token: true, maxUses: true, useCount: true, expiresAt: true },
      }),
    ]);
    participantSessionIds = new Set(participantRows.map((p) => p.sessionId));

    // Rows are newest-first, so the first valid one per session wins —
    // same "newest valid invite" rule as resolveOrCreateSessionInvite in
    // app/actions/groups.ts.
    const now = new Date();
    for (const inv of inviteRows) {
      if (inviteTokenBySessionId.has(inv.sessionId)) continue;
      const valid =
        (!inv.expiresAt || inv.expiresAt > now) && (inv.maxUses === null || inv.useCount < inv.maxUses);
      if (valid) inviteTokenBySessionId.set(inv.sessionId, inv.token);
    }
  }

  // Shared "Sesiones del grupo" section — link rule differs by role:
  // owner always goes to results; a member goes to results only if they're
  // an actual participant, else (for an active session) to the newest valid
  // join link; otherwise the row renders with no link at all.
  const sessionsSection = (
    <div className="space-y-3">
      <h2 className="font-serif text-xl text-green-dark">{t("sessionsTitle")}</h2>
      {groupSessions.length === 0 ? (
        <p className="text-sm text-brown-mid">{t("noSessions")}</p>
      ) : (
        <ul className="grid gap-2">
          {groupSessions.map((s) => {
            const isParticipant = isOwner || participantSessionIds.has(s.id);
            const inviteToken = inviteTokenBySessionId.get(s.id);
            const href = isParticipant
              ? `/${locale}/app/sessions/${s.id}/results`
              : s.status === "active" && inviteToken
                ? `/${locale}/join/${inviteToken}`
                : null;
            const showJoinLabel = !isParticipant && !!href;
            const content = (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-brown-dark">{s.name}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold ml-auto"
                    style={{
                      background: `${SESSION_STATUS_COLORS[s.status] ?? "#8B7355"}18`,
                      color: SESSION_STATUS_COLORS[s.status] ?? "#8B7355",
                      border: `1px solid ${SESSION_STATUS_COLORS[s.status] ?? "#8B7355"}40`,
                    }}
                  >
                    {s.status}
                  </span>
                </div>
                {showJoinLabel && <p className="text-xs text-green-dark mt-1">{t("joinSessionLink")}</p>}
              </>
            );
            return (
              <li key={s.id} className="bg-white border border-[#E8E0D0] rounded-card px-4 py-3">
                {href ? (
                  <Link href={href} className="block hover:opacity-80 transition-opacity">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (!isOwner) {
    // ── Member (read-only) view — no stats, add-member forms, composer, or
    //    activity feed; only displayName or a masked email is ever shown. ──
    const memberRows = group.members.map((m) => ({
      id: m.id,
      label: m.displayName || maskEmail(m.email),
    }));

    return (
      <div className="max-w-3xl space-y-8">
        <Link
          href={`/${locale}/app/groups`}
          className="inline-flex items-center gap-1.5 text-sm text-brown-mid hover:text-green-dark transition-colors"
        >
          <ArrowLeft size={16} /> {t("backToGroups")}
        </Link>

        <div className="space-y-2">
          <h1 className="font-serif text-3xl text-green-dark font-semibold">{group.name}</h1>
          <p className="text-sm text-brown-mid">{group.description || t("noDescription")}</p>
          <p className="text-xs text-brown-mid">
            {t("ownerLabel")}: <span className="font-semibold">{group.owner.displayName}</span>
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="font-serif text-xl text-green-dark">{t("members")}</h2>
          <div className="space-y-2">
            {memberRows.map((m) => (
              <div
                key={m.id}
                className="px-4 py-3 bg-white border border-[#E8E0D0] rounded-card text-sm font-semibold text-brown-dark"
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {sessionsSection}
      </div>
    );
  }

  // ── Owner view ────────────────────────────────────────────────────────
  const [cuppers, composerSessions] = await Promise.all([
    getCoCupperCandidates(user.id),
    prisma.cuppingSession.findMany({
      where: { createdBy: user.id, isGroup: true, status: { in: ["draft", "active"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

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

  let groupEvalCount = 0;
  let events: GroupActivityEvent[] = [];

  if (linkedIds.length > 0) {
    const [evalCount, feedEvals, feedJoins] = await Promise.all([
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
        description={group.description}
        locale={locale}
        t={{
          editDetails: t("editDetails"),
          delete: t("delete"),
          confirmDelete: t("confirmDelete"),
          saveDetails: t("saveDetails"),
          groupName: t("groupName"),
          descriptionLabel: t("descriptionLabel"),
          descriptionPlaceholder: t("descriptionPlaceholder"),
          noDescription: t("noDescription"),
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
          value={String(groupSessions.length)}
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

      {sessionsSection}

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
              added: t("added"),
              sendSkippedNotice: t("sendSkippedNotice"),
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
          sessions={composerSessions}
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

import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import Link from "next/link";
import { CheckCircle2, Clipboard, Plus, UserCheck, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { maskEmail, memberLabel } from "@/lib/maskEmail";
import { loadGroupForViewer } from "@/lib/groups/memberView";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { claimGroupMembershipsByEmail } from "@/lib/groupMembership";
import { sessionHref } from "@/lib/sessionRouting";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageBackLink, PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/Badge";
import { GroupNameControls } from "@/components/groups/GroupNameControls";
import { GroupActivityFeed, type GroupActivityEvent } from "@/components/groups/GroupActivityFeed";
import { MemberList } from "@/components/groups/MemberList";
import { QuickAddCoCuppers } from "@/components/groups/QuickAddCoCuppers";
import { AddByEmailForm } from "@/components/groups/AddByEmailForm";
import { GroupEmailComposer } from "@/components/groups/GroupEmailComposer";
import { GroupFeed, type GroupFeedPost } from "@/components/groups/GroupFeed";
import { PostComposer } from "@/components/groups/PostComposer";
import { DuplicateButton } from "@/components/DuplicateButton";
import { LeaveGroupButton } from "@/components/groups/LeaveGroupButton";
import { GroupEmailOptOutNotice } from "@/components/groups/GroupEmailOptOutNotice";
import { profileDisplayName } from "@/lib/accountDeletion/deletedProfile";
import { Card } from "@/components/ui/Card";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { PageContainer } from "@/components/ui/PageContainer";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as join/[token].
export const dynamic = "force-dynamic";
// Hosts group mail actions (compose, resend, notice): outlive the fan-out (S9-01 D-08).
export const maxDuration = 120;

type GroupSessionRow = {
  id: string;
  name: string;
  date: Date;
  status: string;
  isGroup: boolean;
  isAsync: boolean;
  startedAt: Date | null;
  closesAt: Date | null;
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/groups/${id}`);

  // Link any email-only memberships to this account first — an invitee who
  // already had an account (signup trigger never fired) would otherwise fail
  // the members.some visibility check below and 404 on their own invite link.
  await claimGroupMembershipsByEmail(user.id, user.email);

  const t = await getTranslations("groups");
  // Visible to the owner OR any linked member; the member rows come back with a
  // label and NO address (lib/groups/memberView.ts, S10 WP5a F-grupos-10).
  const group = await loadGroupForViewer(id, user.id, {
    pending: t("pendingInvite"),
    member: t("memberLabel"),
  });

  if (!group) notFound();

  const isOwner = group.createdBy === user.id;
  const ownerMembers = isOwner
    ? await prisma.tastingGroupMember.findMany({
        where: { groupId: id },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const tCommon = await getTranslations("common");

  // Announcements feed — visible to both owner and members (read-only for
  // members). Fetched once here so both branches below can use it.
  const posts = await prisma.groupPost.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });
  const feedPosts: GroupFeedPost[] = posts.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    emailSent: p.emailSent,
    createdAt: p.createdAt.toISOString(),
    author: { displayName: profileDisplayName({ id: p.authorId, displayName: p.author.displayName }, locale) },
  }));
  const feedT = {
    empty: t("feed.empty"),
    emptyMember: t("feed.emptyMember"),
    edit: t("feed.edit"),
    save: t("feed.save"),
    cancel: tCommon("cancel"),
    delete: t("feed.delete"),
    deleteTitle: t("feed.deleteTitle"),
    deleteBody: t("feed.deleteBody"),
    error: t("feed.error"),
    emailSentBadge: t("feed.emailSentBadge"),
    titleLabel: t("feed.titleLabel"),
    bodyLabel: t("feed.bodyLabel"),
    editNamed: t.raw("feed.editNamed") as string,
    deleteNamed: t.raw("feed.deleteNamed") as string,
  };

  // Sessions linked to this group via the CuppingSession.groupId FK (Groups
  // v2) — real relation now, no more inferring "shared sessions" from
  // participant rows. Used by both views' "Sesiones del grupo" section, and
  // by the owner's "shared sessions" stat below. startedAt feeds sessionHref
  // (single source of truth for "where does clicking a session take me?").
  const groupSessions: GroupSessionRow[] = await prisma.cuppingSession.findMany({
    where: { groupId: id },
    orderBy: { date: "desc" },
    select: { id: true, name: true, date: true, status: true, isGroup: true, isAsync: true, startedAt: true, closesAt: true },
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
        where: { sessionId: { in: sessionIds }, active: true },
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

  // Shared "Sesiones del grupo" section — link rule differs by role: an
  // owner or actual participant goes to sessionHref's normal routing (waiting
  // room / cup / results, whichever fits session state); anyone else goes to
  // the newest valid join link for an active session, else no link at all.
  const sessionsSection = (
    <div className="space-y-3">
      <PaperSectionHeading title={t("sessionsTitle")} flush />
      {groupSessions.length === 0 ? (
        <EmptyState icon={<Clipboard size={20} aria-hidden />} title={t("noSessions")} />
      ) : (
        <ul className="grid gap-2">
          {groupSessions.map((s) => {
            const isParticipant = isOwner || participantSessionIds.has(s.id);
            const inviteToken = inviteTokenBySessionId.get(s.id);
            const href = isParticipant
              ? sessionHref(s, { locale, isOwner })
              : s.status === "active" && inviteToken
                ? `/${locale}/join/${inviteToken}`
                : null;
            const showJoinLabel = !isParticipant && !!href;
            const content = (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface">{s.name}</span>
                  <span className="ml-auto">
                    <StatusPill
                      status={s.status}
                      labels={{
                        draft: tCommon("statusDraft"),
                        active: tCommon("statusActive"),
                        closed: tCommon("statusClosed"),
                      }}
                    />
                  </span>
                </div>
                {showJoinLabel && (
                  <p className="text-caption text-primary-container mt-1">{t("joinSessionLink")}</p>
                )}
              </>
            );
            return (
              // P2c (D-07): each session is a Card (the whole card is the link when there is one).
              href ? (
                <Card as="li" key={s.id} href={href} padding="row">
                  {content}
                </Card>
              ) : (
                <Card as="li" key={s.id} padding="row">
                  {content}
                </Card>
              )
            );
          })}
        </ul>
      )}
    </div>
  );

  if (!isOwner) {
    // ── Member (read-only) view — no stats, add-member forms, composer, or
    //    activity feed; only a name or "Invitación pendiente" is ever shown (never an email,
    //    masked or not; S10 WP5a, F-grupos-10). ──
    // D7 (Kim's simulated answer, built): every member sees the names of the other members,
    // never an email. A teacher-chosen or teacher-only roster is not built (TODO(kim-validar:D7));
    // there is no roster setting.
    const myMemberRow = group.members.find((m) => m.userId === user.id);
    const memberRows = group.members.map((m) => ({ id: m.id, label: m.label }));
    const leaveT = {
      cta: t("leave.cta"),
      title: t("leave.title"),
      body: t("leave.body"),
      confirm: t("leave.confirm"),
      cancel: t("leave.cancel"),
      error: t("leave.error"),
    };

    return (
      <PageContainer width="form">
        <PageHeader
          backHref={`/${locale}/app/groups`}
          backLabel={t("backToGroups")}
          title={group.name}
          description={group.description || t("noDescription")}
        />
        <p className="text-caption text-on-surface-variant -mt-4">
          {t("ownerLabel")}: <span className="font-semibold text-on-surface">{profileDisplayName({ id: group.createdBy, displayName: group.owner.displayName }, locale)}</span>
        </p>

        <div className="space-y-3">
          <PaperSectionHeading title={t("feed.title")} flush />
          <GroupFeed posts={feedPosts} isOwner={false} locale={locale} t={feedT} />
        </div>

        <div className="space-y-3">
          <PaperSectionHeading title={t("members")} flush />
          <div className="space-y-2">
            {memberRows.map((m) => (
              <Card key={m.id} padding="row" className="text-caption font-semibold">
                {m.label}
              </Card>
            ))}
          </div>
        </div>

        {sessionsSection}

        {myMemberRow?.emailOptOutAt && (
          <GroupEmailOptOutNotice
            groupId={group.id}
            t={{ note: t("emailOptOut.note"), resume: t("emailOptOut.resume") }}
          />
        )}

        <div className="pt-2">
          <LeaveGroupButton groupId={group.id} locale={locale} t={leaveT} />
        </div>
      </PageContainer>
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
    ownerMembers.map((m) => m.userId).filter((v): v is string => !!v),
  );
  const eligibleCuppers = cuppers.filter((c) => !memberUserIds.has(c.userId));

  // ── Group stats + activity (linked members only — email-only invitees have
  //    no account yet, so no activity can exist for them) ─────────────────────
  const linkedIds = [...memberUserIds];
  const nameByUserId = new Map(
    ownerMembers
      .filter((m): m is typeof m & { userId: string } => !!m.userId)
      .map((m) => [m.userId, memberLabel(m)]),
  );

  let groupEvalCount = 0;
  let events: GroupActivityEvent[] = [];

  // S10 WP4a review (Kim C5): who has submitted in a session that is still open
  // is group information, so the feed and the count only cover sessions that
  // are closed or that the viewer owns (the group owner is not always the
  // session owner). TODO(kim-validar:C5)
  const visibleSessionsWhere = { OR: [{ status: "closed" }, { createdBy: user.id }] };

  if (linkedIds.length > 0) {
    // Scoped to sessions BELONGING TO THIS GROUP (groupId), not just sessions
    // the owner personally created — a co-owner-less group can still have
    // sessions any member spun up and linked to it, and that activity should
    // show up here too.
    const [evalCount, feedEvals, feedJoins] = await Promise.all([
      prisma.evaluation.count({
        where: {
          cupperId: { in: linkedIds },
          isDraft: false,
          sessionSample: { session: { groupId: id, ...visibleSessionsWhere } },
        },
      }),
      prisma.evaluation.findMany({
        where: {
          cupperId: { in: linkedIds },
          isDraft: false,
          submittedAt: { not: null },
          sessionSample: { session: { groupId: id, ...visibleSessionsWhere } },
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
          session: { groupId: id },
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

  const composerT = {
    composerTitle: t("feed.composerTitle"),
    titlePlaceholder: t("feed.titlePlaceholder"),
    bodyPlaceholder: t("feed.bodyPlaceholder"),
    notifyByEmail: t("feed.notifyByEmail"),
    publish: t("feed.publish"),
    publishing: t("feed.publishing"),
    error: t("feed.error"),
    notifyRecipientsTemplate: t.raw("feed.notifyRecipients") as string,
    notifyNone: t("feed.notifyNone"),
    sendSummaryTemplate: t.raw("sendSummary") as string,
    sendRateLimited: t("sendRateLimited"),
    titleLabel: t("feed.titleLabel"),
    bodyLabel: t("feed.bodyLabel"),
  };

  return (
    <PageContainer width="form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageBackLink href={`/${locale}/app/groups`} label={t("backToGroups")} />
        <div className="flex flex-wrap items-center gap-2">
          <DuplicateButton
            kind="group"
            id={group.id}
            locale={locale}
            label={tCommon("duplicate")}
            errorText={tCommon("duplicateError")}
          />
          <Link
            href={`/${locale}/app/sessions/new?groupId=${id}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill bg-primary-container px-4 py-2 text-caption font-medium text-on-primary transition-colors hover:bg-primary"
          >
            <Plus size={16} aria-hidden /> {t("createSessionCta")}
          </Link>
        </div>
      </div>

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
          cancel: tCommon("cancel"),
        }}
      />

      {/* Group stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t("members")}
          value={String(ownerMembers.length)}
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

      {/* Announcements — the group's pulse, front and center right after stats */}
      <div className="space-y-3">
        <PaperSectionHeading title={t("feed.title")} flush />
        <PostComposer groupId={group.id} recipientCount={ownerMembers.length} t={composerT} />
        <GroupFeed posts={feedPosts} isOwner locale={locale} t={feedT} />
      </div>

      {/* Roster */}
      <div className="space-y-3">
        <PaperSectionHeading title={t("members")} flush />
        <MemberList
          groupId={group.id}
          members={ownerMembers.map((m) => ({
            id: m.id,
            // Linked accounts' addresses were resolved server-side from a
            // user id (co-cupper add) — the OWNER sees them masked; a member sees no
            // address at all (lib/groupRoster.ts). Email-only invitees keep the address the owner
            // typed so "resend invitation" stays verifiable.
            email: m.userId ? maskEmail(m.email) : m.email,
            displayName: m.displayName,
            userId: m.userId,
            emailOptedOut: !!m.emailOptOutAt,
          }))}
          t={{
            unregistered: t("unregistered"),
            emailOptedOut: t("emailOptOut.badge"),
            removeMember: t("removeMember"),
            removeTitle: t("memberEdit.removeTitle"),
            removeBodyNamed: t.raw("memberEdit.removeBodyNamed") as string,
            cancel: tCommon("cancel"),
            errorGeneric: t("errorGeneric"),
            editName: t("memberEdit.editName"),
            namePlaceholder: t("memberEdit.namePlaceholder"),
            save: t("memberEdit.save"),
            resend: t("memberEdit.resend"),
            resent: t("memberEdit.resent"),
            resendFailed: t("memberEdit.resendFailed"),
            resendRateLimited: t("memberEdit.resendRateLimited"),
            removeNamed: t.raw("memberEdit.removeNamed") as string,
            editNameNamed: t.raw("memberEdit.editNameNamed") as string,
            resendNamed: t.raw("memberEdit.resendNamed") as string,
            saveNamed: t.raw("memberEdit.saveNamed") as string,
            cancelNamed: t.raw("memberEdit.cancelNamed") as string,
            nameLabelNamed: t.raw("memberEdit.nameLabelNamed") as string,
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
          <PaperSectionHeading level={3} title={t("coCuppersTitle")} flush />
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
              addNamed: t.raw("quickAddNamed") as string,
            }}
          />
        </div>
        <div className="space-y-3">
          <PaperSectionHeading level={3} title={t("addByEmail")} flush />
          <AddByEmailForm
            groupId={group.id}
            t={{
              emailPlaceholder: t("emailPlaceholder"),
              displayNamePlaceholder: t("displayNamePlaceholder"),
              addMember: t("addMember"),
              added: t("added"),
              sendSkippedNotice: t("sendSkippedNotice"),
              inviteRateLimited: t("invitesRateLimitedShort"),
              errorGeneric: t("errorGeneric"),
              emailLabel: t("emailLabel"),
            }}
          />
        </div>
      </div>

      {/* Email composer */}
      <div className="space-y-3">
        <PaperSectionHeading title={t("composeEmail")} flush />
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
            rateLimited: t("sendRateLimited"),
            retryFailed: t("retryFailed"),
            retrying: t("retrying"),
          }}
        />
      </div>
    </PageContainer>
  );
}

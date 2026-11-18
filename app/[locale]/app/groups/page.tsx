import { requireAppUser } from "@/lib/auth";
import { UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { profileDisplayName } from "@/lib/accountDeletion/deletedProfile";
import { claimGroupMembershipsByEmail } from "@/lib/groupMembership";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { CoCupperCard } from "@/components/groups/CoCupperCard";

// Hosts the create-group action, which sends invitation mail (S9-01 D-08).
export const maxDuration = 120;

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/groups`);

  // Link any email-only memberships to this account before querying — covers
  // users who already had an account when they were added by email (the
  // signup trigger never fires for them).
  await claimGroupMembershipsByEmail(user.id, user.email);

  const [groups, memberGroups, cuppers] = await Promise.all([
    prisma.tastingGroup.findMany({
      where: { createdBy: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    }),
    // Groups the current user belongs to but doesn't own (Groups v2).
    prisma.tastingGroup.findMany({
      where: { members: { some: { userId: user.id } }, createdBy: { not: user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        owner: { select: { displayName: true } },
      },
    }),
    getCoCupperCandidates(user.id),
  ]);

  const t = await getTranslations("groups");
  const tActions = await getTranslations("actions");

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  const addToGroupT = {
    addToGroup: t("addToGroup"),
    newGroupOption: t("newGroupOption"),
    namePlaceholder: t("namePlaceholder"),
    create: t("create"),
    added: t("added"),
    errorGeneric: t("errorGeneric"),
    addToGroupNamed: t.raw("addToGroupNamed") as string,
    groupName: t("groupName"),
    sessionOne: t("sessionOne"),
    sessionMany: t("sessionMany"),
    evaluationOne: t("evaluationOne"),
    evaluationMany: t("evaluationMany"),
    lastSession: t("lastSession"),
    // Raw templates: "{n}" is filled in lib/relativeDate.ts (never an ICU plural).
    relative: {
      today: t("relToday"),
      oneDay: t("relOneDay"),
      days: t.raw("relDays") as string,
      oneMonth: t("relOneMonth"),
      months: t.raw("relMonths") as string,
      oneYear: t("relOneYear"),
      years: t.raw("relYears") as string,
    },
  };

  const createGroupT = {
    createGroupCta: t("createGroupCta"),
    createGroupTitle: t("createGroupTitle"),
    namePlaceholder: t("namePlaceholder"),
    descriptionLabel: t("descriptionLabel"),
    descriptionPlaceholder: t("descriptionPlaceholder"),
    membersSectionTitle: t("membersSectionTitle"),
    emailPlaceholder: t("emailPlaceholder"),
    displayNamePlaceholder: t("displayNamePlaceholder"),
    addAnotherMember: t("addAnotherMember"),
    removeRow: t("removeRow"),
    quickAddTitle: t("quickAddTitle"),
    createAndInvite: t("createAndInvite"),
    creating: t("creating"),
    invitesSentSummaryTemplate: t.raw("invitesSentSummary") as string,
    invitesRateLimited: t("invitesRateLimited"),
    errorGeneric: t("errorGeneric"),
    closeLabel: tActions("cancel"),
    groupName: t("groupName"),
    emailLabel: t("emailLabel"),
    removeRowNamed: t.raw("removeRowNamed") as string,
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="text-caption text-on-surface-variant mt-1">{t("subtitle")}</p>
        </div>
        <CreateGroupDialog
          locale={locale}
          candidates={cuppers.map((c) => ({ userId: c.userId, displayName: c.displayName }))}
          t={createGroupT}
        />
      </div>

      {/* My groups */}
      <div className="space-y-4">
        {groups.length === 0 ? (
          <EmptyState icon={<Users size={20} aria-hidden />} title={t("empty")} body={t("emptyBody")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* P2a: each group is a Card that is a link (one anatomy, one focus ring). */}
            {groups.map((g) => (
              <Card key={g.id} href={`/${locale}/app/groups/${g.id}`} title={<span className="block truncate">{g.name}</span>}>
                {g.description && (
                  <p className="line-clamp-2 text-caption text-on-surface-variant">{g.description}</p>
                )}
                <p className={`text-caption text-on-surface-variant ${g.description ? "mt-2" : ""}`}>
                  {g._count.members}{" "}
                  {g._count.members === 1
                    ? t("members").toLowerCase().replace(/s$/, "")
                    : t("members").toLowerCase()}{" "}
                  · {formatDate(g.createdAt)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Groups where I'm a member (not owner) */}
      {memberGroups.length > 0 && (
        <div>
          <PaperSectionHeading title={t("memberGroupsTitle")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberGroups.map((g) => (
              <Card
                key={g.id}
                href={`/${locale}/app/groups/${g.id}`}
                eyebrow={t("memberBadge")}
                title={<span className="block truncate">{g.name}</span>}
              >
                {g.description && (
                  <p className="line-clamp-2 text-caption text-on-surface-variant">{g.description}</p>
                )}
                <p className={`text-caption text-on-surface-variant ${g.description ? "mt-2" : ""}`}>
                  {g._count.members}{" "}
                  {g._count.members === 1
                    ? t("members").toLowerCase().replace(/s$/, "")
                    : t("members").toLowerCase()}{" "}
                  · {profileDisplayName({ id: g.createdBy, displayName: g.owner.displayName }, locale)}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Co-cuppers */}
      <div>
        <PaperSectionHeading title={t("coCuppersTitle")} />
        {cuppers.length === 0 ? (
          <EmptyState icon={<UserPlus size={20} aria-hidden />} title={t("noCoCuppers")} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cuppers.map((c) => (
              <CoCupperCard key={c.userId} cupper={c} groups={groupOptions} locale={locale} t={addToGroupT} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

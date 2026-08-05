import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { claimGroupMembershipsByEmail } from "@/lib/groupMembership";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { CoCupperCard } from "@/components/groups/CoCupperCard";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

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
    errorGeneric: t("errorGeneric"),
    closeLabel: tActions("cancel"),
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-green-dark font-semibold">{t("title")}</h1>
          <p className="text-sm text-brown-mid mt-1">{t("subtitle")}</p>
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
          <p className="text-sm text-brown-mid">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/${locale}/app/groups/${g.id}`}
                className="block bg-white rounded-card border border-[#E8E0D0] p-5 transition-all hover:shadow-md hover:border-[#6B8F71]"
              >
                <p className="font-semibold text-[15px] text-brown-dark truncate">{g.name}</p>
                {g.description && (
                  <p className="text-xs text-brown-mid mt-1 line-clamp-2">{g.description}</p>
                )}
                <p className="text-xs text-brown-mid mt-2">
                  {g._count.members}{" "}
                  {g._count.members === 1
                    ? t("members").toLowerCase().replace(/s$/, "")
                    : t("members").toLowerCase()}{" "}
                  · {formatDate(g.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Groups where I'm a member (not owner) */}
      {memberGroups.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-serif text-xl text-green-dark">{t("memberGroupsTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberGroups.map((g) => (
              <Link
                key={g.id}
                href={`/${locale}/app/groups/${g.id}`}
                className="block bg-white rounded-card border border-[#E8E0D0] p-5 transition-all hover:shadow-md hover:border-[#6B8F71]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[15px] text-brown-dark truncate">{g.name}</p>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-amber-warm/15 text-amber-warm">
                    {t("memberBadge")}
                  </span>
                </div>
                {g.description && (
                  <p className="text-xs text-brown-mid mt-1 line-clamp-2">{g.description}</p>
                )}
                <p className="text-xs text-brown-mid mt-2">
                  {g._count.members}{" "}
                  {g._count.members === 1
                    ? t("members").toLowerCase().replace(/s$/, "")
                    : t("members").toLowerCase()}{" "}
                  · {g.owner.displayName}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Co-cuppers */}
      <div className="space-y-4">
        <h2 className="font-serif text-xl text-green-dark">{t("coCuppersTitle")}</h2>
        {cuppers.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noCoCuppers")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cuppers.map((c) => (
              <CoCupperCard key={c.userId} cupper={c} groups={groupOptions} t={addToGroupT} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

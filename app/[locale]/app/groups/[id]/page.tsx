import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { GroupNameControls } from "@/components/groups/GroupNameControls";
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

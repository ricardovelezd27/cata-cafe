import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getLatestInvite } from "@/lib/invites";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvitePanel } from "./InvitePanel";

// Authed page with an extra [id] segment: force-dynamic, no generateStaticParams
// (CLAUDE.md "authed pages with an extra dynamic segment").
export const dynamic = "force-dynamic";

export default async function SessionInvitePage({
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

  // Owner-only: everyone else (participants, strangers, guests) gets a 404 so
  // the route never confirms a session exists.
  const session = await prisma.cuppingSession.findUnique({
    where: { id },
    select: { id: true, name: true, createdBy: true, isGroup: true },
  });
  if (!session || session.createdBy !== user.id || !session.isGroup) notFound();

  const invite = await getLatestInvite(session.id);
  const t = await getTranslations("group");

  return (
    <div className="space-y-6">
      <PageHeader title={session.name} />
      {invite ? (
        <InvitePanel
          locale={locale}
          token={invite.token}
          translations={{
            inviteLink: t("inviteLink"),
            copyLink: t("copyLink"),
            copied: t("copied"),
            copyImage: t("copyImage"),
            downloadQr: t("downloadQr"),
          }}
        />
      ) : (
        <p className="text-sm text-on-surface-variant">{t("inviteMissing")}</p>
      )}
      <Link
        href={`/${locale}/app/sessions/${session.id}/cup`}
        className="inline-block rounded-pill bg-primary-container px-6 py-3 text-sm font-medium text-on-primary hover:bg-primary transition-colors"
      >
        {t("masterControls")}
      </Link>
    </div>
  );
}

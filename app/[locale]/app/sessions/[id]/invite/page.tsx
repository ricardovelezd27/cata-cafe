import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getLatestInvite } from "@/lib/invites";
import { isSessionExpired } from "@/lib/sessionState";
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
  if (!user) {
    const here = `/${locale}/app/sessions/${id}/invite`;
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(here)}`);
  }

  // Owner-only: everyone else (participants, strangers, guests) gets a 404 so
  // the route never confirms a session exists.
  const session = await prisma.cuppingSession.findUnique({
    where: { id },
    select: { id: true, name: true, createdBy: true, isGroup: true, status: true, closesAt: true },
  });
  if (!session || session.createdBy !== user.id || !session.isGroup) notFound();

  const t = await getTranslations("group");

  // A closed or expired session accepts no newcomers (joinViaToken refuses
  // with session_closed): don't hand out a dead link/QR, point to results.
  if (isSessionExpired(session)) {
    return (
      <div className="space-y-6">
        <PageHeader title={session.name} />
        <p className="text-sm text-on-surface-variant">{t("inviteClosed")}</p>
        <Link
          href={`/${locale}/app/sessions/${session.id}/results`}
          className="inline-block rounded-pill bg-primary-container px-6 py-3 text-sm font-medium text-on-primary hover:bg-primary transition-colors"
        >
          {t("viewResults")}
        </Link>
      </div>
    );
  }

  const invite = await getLatestInvite(session.id);

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

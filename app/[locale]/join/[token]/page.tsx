import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { GuestJoinForm } from "@/components/join/GuestJoinForm";
import { JoinSessionForm } from "@/components/join/JoinSessionForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations("group");
  const tErrors = await getTranslations("errors");
  const tAuth = await getTranslations("auth");

  // Validate invite token
  const invite = await prisma.sessionInvite.findUnique({
    where: { token },
    include: { session: { select: { id: true, name: true } } },
  });

  const isValid =
    invite &&
    (!invite.expiresAt || invite.expiresAt > new Date()) &&
    (invite.maxUses === null || invite.useCount < invite.maxUses);

  if (!isValid) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-red-defect">{t("invalidToken")}</p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/${locale}/app`} className="text-brown-mid underline hover:text-green-dark">
              {tErrors("home")}
            </Link>
            <Link
              href={`/${locale}/auth/login`}
              className="text-brown-mid underline hover:text-green-dark"
            >
              {tAuth("loginTitle")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Valid token, no user yet: offer guest (anonymous) join instead of forcing
  // login. Email login is still available as a subtle fallback below.
  if (!user) {
    const loginHref = `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/${token}`)}`;
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-serif text-green-dark font-semibold">
              {invite.session.name}
            </h1>
            <p className="text-sm text-brown-mid mt-1">{t("joinSession")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brown-mid mb-2">
              {t("continueAsGuest")}
            </p>
            <GuestJoinForm
              token={token}
              locale={locale}
              translations={{
                namePlaceholder: t("guestNamePlaceholder"),
                joinButton: t("guestJoinButton"),
                joining: t("guestJoining"),
                offlineNotice: t("guestOfflineNotice"),
                dataNotice: t("guestDataNotice"),
                error: t("guestError"),
              }}
            />
          </div>
          <div className="text-center">
            <Link href={loginHref} className="text-sm text-brown-mid underline hover:text-green-dark">
              {t("orSignIn")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const errorCodes = tErrors.raw("codes") as Record<string, string>;
  const joinErrors = { ...errorCodes, session_closed: t("sessionClosed") };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-green-dark font-semibold">
            {invite.session.name}
          </h1>
          <p className="text-sm text-brown-mid mt-1">{t("joinSession")}</p>
        </div>
        <JoinSessionForm
          token={token}
          locale={locale}
          translations={{
            button: t("joinSession"),
            pending: t("joining"),
            errors: joinErrors,
            home: tErrors("home"),
          }}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { GuestJoinForm } from "@/components/join/GuestJoinForm";
import { evaluateJoin } from "@/lib/joinRules";
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

  // Same pure decision joinViaToken enforces (lib/joinRules.ts).
  const invite = await prisma.sessionInvite.findUnique({
    where: { token },
    select: {
      active: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      session: {
        select: {
          id: true,
          name: true,
          status: true,
          closesAt: true,
          startedAt: true,
          isGroup: true,
          isAsync: true,
          createdBy: true,
          entriesLocked: true,
        },
      },
    },
  });

  const isMember =
    user && invite
      ? !!(await prisma.sessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId: invite.session.id, userId: user.id } },
          select: { userId: true },
        }))
      : false;

  const decision = evaluateJoin(
    { invite, session: invite?.session ?? null, viewer: { userId: user?.id ?? null, isMember } },
    locale,
  );

  if (decision.kind === "redirect") redirect(decision.href);

  // Refused states: a distinct message each, and NO anonymous sign-in is
  // ever offered (the form below only renders for "ok").
  if (decision.kind !== "ok" || !invite) {
    const kind = decision.kind === "ok" ? "invalid" : decision.kind;
    const copy = {
      closed: [t("joinClosedTitle"), t("joinClosedBody")],
      expired: [t("joinExpiredTitle"), t("joinExpiredBody")],
      exhausted: [t("joinExhaustedTitle"), t("joinExhaustedBody")],
      entries_closed: [t("joinEntriesClosedTitle"), t("joinEntriesClosedBody")],
      invalid: [t("joinInvalidTitle"), t("joinInvalidBody")],
    }[kind];
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-red-defect">{copy[0]}</p>
          <p className="text-sm text-brown-mid">{copy[1]}</p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/${locale}/app`} className="text-brown-mid underline hover:text-green-dark">
              {t("joinHome")}
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

  const lateNote = decision.late ? (
    <p className="text-sm text-green-dark font-medium">{t("joinLateNote")}</p>
  ) : null;

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
            {lateNote}
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
                codes: tErrors.raw("codes") as Record<string, string>,
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
          {lateNote}
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

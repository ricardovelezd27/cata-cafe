import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { GuestJoinForm } from "@/components/join/GuestJoinForm";
import { evaluateJoin, joinScreenFor } from "@/lib/joinRules";
import { GuestIdentityChoice } from "@/components/join/GuestIdentityChoice";
import { JoinSessionForm } from "@/components/join/JoinSessionForm";
import { DeadlineBanner } from "@/components/session/DeadlineBanner";

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
          closesAtZone: true,
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

  // F-guest-4 (S10 WP8): an ANONYMOUS visitor is asked "¿Eres <nombre>?" before
  // acting as that guest, whether they are already in (decision.redirect) or
  // would join now (decision.ok). Everyone else keeps today's behaviour.
  // TODO(kim-validar:E1): simulated answer.
  const showIdentity =
    !!user &&
    !!invite &&
    (decision.kind === "redirect" || decision.kind === "ok") &&
    joinScreenFor(decision.kind, {
      userId: user.id,
      isAnonymous: user.is_anonymous === true,
      isOwner: invite.session.createdBy === user.id,
    }) === "identity";

  if (decision.kind === "redirect" && !showIdentity) redirect(decision.href);

  // F-grupal-asincrona-3 (S8-05): the closing date is visible before committing to join.
  const deadline = invite ? (
    <DeadlineBanner
      closesAt={invite.session.closesAt?.toISOString() ?? null}
      zone={invite.session.closesAtZone}
      locale={locale}
      translations={{
        open: t.raw("deadlineOpen") as string,
        soon: t.raw("deadlineSoon") as string,
        passed: t.raw("deadlinePassed") as string,
        local: t.raw("deadlineLocal") as string,
      }}
    />
  ) : null;

  if (showIdentity && user && invite) {
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { displayName: true },
    });
    const name = profile?.displayName?.trim() || t("identityFallbackName");
    const errorCodes = tErrors.raw("codes") as Record<string, string>;
    const member = decision.kind === "redirect";
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-serif text-green-dark font-semibold">
              {invite.session.name}
            </h1>
          </div>
          {!member && deadline}
          <GuestIdentityChoice
            mode={member ? "member" : "newcomer"}
            continueHref={decision.kind === "redirect" ? decision.href : undefined}
            joinForm={{
              button: t("joinSession"),
              pending: t("joining"),
              errors: { ...errorCodes, session_closed: t("sessionClosed") },
              home: tErrors("home"),
            }}
            userId={user.id}
            name={name}
            token={token}
            locale={locale}
            translations={{
              title: t("identityTitle", { name }),
              lead: t("identityLead", { name }),
              continueLabel: t("identityContinue", { name }),
              notMeLabel: t("identityNotMe", { name }),
              confirmTitle: t("identityConfirmTitle"),
              confirmBody: t("identityConfirmBody", { name }),
              unsyncedTemplate: t.raw("identityUnsynced") as string,
              confirmButton: t("identityConfirmButton"),
              cancel: t("identityCancel"),
              close: t("identityClose"),
            }}
          />
        </div>
      </main>
    );
  }

  // Narrowing only: a redirect without the identity screen already left above.
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
    // S8-07 (F-guest-3): a participant who is not signed in on this device signs
    // in and comes back here; evaluateJoin then sends them to their results.
    const loginHref = user
      ? `/${locale}/auth/login`
      : `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/${token}`)}`;
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
              href={loginHref}
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
          {deadline}
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
                errors: {
                  ...(tErrors.raw("codes") as Record<string, string>),
                  session_closed: t("sessionClosed"),
                  rate_limited: t("guestRateLimited"),
                },
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
        {deadline}
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { loginErrorFromParam } from "@/lib/authErrors";
import { supportMailto } from "@/lib/siteContact";
import { authErrorCopy, emailSentCopy } from "@/components/auth/authCopy";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { localeHref } from "@/components/landing/locale-href";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; email?: string; intent?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, email, intent, error } = await searchParams;
  setRequestLocale(locale);

  // Already signed in (registered, not an anonymous guest) and heading to a
  // safe same-origin path: skip the form. Guests keep seeing it so the
  // guest-claim flow (?intent=claim) still sends them through a real login.
  const target = safeNext(next);
  if (target) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !user.is_anonymous) redirect(target);
  }

  const t = await getTranslations("auth");
  const tl = await getTranslations("landing.footer");

  const errorKey = loginErrorFromParam(error);
  const linkFailed = errorKey === "link_failed";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-5">
        <h1 className="text-3xl text-green-dark font-serif font-semibold">{t("loginTitle")}</h1>
        {/* Guest arriving from the results-page "save your results" banner:
            same login flow, one line of context (see lib/guestClaim.ts). */}
        {intent === "claim" && (
          <p role="status" className="text-sm text-on-surface-variant">
            {t("claimIntro")}
          </p>
        )}
        {linkFailed && (
          <div role="alert" className="rounded-card border border-error/30 bg-error/5 p-3 text-sm">
            <p className="font-semibold">{t("linkFailedTitle")}</p>
            <p>{t("linkFailedBody")}</p>
          </div>
        )}
        <LoginForm
          emailLabel={t("email")}
          sendLabel={t("sendLink")}
          sendingLabel={t("sending")}
          googleLabel={t("signInWithGoogle")}
          inAppLabels={{
            hint: t("inAppBrowserHint"),
            copy: t("inAppCopyLink"),
            copied: t("inAppLinkCopied"),
          }}
          orLabel={t("or")}
          subtitleLabel={t("loginSubtitle")}
          sentLabels={emailSentCopy(t)}
          errors={authErrorCopy(t)}
          supportHref={supportMailto()}
          locale={locale}
          next={next}
          initialEmail={email}
          initialError={linkFailed ? null : errorKey}
          autoFocusEmail={linkFailed}
        />
        {/* F-landing-1: hidden until the owner publishes the final text. */}
        {LEGAL_PAGES_PUBLISHED && (
          <p className="text-xs text-on-surface-variant">
            <Link href={localeHref(locale, "/privacidad")} className="underline underline-offset-2">
              {tl("privacy")}
            </Link>
            {" · "}
            <Link href={localeHref(locale, "/terminos")} className="underline underline-offset-2">
              {tl("terms")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}

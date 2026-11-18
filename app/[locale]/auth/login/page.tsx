import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { loginErrorFromParam } from "@/lib/authErrors";
import { supportMailto } from "@/lib/siteContact";
import { authErrorCopy, emailSentCopy } from "@/components/auth/authCopy";
import { ArrivalCard } from "@/components/arrival/ArrivalCard";
import { ArrivalStage } from "@/components/arrival/ArrivalStage";
import { Notice } from "@/components/ui/Notice";
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

  const errorKey = loginErrorFromParam(error);
  const linkFailed = errorKey === "link_failed";

  return (
    <ArrivalStage locale={locale}>
      <ArrivalCard
        title={t("loginTitle")}
        // Guest arriving from the results-page "save your results" banner:
        // same login flow, one line of context (see lib/guestClaim.ts).
        lead={intent === "claim" ? <p role="status">{t("claimIntro")}</p> : undefined}
      >
        {/* The emailed link did not work: said as a notice (an alert, as before),
            with the way out right under it (the form asks for the address again). */}
        {linkFailed && (
          <div role="alert">
            <Notice tone="warning" live={false} label={t("linkFailedTitle")}>
              {t("linkFailedBody")}
            </Notice>
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
        {/* The legal links (F-landing-1) are the stage's footer now: `ArrivalStage`. */}
      </ArrivalCard>
    </ArrivalStage>
  );
}

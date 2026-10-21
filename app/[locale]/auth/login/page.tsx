import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
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

  const linkFailed = error === "exchange_failed";

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
          sentLabel={t("sent")}
          errorLabel={t("error")}
          rateLimitErrorLabel={t("rateLimitError")}
          googleLabel={t("signInWithGoogle")}
          orLabel={t("or")}
          subtitleLabel={t("loginSubtitle")}
          changeEmailLabel={t("changeEmail")}
          sentHintLabel={t("sentHint")}
          googleErrorLabel={t("googleError")}
          next={next}
          initialEmail={email}
          autoFocusEmail={linkFailed}
        />
      </div>
    </main>
  );
}

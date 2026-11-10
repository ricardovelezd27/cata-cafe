import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getGuestClaimSummary } from "@/lib/guestClaim";
import { safeClaimBack, verifyGuestClaimToken } from "@/lib/guestClaimToken";
import { ButtonLink } from "@/components/ui";
import { ClaimCard } from "@/components/auth/ClaimCard";

// Reads cookies (the freshly signed-in user) — never statically rendered.
export const dynamic = "force-dynamic";

type ClaimError = "invalid" | "expired" | "already";

/**
 * Step 2 of the guest → account flow (see lib/guestClaim.ts): the login
 * callback lands here after the guest signed in with a magic link or Google.
 * This page NEVER merges on GET — it shows what the claim would attach
 * (name + session count) and the merge runs from the confirmation button's
 * server action (POST). Errors render a card instead of redirecting, so a
 * stale link explains itself rather than dropping the user on a results page
 * their account can't open.
 */
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; back?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { token, back, error: errorParam } = await searchParams;
  setRequestLocale(locale);

  const loc = locale === "en" ? "en" : "es";
  const safeBack = safeClaimBack(loc, back);
  const home = `/${loc}/app`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in yet (or still the anonymous guest): the sign-in must
  // complete first — send them through login with this claim as `next`.
  if (!user || user.is_anonymous) {
    const self = `/${loc}/auth/claim?token=${encodeURIComponent(token ?? "")}&back=${encodeURIComponent(safeBack)}`;
    redirect(`/${loc}/auth/login?next=${encodeURIComponent(self)}&intent=claim`);
  }

  const t = await getTranslations("auth.claim");

  const verified = token ? verifyGuestClaimToken(token) : null;
  let error: ClaimError | null =
    errorParam === "invalid" || errorParam === "expired" || errorParam === "already" ? errorParam : null;
  let summary: Awaited<ReturnType<typeof getGuestClaimSummary>> = null;
  if (!error) {
    if (!verified) error = "invalid";
    else if (verified.expired) error = "expired";
    else {
      summary = await getGuestClaimSummary(verified.anonymousUserId);
      // Anonymous profile gone = already claimed (token replay) or never a guest.
      if (!summary) error = "already";
    }
  }

  const card = "w-full max-w-md space-y-4 rounded-card border border-outline-variant bg-surface-container-lowest p-8";

  if (error || !summary || !token) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className={card}>
          <h1 className="font-display text-2xl text-primary-container">{t("errorTitle")}</h1>
          <p className="text-sm text-on-surface-variant">
            {error === "expired" ? t("errorExpired") : error === "already" ? t("errorAlready") : t("errorInvalid")}
          </p>
          <ButtonLink href={home} size="sm">
            {t("continue")}
          </ButtonLink>
        </div>
      </main>
    );
  }

  const claimUrl = `/${loc}/auth/claim?token=${encodeURIComponent(token)}&back=${encodeURIComponent(safeBack)}`;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className={card}>
        <ClaimCard
          locale={loc}
          token={token}
          back={safeBack}
          home={home}
          claimUrl={claimUrl}
          anonId={verified!.anonymousUserId}
          accountId={user.id}
          strings={{
            title: t("title"),
            body: t("body", {
              name: summary.displayName,
              sessions: summary.sessionsParticipated + summary.sessionsCreated,
              evaluations: summary.evaluations,
              email: user.email ?? "",
            }),
            note: t("note"),
            confirm: t("confirm"),
            confirming: t("confirming"),
            useOther: t("useOther"),
            skip: t("skip"),
            skipTitle: t("skipTitle"),
            skipBody: t("skipBody"),
            skipConfirm: t("skipConfirm"),
            skipBack: t("skipBack"),
            retryTitle: t("retryTitle"),
            retryBody: t("retryBody"),
            retry: t("retry"),
            offline: t("offline"),
          }}
        />
      </div>
    </main>
  );
}

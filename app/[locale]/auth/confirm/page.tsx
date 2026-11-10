import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConfirmClient } from "./ConfirmClient";
import { loginHref } from "@/lib/authRedirect";
import { safeNext } from "@/lib/safeNext";

// Reads the token from the URL on every request; nothing here is cacheable.
export const dynamic = "force-dynamic";

const TYPES = ["email", "magiclink", "signup", "email_change", "recovery"];

/**
 * Landing page of every email sign-in link (S8-06, F-entrar-1, F-landing-3).
 * Rendering this page NEVER touches the token: it is consumed only by the
 * button's server action (a POST). A mail scanner or link previewer that
 * GETs the URL therefore leaves the link, and the 6-digit code, valid.
 */
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { locale } = await params;
  const { token_hash: tokenHash, type, next } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth.confirm");

  const loc = locale === "en" ? "en" : "es";
  const valid = !!tokenHash && !!type && TYPES.includes(type);
  const dest = safeNext(next, { fallback: `/${loc}/app` });

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-5 rounded-card border border-outline-variant bg-surface-container-lowest p-8">
        <ConfirmClient
          tokenHash={valid ? tokenHash : undefined}
          type={valid ? type : undefined}
          next={dest}
          locale={loc}
          newLinkHref={loginHref(loc, dest)}
          labels={{
            title: t("title"),
            body: t("body"),
            button: t("button"),
            working: t("working"),
            failedTitle: t("failedTitle"),
            failedBody: t("failedBody"),
            newLink: t("newLink"),
          }}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref, loginHref } from "./locale-href";

export default async function LandingHeader({ locale }: { locale: string }) {
  const t = await getTranslations("landing.header");
  const tl = await getTranslations("locale");

  return (
    <header className="sticky top-0 z-50 border-b border-surface/12 bg-primary/85 text-surface backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href={localeHref(locale, "/")}
          className="font-serif text-xl tracking-tight text-surface"
        >
          {t("wordmark")}
          <span aria-hidden="true" className="text-secondary-container">
            .ai
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          {/* Plain anchors: a locale switch is a full document swap
              (metadata, <html lang>), not a client-side transition. */}
          <div className="flex items-center gap-1 text-xs font-medium">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- locale switch must be a full document load (metadata + <html lang>) */}
            <a
              href="/"
              hrefLang="es"
              aria-label={tl("es")}
              className={
                locale === "es"
                  ? "rounded-full bg-surface px-2.5 py-1 text-primary"
                  : "rounded-full px-2.5 py-1 text-surface/70 hover:text-surface"
              }
            >
              ES
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- locale switch must be a full document load (metadata + <html lang>) */}
            <a
              href="/en"
              hrefLang="en"
              aria-label={tl("en")}
              className={
                locale === "en"
                  ? "rounded-full bg-surface px-2.5 py-1 text-primary"
                  : "rounded-full px-2.5 py-1 text-surface/70 hover:text-surface"
              }
            >
              EN
            </a>
          </div>
          <Link
            href={localeHref(locale, "/auth/login")}
            className="hidden text-sm font-medium text-surface/80 hover:text-surface sm:block"
          >
            {t("signIn")}
          </Link>
          <Link
            href={loginHref(locale)}
            className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed"
          >
            {t("cta")}
          </Link>
        </nav>
      </div>
    </header>
  );
}

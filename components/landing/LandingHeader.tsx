import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref, loginHref } from "./locale-href";

export default async function LandingHeader({ locale }: { locale: string }) {
  const t = await getTranslations("landing.header");
  const tl = await getTranslations("locale");

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href={localeHref(locale, "/")}
          className="font-serif text-xl tracking-tight text-primary"
        >
          {t("wordmark")}
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 text-xs font-medium">
            <Link
              href="/"
              hrefLang="es"
              aria-label={tl("es")}
              className={
                locale === "es"
                  ? "rounded-full bg-primary-container px-2.5 py-1 text-white"
                  : "rounded-full px-2.5 py-1 text-on-surface-variant hover:text-primary"
              }
            >
              ES
            </Link>
            <Link
              href="/en"
              hrefLang="en"
              aria-label={tl("en")}
              className={
                locale === "en"
                  ? "rounded-full bg-primary-container px-2.5 py-1 text-white"
                  : "rounded-full px-2.5 py-1 text-on-surface-variant hover:text-primary"
              }
            >
              EN
            </Link>
          </div>
          <Link
            href={localeHref(locale, "/auth/login")}
            className="hidden text-sm font-medium text-on-surface-variant hover:text-primary sm:block"
          >
            {t("signIn")}
          </Link>
          <Link
            href={loginHref(locale)}
            className="rounded-full bg-primary-container px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary"
          >
            {t("cta")}
          </Link>
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref, loginHref } from "./locale-href";
import LocaleSwitch from "./LocaleSwitch";

export default async function LandingHeader({ locale }: { locale: string }) {
  const t = await getTranslations("landing.header");
  const tl = await getTranslations("locale");

  return (
    <header className="sticky top-0 z-50 border-b border-surface/12 bg-stage/85 text-surface backdrop-blur-md">
      {/* Pixel heights on purpose: the root font size is 14px, so rem-based
          h-11 would paint 38.5px, under the 44px touch target. */}
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href={localeHref(locale, "/")}
          className="inline-flex min-h-[44px] items-center font-serif text-xl tracking-tight text-surface"
        >
          {t("wordmark")}
          <span aria-hidden="true" className="text-secondary-container">
            .ai
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          {/* Switching language keeps the reader's place (LocaleSwitch). */}
          <LocaleSwitch locale={locale} labels={{ es: tl("es"), en: tl("en") }} />
          {/* The header's one action. The offer itself lives in the hero card. */}
          <Link
            href={loginHref(locale)}
            className="inline-flex min-h-[44px] items-center rounded-full bg-surface px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed"
          >
            <span className="sm:hidden">{t("signInShort")}</span>
            <span className="hidden sm:inline">{t("signIn")}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

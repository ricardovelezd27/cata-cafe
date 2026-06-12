import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref } from "./locale-href";

export default async function LandingFooter({ locale }: { locale: string }) {
  const t = await getTranslations("landing.footer");
  const th = await getTranslations("landing.header");
  const tl = await getTranslations("locale");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-primary-container/40 bg-primary text-surface/75">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-serif text-2xl text-surface">{th("wordmark")}</p>
            <p className="mt-2 max-w-xs text-sm">{t("madeFor")}</p>
          </div>

          <div className="flex flex-col gap-6 text-sm sm:flex-row sm:gap-12">
            <div className="space-y-2.5">
              <Link
                href={localeHref(locale, "/auth/login")}
                className="block hover:text-surface"
              >
                {t("signIn")}
              </Link>
              <a href="mailto:hola@cata.cafe" className="block hover:text-surface">
                {t("contact")}
              </a>
            </div>
            <div className="space-y-2.5">
              <a href="mailto:hola@cata.cafe?subject=Privacidad" className="block hover:text-surface">
                {t("privacy")}
              </a>
              <a href="mailto:hola@cata.cafe?subject=Terminos" className="block hover:text-surface">
                {t("terms")}
              </a>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-surface/75">
                {t("language")}
              </p>
              <div className="mt-2.5 space-y-2.5">
                <Link
                  href="/"
                  hrefLang="es"
                  className={locale === "es" ? "block text-surface" : "block hover:text-surface"}
                >
                  {tl("es")}
                </Link>
                <Link
                  href="/en"
                  hrefLang="en"
                  className={locale === "en" ? "block text-surface" : "block hover:text-surface"}
                >
                  {tl("en")}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-surface/15 pt-6 text-xs text-surface/75">
          {t("copyright", { year: String(year) })}
        </p>
      </div>
    </footer>
  );
}

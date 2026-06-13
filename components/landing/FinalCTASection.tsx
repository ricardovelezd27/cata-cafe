import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginHref } from "./locale-href";

export default async function FinalCTASection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.finalCta");

  // No data-reveal here: the last conversion ask on the page must never
  // depend on a scroll-triggered animation firing.
  return (
    <section className="bg-primary text-surface">
      <div className="mx-auto max-w-4xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <h2 className="font-serif text-4xl leading-[1.1] text-surface sm:text-6xl lg:text-7xl">
          {t.rich("title", {
            em: (chunks) => (
              <em className="display-italic text-primary-fixed-dim">{chunks}</em>
            ),
          })}
        </h2>
        <div className="mt-10">
          <Link
            href={loginHref(locale)}
            className="inline-block rounded-full bg-surface px-8 py-4 text-base font-semibold text-primary shadow-lg transition-colors hover:bg-primary-fixed"
          >
            {t("cta")}
          </Link>
        </div>
        <p className="mt-4 text-sm text-surface/80">{t("note")}</p>
      </div>
    </section>
  );
}

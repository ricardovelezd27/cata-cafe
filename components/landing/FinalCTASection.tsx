import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginHref } from "./locale-href";

export default async function FinalCTASection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.finalCta");

  // No data-reveal here: the last conversion ask on the page must never
  // depend on a scroll-triggered animation firing.
  return (
    <section
      data-fold="5"
      className="relative isolate z-10 overflow-hidden bg-transparent text-surface"
    >
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <Image
          src="/landing/real/05-slurp.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-primary/70" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-fixed">
          {t("kicker")}
        </p>
        <h2 className="pt-4 font-serif text-4xl leading-[1.1] text-surface sm:text-6xl lg:text-7xl">
          {t.rich("title", {
            em: (chunks) => (
              <em className="display-italic text-primary-fixed-dim">{chunks}</em>
            ),
          })}
        </h2>
        <p className="mt-5 text-xl text-surface/80">{t("sub")}</p>
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

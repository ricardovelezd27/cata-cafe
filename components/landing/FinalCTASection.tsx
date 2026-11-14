import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginHref } from "./locale-href";

export default async function FinalCTASection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.finalCta");

  // The page closes on the constellation itself: no photo, no card. The net
  // formation (journey/formations.ts, fold 5) frames this block; a soft shade
  // behind the text keeps the line readable where dust drifts through.
  // No data-reveal here: the last conversion ask on the page must never
  // depend on a scroll-triggered animation firing.
  return (
    <section
      data-fold="5"
      className="relative z-10 overflow-hidden bg-transparent text-surface"
    >
      <span
        aria-hidden="true"
        className="stage-light stage-light-shade left-1/2 top-1/2 h-[130%] w-[min(1100px,140%)] -translate-x-1/2 -translate-y-1/2"
      />

      <div className="relative mx-auto max-w-4xl px-5 py-28 text-center sm:px-8 sm:py-40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-fixed">
          {t("kicker")}
        </p>
        <h2 className="pt-4 font-serif text-4xl leading-[1.1] text-surface sm:text-6xl lg:text-7xl">
          {t.rich("title", {
            em: (chunks) => (
              <em className="display-italic text-secondary-container">{chunks}</em>
            ),
          })}
        </h2>
        <p className="mt-5 text-xl text-surface/80">{t("sub")}</p>
        <div className="mt-10">
          <Link
            href={loginHref(locale)}
            className="inline-flex min-h-[52px] items-center rounded-full bg-surface px-8 text-base font-semibold text-primary shadow-stage-card transition-colors hover:bg-primary-fixed"
          >
            {t("cta")}
          </Link>
        </div>
        <p className="mt-4 text-sm text-surface/80">{t("note")}</p>
      </div>
    </section>
  );
}

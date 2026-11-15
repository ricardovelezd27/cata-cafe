import { getTranslations } from "next-intl/server";
import NewsletterForm from "./NewsletterForm";
import { localeHref } from "./locale-href";
import { LEGAL_ENTITY } from "@/lib/legal/company";
import { SUPPORT_EMAIL } from "@/lib/siteContact";

export default async function FinalCTASection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.finalCta");
  const tn = await getTranslations("landing.newsletter");
  const tw = await getTranslations("landing.waitlist");

  // The page closes on the constellation itself: no photo, no card. The net
  // formation (journey/formations.ts, fold 5) frames this block; a soft shade
  // behind the text keeps the line readable where dust drifts through.
  // No data-reveal here: the last block of the page must never depend on a
  // scroll-triggered animation firing.
  //
  // The page's one primary ask (the founding reservation) is the card just
  // above. This block ends the page with its closing line and, for the
  // person who is not ready, a second and quieter ask: the newsletter.
  return (
    <section
      data-fold="5"
      className="relative z-10 overflow-hidden bg-transparent text-surface"
    >
      <span
        aria-hidden="true"
        className="stage-light stage-light-shade left-1/2 top-1/2 h-[130%] w-[min(1100px,140%)] -translate-x-1/2 -translate-y-1/2"
      />

      <div className="stage-section relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-fixed">
          {t("kicker")}
        </p>
        <h2 className="pt-4 font-serif text-4xl leading-[1.1] text-surface sm:text-6xl">
          {t.rich("title", {
            em: (chunks) => (
              <em className="display-italic text-secondary-container">{chunks}</em>
            ),
          })}
        </h2>
        <p className="mt-4 text-xl text-surface/80">{t("sub")}</p>

        <div className="mx-auto mt-10 max-w-xl border-t border-surface/15 pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary-container">
            {tn("eyebrow")}
          </p>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-surface/85">{tn("lead")}</p>
          <div className="mt-5">
            <NewsletterForm
              locale={locale}
              labels={{
                label: tn("label"),
                emailPlaceholder: tw("emailPlaceholder"),
                button: tn("button"),
                submitting: tw("submitting"),
                success: tn("success"),
                invalid: tw("invalid"),
                error: tn("error"),
                rateLimit: tw("rateLimit"),
              }}
              notice={{
                text: tn("notice", { company: LEGAL_ENTITY.name, email: SUPPORT_EMAIL }),
                linkLabel: tw("noticeLink"),
                href: localeHref(locale, "/privacidad"),
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

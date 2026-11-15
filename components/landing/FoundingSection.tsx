import { getTranslations } from "next-intl/server";
import SectionHeading from "./SectionHeading";
import { FOUNDING_ID } from "./anchors";
import WaitlistForm from "./WaitlistForm";
import { emailSentCopy } from "@/components/auth/authCopy";
import { supportMailto } from "@/lib/siteContact";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { localeHref } from "./locale-href";
import { FOUNDING_SEATS } from "@/lib/landing/founding";

export default async function FoundingSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.founding");
  const th = await getTranslations("landing.hero");
  const tw = await getTranslations("landing.waitlist");
  const ta = await getTranslations("auth");

  const waitlistLabels = {
    label: tw("label"),
    emailPlaceholder: tw("emailPlaceholder"),
    button: t("cta"),
    submitting: tw("submitting"),
    success: tw("success"),
    sentHint: tw("sentHint"),
    invalid: tw("invalid"),
    error: tw("error"),
    rateLimit: tw("rateLimit"),
    sent: emailSentCopy(ta),
    supportHref: supportMailto(),
  };

  // F-landing-1: shown only once the owner has published the final legal text.
  const notice = LEGAL_PAGES_PUBLISHED
    ? { text: tw("notice"), linkLabel: tw("noticeLink"), href: localeHref(locale, "/privacidad") }
    : undefined;

  return (
    <section data-fold="4" className="cv-auto relative z-10 bg-transparent">
      <div className="stage-section mx-auto max-w-6xl px-5 sm:px-8">
        <div className="stage-section-head">
          <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
        </div>

        {/* The page's ONE reservation form. The hero's button comes here
            (ScrollToLink); scroll-mt keeps it clear of the header for a plain
            #link too. The id sits on a wrapper, not on the data-reveal card. */}
        <div id={FOUNDING_ID} className="mx-auto max-w-xl scroll-mt-[76px]">
        <div
          data-reveal
          className="surface-glass flex flex-col rounded-lg p-7 sm:p-9"
        >
          {/* No badge here: the section's own name, just above, says it. */}
          <p className="font-serif tabular-nums text-3xl leading-tight text-surface sm:text-4xl">
            {t("offer", { count: FOUNDING_SEATS })}
          </p>
          {/* The offer and the form, nothing else: what is included is the
              section above ("Qué incluye"), said once. */}
          <div className="mt-6">
            <WaitlistForm locale={locale} labels={waitlistLabels} source="founding" notice={notice} />
          </div>
          <p className="mt-3 text-sm text-surface/80">{th("ctaNote")}</p>
        </div>
        </div>
      </div>
    </section>
  );
}

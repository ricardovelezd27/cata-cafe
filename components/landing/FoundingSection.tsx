import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import SectionHeading from "./SectionHeading";
import WaitlistForm from "./WaitlistForm";
import { emailSentCopy } from "@/components/auth/authCopy";
import { supportMailto } from "@/lib/siteContact";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { localeHref } from "./locale-href";
import { FOUNDING_SEATS } from "@/lib/landing/founding";

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-surface/80">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-fixed" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function FoundingSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.founding");
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
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />

        <div
          data-reveal
          className="surface-glass mx-auto mt-12 flex max-w-xl flex-col rounded-lg p-7 sm:p-9"
        >
          <span className="w-fit rounded-full bg-secondary-container px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
            {t("badge")}
          </span>
          <p className="mt-8 font-serif tabular-nums text-4xl text-surface">
            {t("offer", { count: FOUNDING_SEATS })}
          </p>
          <FeatureList
            items={[t("feature1"), t("feature2"), t("feature3"), t("feature4")]}
          />
          <div className="mt-7">
            <WaitlistForm locale={locale} labels={waitlistLabels} source="founding" notice={notice} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-surface/70">
            {t("note")}
          </p>
        </div>
      </div>
    </section>
  );
}

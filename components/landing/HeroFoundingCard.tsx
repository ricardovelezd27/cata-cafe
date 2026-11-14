import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import WaitlistForm from "./WaitlistForm";
import { emailSentCopy } from "@/components/auth/authCopy";
import { supportMailto } from "@/lib/siteContact";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { localeHref } from "./locale-href";
import { FOUNDING_SEATS } from "@/lib/landing/founding";

// The hero's "instrument": the one solid cream card on the dark stage, now the
// founding-cohort reservation instead of the calibration demo.
export default async function HeroFoundingCard({ locale }: { locale: string }) {
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

  // Three layers: a glass plate set back and offset (the constellation shows
  // through it), the solid cream card, and the terracotta tab riding its top
  // edge. Order inside the card is the same at every width: the number, then
  // the form (so the button is reachable in the first phone screen), then
  // what is included.
  return (
    <div className="relative mr-3 sm:mr-4">
      <div
        aria-hidden="true"
        className="surface-glass absolute inset-0 translate-x-3 translate-y-3 rounded-lg sm:translate-x-4 sm:translate-y-4"
      />
      <div className="surface-solid relative rounded-lg px-6 pb-6 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
        <span className="absolute left-6 top-0 -translate-y-1/2 rounded-full bg-secondary-container px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary shadow-card-lg sm:left-8">
          {t("badge")}
        </span>

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
          {t("heroLead")}
        </p>
        {/* No count-up: an offer number must never show a wrong value. */}
        <p className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 sm:gap-x-4">
          <span className="font-serif tabular-nums text-hero-numeral leading-[0.9] tracking-[-0.04em] text-primary">
            {FOUNDING_SEATS}
          </span>
          <span className="max-w-[9ch] pb-2 font-serif text-xl leading-[1.05] text-on-surface sm:pb-4 sm:text-2xl">
            {t("heroUnit")}
          </span>
        </p>

        <div className="mt-6">
          <WaitlistForm locale={locale} labels={waitlistLabels} variant="onLight" source="hero" notice={notice} />
        </div>
        <p className="mt-3 text-sm font-medium text-on-surface">{th("ctaNote")}</p>

        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-outline-variant/50 pt-5 sm:grid-cols-2">
          {[t("feature1"), t("feature2"), t("feature3"), t("feature4")].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm leading-snug text-on-surface-variant">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-container" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">{t("note")}</p>
      </div>
    </div>
  );
}

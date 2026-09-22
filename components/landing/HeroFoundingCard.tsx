import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import WaitlistForm from "./WaitlistForm";

// The hero's "instrument": the one solid cream card on the dark stage, now the
// founding-cohort reservation instead of the calibration demo.
export default async function HeroFoundingCard({ locale }: { locale: string }) {
  const t = await getTranslations("landing.founding");
  const tw = await getTranslations("landing.waitlist");

  const waitlistLabels = {
    label: tw("label"),
    emailPlaceholder: tw("emailPlaceholder"),
    button: t("cta"),
    submitting: tw("submitting"),
    success: tw("success"),
    invalid: tw("invalid"),
    error: tw("error"),
  };

  return (
    <div className="rounded-[2rem] border border-outline-variant/60 bg-surface p-6 text-on-surface shadow-[0_24px_60px_-24px_rgba(21,53,38,0.45)] sm:p-8">
      <span className="inline-block rounded-full bg-secondary-container px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
        {t("badge")}
      </span>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
        {t("heroLead")}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span
          data-counter
          className="font-serif tabular-nums leading-none text-[72px] text-primary sm:text-[88px]"
        >
          {t("heroCount")}
        </span>
        <span className="font-serif text-xl text-on-surface sm:text-2xl">{t("heroUnit")}</span>
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-outline-variant/50 pt-5 sm:grid-cols-2">
        {[t("feature1"), t("feature2"), t("feature3"), t("feature4")].map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm leading-snug text-on-surface-variant">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-container" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <WaitlistForm locale={locale} labels={waitlistLabels} variant="onLight" />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">{t("note")}</p>
    </div>
  );
}

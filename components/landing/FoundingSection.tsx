import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import WaitlistForm from "./WaitlistForm";

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-on-surface-variant">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-container" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function FoundingSection({ locale }: { locale: string }) {
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
    <section className="cv-auto bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-reveal className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-on-surface sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div
          data-reveal
          className="mx-auto mt-12 flex max-w-xl flex-col rounded-[2rem] border-2 border-primary-container bg-surface-container-lowest p-7 sm:p-9"
        >
          <span className="w-fit rounded-full bg-secondary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-on-secondary-container">
            {t("badge")}
          </span>
          <p className="mt-5 font-serif tabular-nums text-4xl text-primary">
            {t("offer")}
          </p>
          <FeatureList
            items={[t("feature1"), t("feature2"), t("feature3"), t("feature4")]}
          />
          <div className="mt-7">
            <WaitlistForm locale={locale} labels={waitlistLabels} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-on-surface-variant/80">
            {t("note")}
          </p>
        </div>
      </div>
    </section>
  );
}

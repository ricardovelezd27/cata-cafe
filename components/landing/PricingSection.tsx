import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import WaitlistForm from "./WaitlistForm";
import { loginHref } from "./locale-href";

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

export default async function PricingSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.pricing");
  const tw = await getTranslations("landing.waitlist");

  const waitlistLabels = {
    label: tw("label"),
    emailPlaceholder: tw("emailPlaceholder"),
    button: tw("button"),
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

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Free — the only actionable tier today */}
          <div
            data-reveal
            className="flex flex-col rounded-[2rem] border-2 border-primary-container bg-surface-container-lowest p-7"
          >
            <h3 className="font-serif text-2xl text-on-surface">{t("freeName")}</h3>
            <p className="mt-2 font-serif tabular-nums text-4xl text-primary">
              {t("freePrice")}
            </p>
            <FeatureList
              items={[t("freeFeature1"), t("freeFeature2"), t("freeFeature3")]}
            />
            <div className="mt-auto pt-7">
              <Link
                href={loginHref(locale)}
                className="block rounded-full bg-primary-container px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-primary"
              >
                {t("freeCta")}
              </Link>
            </div>
          </div>

          {/* Pro — waitlist */}
          <div
            data-reveal
            className="flex flex-col rounded-[2rem] border border-outline-variant/60 bg-surface-container-low p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-serif text-2xl text-on-surface">{t("proName")}</h3>
              <span className="rounded-full bg-secondary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-on-secondary-container">
                {t("proBadge")}
              </span>
            </div>
            <p className="mt-2 text-sm text-on-surface-variant">{t("proPer")}</p>
            <FeatureList
              items={[t("proFeature1"), t("proFeature2"), t("proFeature3")]}
            />
            <div className="mt-auto pt-7">
              <WaitlistForm locale={locale} labels={waitlistLabels} />
            </div>
          </div>

          {/* Teams / Competitions */}
          <div
            data-reveal
            className="flex flex-col rounded-[2rem] border border-outline-variant/60 bg-surface-container-low p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-serif text-2xl leading-tight text-on-surface">
                {t("teamsName")}
              </h3>
              <span className="shrink-0 rounded-full bg-surface-container-high px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                {t("teamsBadge")}
              </span>
            </div>
            <FeatureList
              items={[t("teamsFeature1"), t("teamsFeature2"), t("teamsFeature3")]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

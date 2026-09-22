import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import MockFrameCVA from "./mockframes/MockFrameCVA";
import MockFrameFlavorPills from "./mockframes/MockFrameFlavorPills";
import MockFrameScoreCard from "./mockframes/MockFrameScoreCard";
import PhotoSlot from "./PhotoSlot";

/**
 * One "Percibe / Nombra / Mide" step of the how-it-works narrative, replacing
 * the old 3-column HowItWorksSection. Each step is its own fold so the
 * particle canvas (mounted by the lead) can anchor its scroll narration to
 * `data-fold`. Step 1 carries the shared section intro above its grid.
 */
export default async function StepSection({
  locale,
  step,
}: {
  locale: string;
  step: 1 | 2 | 3;
}) {
  const t = await getTranslations("landing.how");

  const copy = (
    <div
      data-reveal
      className={step === 2 ? "lg:order-2" : undefined}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-fixed">
        {t(`step${step}Kicker`)}
      </p>
      <p className="mt-4 font-serif tabular-nums text-lg text-secondary-container">
        0{step}
      </p>
      <h3 className="mt-1 font-serif text-4xl leading-tight text-surface sm:text-5xl">
        {t(`step${step}Title`)}
      </h3>
      <p className="mt-4 max-w-prose text-lg leading-relaxed text-surface/80">
        {t(`step${step}Desc`)}
      </p>
    </div>
  );

  let visual: ReactNode;
  if (step === 1) {
    visual = (
      <div data-reveal className="relative mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none lg:pb-24 lg:pl-16">
        <PhotoSlot
          src="/landing/real/02-mesa-cata-app.jpg"
          alt={t("photo2Alt")}
          caption={t("step1Caption")}
          aspect="4/3"
          position="top"
          sizes="(min-width: 1024px) 40vw, 90vw"
          className="w-full"
        />
        <div className="relative z-10 mt-6 w-full max-w-[300px] lg:absolute lg:bottom-0 lg:left-0 lg:mt-0">
          <MockFrameCVA ariaLabel={t("frame1Aria")} translucent />
        </div>
      </div>
    );
  } else if (step === 2) {
    visual = (
      <div
        data-reveal
        className="relative mx-auto w-full max-w-sm lg:order-1 lg:mx-0 lg:max-w-none lg:pb-24 lg:pr-16"
      >
        <PhotoSlot
          src="/landing/real/04-taller-grupo.jpg"
          alt={t("photo4Alt")}
          caption={t("step2Caption")}
          aspect="3/2"
          sizes="(min-width: 1024px) 40vw, 90vw"
          className="w-full"
        />
        <div className="relative z-10 mt-6 w-full max-w-[300px] lg:absolute lg:bottom-0 lg:right-0 lg:mt-0">
          <MockFrameFlavorPills ariaLabel={t("frame2Aria")} translucent />
        </div>
      </div>
    );
  } else {
    visual = (
      <div data-reveal className="mx-auto w-full max-w-[300px]">
        <MockFrameScoreCard ariaLabel={t("frame3Aria")} locale={locale} />
      </div>
    );
  }

  return (
    <section data-fold={step} className="relative z-10 bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        {step === 1 ? (
          <div data-reveal className="mb-10 text-center sm:mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary-container">
              {t("eyebrow")}
            </p>
            <h2 className="mt-4 font-serif text-3xl leading-tight text-surface sm:text-4xl">
              {t("title")}
            </h2>
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {copy}
          {visual}
        </div>
      </div>
    </section>
  );
}

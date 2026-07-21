import Image from "next/image";
import { getTranslations } from "next-intl/server";
import MockFrameCVA from "./mockframes/MockFrameCVA";
import MockFrameFlavorPills from "./mockframes/MockFrameFlavorPills";
import MockFrameScoreCard from "./mockframes/MockFrameScoreCard";

export default async function HowItWorksSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.how");

  const steps = [
    {
      n: "01",
      title: t("step1Title"),
      desc: t("step1Desc"),
      frame: <MockFrameCVA ariaLabel={t("frame1Aria")} />,
    },
    {
      n: "02",
      title: t("step2Title"),
      desc: t("step2Desc"),
      frame: <MockFrameFlavorPills ariaLabel={t("frame2Aria")} />,
    },
    {
      n: "03",
      title: t("step3Title"),
      desc: t("step3Desc"),
      frame: <MockFrameScoreCard ariaLabel={t("frame3Aria")} locale={locale} />,
    },
  ];

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
          aria-hidden="true"
          className="mt-10 overflow-hidden rounded-[2rem] shadow-md sm:mt-12"
        >
          <Image
            src="/landing/trust-detail.jpg"
            alt=""
            width={1600}
            height={1200}
            sizes="100vw"
            className="h-48 w-full object-cover sm:h-64"
          />
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-10 sm:mt-16 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <li key={step.n} data-reveal className="flex flex-col">
              <div className="mx-auto w-full max-w-[300px]">{step.frame}</div>
              <div className="mt-6 text-center">
                <p className="font-serif tabular-nums text-sm text-secondary">
                  {step.n}
                </p>
                <h3 className="mt-1 font-serif text-2xl text-on-surface">
                  {step.title}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-on-surface-variant">
                  {step.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

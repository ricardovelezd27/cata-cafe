import { getTranslations } from "next-intl/server";
import { CheckCircle2, Hammer, Telescope } from "lucide-react";

export default async function RoadmapSection() {
  const t = await getTranslations("landing.roadmap");

  const stages = [
    {
      icon: CheckCircle2,
      chip: t("chipToday"),
      chipClass: "bg-primary-container text-white",
      title: t("stage1Title"),
      desc: t("stage1Desc"),
      dotClass: "bg-primary-container ring-primary-fixed",
    },
    {
      icon: Hammer,
      chip: t("chipBuilding"),
      chipClass: "bg-secondary-fixed text-on-secondary-container",
      title: t("stage2Title"),
      desc: t("stage2Desc"),
      dotClass: "bg-secondary-fixed-dim ring-secondary-fixed",
    },
    {
      icon: Telescope,
      chip: t("chipSoon"),
      chipClass: "bg-surface-container-high text-on-surface-variant",
      title: t("stage3Title"),
      desc: t("stage3Desc"),
      dotClass: "bg-outline-variant ring-surface-container-high",
    },
  ];

  return (
    <section className="cv-auto bg-surface-container-low">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div data-reveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-on-surface sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div className="relative mt-14">
          {/* Connecting line (horizontal on desktop) */}
          <div
            data-roadmap-line
            aria-hidden="true"
            className="absolute left-0 top-2.5 hidden h-px w-full bg-outline-variant md:block"
          />
          <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {stages.map((stage) => (
              <li key={stage.title} data-reveal className="relative">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`relative z-10 h-5 w-5 rounded-full ring-4 ${stage.dotClass}`}
                  />
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${stage.chipClass}`}
                  >
                    <stage.icon className="h-3.5 w-3.5" />
                    {stage.chip}
                  </span>
                </div>
                <h3 className="mt-4 font-serif text-xl leading-snug text-on-surface">
                  {stage.title}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-on-surface-variant">
                  {stage.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

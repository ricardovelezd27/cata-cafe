import { getTranslations } from "next-intl/server";
import { Flame, Ship, Sprout, GraduationCap } from "lucide-react";

export default async function AudienceSection() {
  const t = await getTranslations("landing.audience");

  const cards = [
    { icon: Flame, title: t("card1Title"), desc: t("card1Desc") },
    { icon: Ship, title: t("card2Title"), desc: t("card2Desc") },
    { icon: Sprout, title: t("card3Title"), desc: t("card3Desc") },
    { icon: GraduationCap, title: t("card4Title"), desc: t("card4Desc") },
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

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.title}
              data-reveal
              className="rounded-[1.75rem] border border-outline-variant/60 bg-surface-container-low p-6 transition-colors hover:border-primary-container/50 hover:bg-surface-container"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed/50">
                <card.icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="mt-4 font-serif text-xl text-on-surface">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

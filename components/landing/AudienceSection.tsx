import { getTranslations } from "next-intl/server";
import PhotoSlot from "./PhotoSlot";

export default async function AudienceSection() {
  const t = await getTranslations("landing.audience");

  const rows = [
    { n: "01", title: t("card1Title"), desc: t("card1Desc") },
    { n: "02", title: t("card2Title"), desc: t("card2Desc") },
    { n: "03", title: t("card3Title"), desc: t("card3Desc") },
    { n: "04", title: t("card4Title"), desc: t("card4Desc") },
    { n: "05", title: t("card5Title"), desc: t("card5Desc") },
  ];

  return (
    <section className="cv-auto relative z-10 bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div data-reveal className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary-container">
              {t("eyebrow")}
            </p>
            <h2 className="mt-4 font-serif text-3xl leading-tight text-surface sm:text-4xl">
              {t("title")}
            </h2>
          </div>

          <div data-reveal>
            <div className="grid grid-cols-2 gap-4">
              <PhotoSlot
                src="/landing/real/01-mesa-socios.jpg"
                alt={t("photo1Alt")}
                aspect="4/3"
                sizes="(min-width: 1024px) 22vw, 50vw"
              />
              <PhotoSlot
                src="/landing/real/03-sala-socios.jpg"
                alt={t("photo3Alt")}
                aspect="4/3"
                sizes="(min-width: 1024px) 22vw, 50vw"
              />
            </div>
            <p className="mt-2 text-xs text-surface/60">
              {t("galleryCaption")}
            </p>
          </div>
        </div>

        <ol className="mt-10 border-y border-surface/12 divide-y divide-surface/12">
          {rows.map((row, index) => {
            const isFeatured = index === 0;
            return (
              <li
                key={row.n}
                data-reveal
                className={
                  isFeatured
                    ? "stage-card grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 rounded-2xl border-l-4 border-secondary-container py-8 pl-4 sm:grid-cols-[3.5rem_minmax(12rem,16rem)_1fr] sm:gap-x-10 sm:py-10 sm:pl-6"
                    : "grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 py-7 sm:grid-cols-[3.5rem_minmax(12rem,16rem)_1fr] sm:gap-x-10 sm:py-8"
                }
              >
                <span className="font-serif tabular-nums text-sm text-secondary-container">
                  {row.n}
                </span>
                <h3
                  className={
                    isFeatured
                      ? "font-serif text-3xl text-surface sm:text-4xl"
                      : "font-serif text-2xl text-surface sm:text-3xl"
                  }
                >
                  {row.title}
                </h3>
                <p className="col-start-2 max-w-xl text-sm leading-relaxed text-surface/80 sm:col-start-3 sm:self-center sm:text-base">
                  {row.desc}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

import Image from "next/image";
import { getTranslations } from "next-intl/server";

export default async function AudienceSection() {
  const t = await getTranslations("landing.audience");

  const rows = [
    { n: "01", title: t("card1Title"), desc: t("card1Desc") },
    { n: "02", title: t("card2Title"), desc: t("card2Desc") },
    { n: "03", title: t("card3Title"), desc: t("card3Desc") },
    { n: "04", title: t("card4Title"), desc: t("card4Desc") },
  ];

  return (
    <section className="cv-auto bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div data-reveal className="max-w-2xl">
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
            className="overflow-hidden rounded-[2rem] shadow-lg"
          >
            <Image
              src="/landing/audience-lab.jpg"
              alt=""
              width={1920}
              height={1280}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <ol className="mt-10 border-y border-outline-variant/50 divide-y divide-outline-variant/50">
          {rows.map((row, index) => {
            const isFeatured = index === 0;
            return (
              <li
                key={row.n}
                data-reveal
                className={
                  isFeatured
                    ? "grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 rounded-2xl border-l-4 border-primary-container bg-primary-fixed/15 py-8 pl-4 sm:grid-cols-[3.5rem_minmax(12rem,16rem)_1fr] sm:gap-x-10 sm:py-10 sm:pl-6"
                    : "grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 py-7 sm:grid-cols-[3.5rem_minmax(12rem,16rem)_1fr] sm:gap-x-10 sm:py-8"
                }
              >
                <span className="font-serif tabular-nums text-sm text-secondary">
                  {row.n}
                </span>
                <h3
                  className={
                    isFeatured
                      ? "font-serif text-3xl text-on-surface sm:text-4xl"
                      : "font-serif text-2xl text-on-surface sm:text-3xl"
                  }
                >
                  {row.title}
                </h3>
                <p className="col-start-2 max-w-xl text-sm leading-relaxed text-on-surface-variant sm:col-start-3 sm:self-center sm:text-base">
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

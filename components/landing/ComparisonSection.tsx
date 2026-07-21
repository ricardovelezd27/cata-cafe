import { getTranslations } from "next-intl/server";
import { Check, Minus } from "lucide-react";

export default async function ComparisonSection() {
  const t = await getTranslations("landing.comparison");

  const rows: { label: string; generic: boolean; cata: boolean }[] = [
    { label: t("rowSca"), generic: true, cata: true },
    { label: t("rowReports"), generic: true, cata: true },
    { label: t("rowBand"), generic: false, cata: true },
    { label: t("rowAlert"), generic: false, cata: true },
    { label: t("rowSegment"), generic: false, cata: true },
  ];

  return (
    <section className="cv-auto bg-surface-container-low">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,38rem)] lg:gap-16">
        <div data-reveal className="lg:pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-on-surface sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div
          data-reveal
          className="overflow-hidden rounded-[2rem] border border-outline-variant/60 bg-surface"
        >
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-outline-variant/50">
                <th scope="col" className="w-2/5 px-4 py-4 text-left font-medium text-on-surface-variant sm:w-1/2 sm:px-6" />
                <th scope="col" className="px-2 py-4 text-center font-medium text-on-surface-variant sm:px-3">
                  {t("colGeneric")}
                </th>
                <th scope="col" className="bg-primary-fixed/25 px-2 py-4 text-center font-serif text-sm text-primary sm:px-3 sm:text-base">
                  {t("colCata")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-4 py-4 text-left font-normal text-on-surface sm:px-6">
                    {row.label}
                  </th>
                  <td className="px-2 py-4 text-center sm:px-3">
                    {row.generic ? (
                      <Check aria-label={t("included")} className="mx-auto h-4 w-4 text-on-surface-variant" />
                    ) : (
                      <Minus aria-label={t("notIncluded")} className="mx-auto h-4 w-4 text-outline-variant" />
                    )}
                  </td>
                  <td className="bg-primary-fixed/25 px-2 py-4 text-center sm:px-3">
                    <Check
                      aria-label={t("included")}
                      className="mx-auto h-4 w-4 text-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The thesis line gets a committed terracotta surface */}
      <div className="bg-secondary">
        <p
          data-reveal
          className="mx-auto max-w-6xl px-5 py-12 text-center font-serif text-2xl leading-snug text-secondary-fixed sm:px-8 sm:py-14 sm:text-3xl"
        >
          {t("tagline")}
        </p>
      </div>
    </section>
  );
}

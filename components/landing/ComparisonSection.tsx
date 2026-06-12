import { getTranslations } from "next-intl/server";
import { Check, Minus } from "lucide-react";

export default async function ComparisonSection() {
  const t = await getTranslations("landing.comparison");

  const rows: { label: string; generic: boolean; cata: boolean; roadmap: boolean }[] = [
    { label: t("rowSca"), generic: true, cata: true, roadmap: false },
    { label: t("rowReports"), generic: true, cata: true, roadmap: false },
    { label: t("rowBand"), generic: false, cata: true, roadmap: true },
    { label: t("rowAlert"), generic: false, cata: true, roadmap: true },
    { label: t("rowSegment"), generic: false, cata: true, roadmap: true },
  ];

  return (
    <section className="cv-auto bg-surface-container-low">
      <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
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
          className="mt-10 overflow-hidden rounded-[2rem] border border-outline-variant/60 bg-surface"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/50">
                <th scope="col" className="w-1/2 px-5 py-4 text-left font-medium text-on-surface-variant sm:px-7" />
                <th scope="col" className="px-3 py-4 text-center font-medium text-on-surface-variant">
                  {t("colGeneric")}
                </th>
                <th scope="col" className="bg-primary-fixed/25 px-3 py-4 text-center font-serif text-base text-primary">
                  {t("colCata")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-5 py-4 text-left font-normal text-on-surface sm:px-7">
                    {row.label}
                    {row.roadmap && (
                      <span className="ml-1.5 align-middle text-secondary" aria-hidden="true">
                        *
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-4 text-center">
                    {row.generic ? (
                      <Check aria-label={t("included")} className="mx-auto h-4 w-4 text-on-surface-variant" />
                    ) : (
                      <Minus aria-label={t("notIncluded")} className="mx-auto h-4 w-4 text-outline-variant" />
                    )}
                  </td>
                  <td className="bg-primary-fixed/25 px-3 py-4 text-center">
                    <Check
                      aria-label={row.roadmap ? `${t("included")} — ${t("roadmapMark")}` : t("included")}
                      className="mx-auto h-4 w-4 text-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p data-reveal className="mt-4 text-center text-xs text-on-surface-variant">
          <span className="text-secondary" aria-hidden="true">
            *
          </span>{" "}
          {t("roadmapNote")}
        </p>
        <p data-reveal className="mt-8 text-center font-serif text-xl text-primary sm:text-2xl">
          {t("tagline")}
        </p>
      </div>
    </section>
  );
}

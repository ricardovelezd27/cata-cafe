import { getTranslations } from "next-intl/server";

export default async function CalibrationDriftSection() {
  const t = await getTranslations("landing.drift");

  const rows = [
    { label: t("lotLabel"), value: t("lotValue"), counter: false },
    { label: t("errorLabel"), value: t("errorValue"), counter: false },
    { label: t("lossLabel"), value: t("lossValue"), counter: true },
    { label: t("decisionsLabel"), value: t("decisionsValue"), counter: false },
  ];

  return (
    <section className="cv-auto bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <div data-reveal className="lg:self-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-on-surface sm:text-4xl">
            {t("statLead")}
          </h2>
          <p className="mt-2 font-serif text-3xl leading-tight text-secondary sm:text-4xl">
            {t("statPunch")}
          </p>
          <p className="mt-5 max-w-md text-base leading-relaxed text-on-surface-variant">
            {t("statNote")}
          </p>
          <p className="mt-6 max-w-md text-xs leading-relaxed text-on-surface-variant/80">
            {t("statSource")}
          </p>
        </div>

        <div
          data-reveal
          className="rounded-[2rem] border border-outline-variant/60 bg-surface-container-low p-7 sm:p-9"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
            {t("exampleTitle")}
          </p>
          <dl className="mt-5 divide-y divide-outline-variant/50">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 py-3.5"
              >
                <dt className="text-sm text-on-surface-variant">{row.label}</dt>
                <dd
                  className="font-serif tabular-nums text-xl text-on-surface"
                  {...(row.counter ? { "data-counter": "" } : {})}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 rounded-2xl bg-primary px-5 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-primary-fixed-dim">
                {t("totalLabel")}
              </p>
              <p
                data-counter=""
                className="font-serif tabular-nums text-3xl text-surface"
              >
                {t("totalValue")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

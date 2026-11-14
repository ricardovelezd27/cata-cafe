import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import Frame from "./Frame";

// Stylized recreation of the score card: the cupper's own score next to the
// group's, and on each attribute bar a round marker where the group stands.
// Terracotta is the group's colour here (the series, never a quality signal).
export default async function MockFrameScoreCard({
  ariaLabel,
  locale,
  tab,
}: {
  ariaLabel: string;
  locale: string;
  tab?: string;
}) {
  const t = await getTranslations();
  const format = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    minimumFractionDigits: 2,
  });

  // `own` fills the bar; `group` places the marker on the same track.
  const bars = [
    { label: t("attributes.sabor_af"), own: 82, group: 76 },
    { label: t("attributes.acidez_af"), own: 68, group: 75 },
    { label: t("attributes.dulzor_af"), own: 90, group: 85 },
  ];

  return (
    <Frame ariaLabel={ariaLabel} tab={tab}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
            {t("score.individual")}
          </p>
          <p className="mt-1 font-serif tabular-nums text-5xl leading-none text-primary">
            {format.format(87.25)}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary">
            <span className="h-2 w-2 rounded-full bg-secondary-container ring-1 ring-secondary" />
            {t("score.group")}
          </p>
          <p className="mt-1 font-serif tabular-nums text-4xl leading-none text-secondary-container">
            {format.format(87)}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label}>
            <p className="text-[10px] text-on-surface-variant">{bar.label}</p>
            <div className="relative mt-1 h-1.5 rounded-full bg-surface-container-high">
              <div
                className="h-1.5 rounded-full bg-primary-container"
                style={{ width: `${bar.own}%` }}
              />
              {/* The group's value on the same track. */}
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary-container ring-2 ring-surface"
                style={{ left: `${bar.group}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-fixed/40 px-3 py-1.5 text-[11px] font-semibold text-primary">
        <FileText className="h-3.5 w-3.5" />
        PDF
      </div>
    </Frame>
  );
}

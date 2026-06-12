import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import Frame from "./Frame";

// Stylized recreation of the score card with exportable PDF report.
export default async function MockFrameScoreCard({
  ariaLabel,
  locale,
}: {
  ariaLabel: string;
  locale: string;
}) {
  const t = await getTranslations();
  const score = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    minimumFractionDigits: 2,
  }).format(87.25);

  const bars = [
    { label: t("attributes.sabor_af"), w: "82%" },
    { label: t("attributes.acidez_af"), w: "68%" },
    { label: t("attributes.dulzor_af"), w: "90%" },
  ];

  return (
    <Frame ariaLabel={ariaLabel}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
        {t("score.individual")}
      </p>
      <p className="mt-1 font-serif tabular-nums text-5xl leading-none text-primary">
        {score}
      </p>
      <div className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label}>
            <p className="text-[10px] text-on-surface-variant">{bar.label}</p>
            <div className="mt-0.5 h-1.5 rounded-full bg-surface-container-high">
              <div
                className="h-1.5 rounded-full bg-primary-container"
                style={{ width: bar.w }}
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

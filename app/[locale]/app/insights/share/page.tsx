import { getTranslations, setRequestLocale } from "next-intl/server";
import { listSavedInsights } from "@/app/actions/analytics";
import { citationLines } from "@/lib/analytics/referenceSources";
import { InsightCardComposer } from "@/components/insights/InsightCardComposer";
import { DIMENSIONS, MEASURES } from "@/lib/analytics/types";
import type { DimensionId, MeasureId } from "@/lib/analytics/types";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsSharePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale === "en" ? "en" : "es";

  const [t, tExplorer, tCharts, tTabs, tAi, saved] = await Promise.all([
    getTranslations("insights.share"),
    getTranslations("insights.explorer"),
    getTranslations("insights.charts"),
    getTranslations("insights.tabs"),
    getTranslations("insights.ai"),
    listSavedInsights(),
  ]);

  // Bulk-build option-label records — same pattern as the explorer page.
  const tr = tExplorer as unknown as (key: string) => string;
  const record = <K extends string>(keys: readonly K[], prefix: string) =>
    Object.fromEntries(keys.map((k) => [k, tr(`${prefix}.${k}`)])) as Record<K, string>;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <h2 className="font-display text-xl text-brown-dark mb-1">{t("title")}</h2>
        <p className="text-sm text-brown-mid">{t("subtitle")}</p>
      </div>

      <InsightCardComposer
        locale={locale}
        savedInsights={saved.map((s) => ({ id: s.id, name: s.name, config: s.config }))}
        citationLines={citationLines(["cqi_arabica", "owid_fao"], loc)}
        t={{
          pickInsight: t("pickInsight"),
          noSaved: t("noSaved"),
          explorerLabel: tTabs("explorer"),
          headline: t("headline"),
          headlinePh: t("headlinePh"),
          downloadPng: t("downloadPng"),
          generateTexts: t("generateTexts"),
          postEs: t("postEs"),
          postEn: t("postEn"),
          copy: t("copy"),
          copied: t("copied"),
          exportError: t("exportError"),
          countLabel: tExplorer("table.count"),
          emptyLabel: tCharts("empty"),
          measureLabels: record<MeasureId>(MEASURES, "measures"),
          dimensionLabels: record<DimensionId>(DIMENSIONS, "dimensions"),
          ai: {
            generating: tAi("generating"),
            regenerate: tAi("regenerate"),
            disclaimer: tAi("disclaimer"),
            notConfigured: tAi("notConfigured"),
            error: tAi("error"),
          },
        }}
      />
    </div>
  );
}

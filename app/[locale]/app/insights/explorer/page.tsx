import { getTranslations, setRequestLocale } from "next-intl/server";
import { listSavedInsights } from "@/app/actions/analytics";
import { ExplorerBuilder } from "@/components/insights/ExplorerBuilder";
import type {
  ChartType,
  Dataset,
  DimensionId,
  MeasureId,
} from "@/lib/analytics/types";
import { CHART_TYPES, DATASETS, DIMENSIONS, MEASURES } from "@/lib/analytics/types";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsExplorerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tAi, saved] = await Promise.all([
    getTranslations("insights.explorer"),
    getTranslations("insights.ai"),
    listSavedInsights(),
  ]);

  // Bulk-build option-label records; the dynamic keys defeat next-intl's
  // template-literal typing, so go through an untyped alias.
  const tr = t as unknown as (key: string) => string;
  const record = <K extends string>(keys: readonly K[], prefix: string) =>
    Object.fromEntries(keys.map((k) => [k, tr(`${prefix}.${k}`)])) as Record<K, string>;

  return (
    <ExplorerBuilder
      locale={locale}
      initialSaved={saved}
      t={{
        dataset: t("dataset"),
        dimension: t("dimension"),
        measure: t("measure"),
        chartType: t("chartType"),
        dateFrom: t("dateFrom"),
        dateTo: t("dateTo"),
        running: t("running"),
        noResults: t("noResults"),
        error: t("error"),
        save: t("save"),
        saveName: t("saveName"),
        saveConfirm: t("saveConfirm"),
        savedTitle: t("savedTitle"),
        savedEmpty: t("savedEmpty"),
        load: t("load"),
        delete: t("delete"),
        close: t("close"),
        datasets: record<Dataset>(DATASETS, "datasets"),
        dimensions: record<DimensionId>(DIMENSIONS, "dimensions"),
        measures: record<MeasureId>(MEASURES, "measures"),
        chartTypes: record<ChartType>(CHART_TYPES, "chartTypes"),
        table: { count: t("table.count") },
        ai: {
          generate: tAi("generate"),
          generating: tAi("generating"),
          regenerate: tAi("regenerate"),
          disclaimer: tAi("disclaimer"),
          notConfigured: tAi("notConfigured"),
          error: tAi("error"),
        },
      }}
    />
  );
}

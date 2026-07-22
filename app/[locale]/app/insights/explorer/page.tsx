import { getTranslations, setRequestLocale } from "next-intl/server";
import { listSavedInsights } from "@/app/actions/analytics";
import { citationLines } from "@/lib/analytics/referenceSources";
import { ExplorerWorkspace } from "@/components/insights/ExplorerWorkspace";
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
  const loc = locale === "en" ? "en" : "es";

  const [t, tPivot, tAi, tShare, tCharts, saved] = await Promise.all([
    getTranslations("insights.explorer"),
    getTranslations("insights.pivot"),
    getTranslations("insights.ai"),
    getTranslations("insights.share"),
    getTranslations("insights.charts"),
    listSavedInsights(),
  ]);

  // Bulk-build option-label records; the dynamic keys defeat next-intl's
  // template-literal typing, so go through an untyped alias.
  const tr = t as unknown as (key: string) => string;
  const tp = tPivot as unknown as (key: string) => string;
  const record = <K extends string>(keys: readonly K[], prefix: string) =>
    Object.fromEntries(keys.map((k) => [k, tr(`${prefix}.${k}`)])) as Record<K, string>;

  // Pivot dataset/dimension/measure labels reuse the same "insights.explorer"
  // records rather than duplicating ~30 translated strings under a new
  // "insights.pivot" namespace.
  const datasetLabels = record<Dataset>(DATASETS, "datasets");
  const dimensionLabels = record<DimensionId>(DIMENSIONS, "dimensions");
  const measureLabels = record<MeasureId>(MEASURES, "measures");

  return (
    <ExplorerWorkspace
      locale={locale}
      initialSaved={saved}
      citationLines={citationLines(["cqi_arabica", "owid_fao"], loc)}
      t={{
        mode: { simple: t("mode.simple"), pivot: t("mode.pivot") },
        save: t("save"),
        saveName: t("saveName"),
        saveConfirm: t("saveConfirm"),
        savedTitle: t("savedTitle"),
        savedEmpty: t("savedEmpty"),
        load: t("load"),
        delete: t("delete"),
        close: t("close"),
        running: t("running"),
        shareButton: t("shareButton"),
        shareTitle: tShare("title"),
        shareSubtitle: tShare("subtitle"),
      }}
      shareT={{
        headline: tShare("headline"),
        headlinePh: tShare("headlinePh"),
        downloadPng: tShare("downloadPng"),
        generateTexts: tShare("generateTexts"),
        postEs: tShare("postEs"),
        postEn: tShare("postEn"),
        copy: tShare("copy"),
        copied: tShare("copied"),
        exportError: tShare("exportError"),
        countLabel: t("table.count"),
        emptyLabel: tCharts("empty"),
        measureLabels,
        dimensionLabels,
        pivot: {
          total: tp("total"),
          grandTotal: tp("grandTotal"),
          countHint: tPivot.raw("countHint"),
          empty: tp("empty"),
        },
        ai: {
          generating: tAi("generating"),
          regenerate: tAi("regenerate"),
          disclaimer: tAi("disclaimer"),
          notConfigured: tAi("notConfigured"),
          error: tAi("error"),
        },
      }}
      simpleT={{
        dataset: t("dataset"),
        dimension: t("dimension"),
        measure: t("measure"),
        chartType: t("chartType"),
        dateFrom: t("dateFrom"),
        dateTo: t("dateTo"),
        running: t("running"),
        noResults: t("noResults"),
        error: t("error"),
        datasets: datasetLabels,
        dimensions: dimensionLabels,
        measures: measureLabels,
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
      pivotT={{
        rows: tp("rows"),
        columns: tp("columns"),
        values: tp("values"),
        filters: tp("filters"),
        addField: tp("addField"),
        remove: tp("remove"),
        dataset: tp("dataset"),
        dateFrom: tp("dateFrom"),
        dateTo: tp("dateTo"),
        total: tp("total"),
        grandTotal: tp("grandTotal"),
        heatmap: tp("heatmap"),
        empty: tp("empty"),
        running: tp("running"),
        error: tp("error"),
        viewTable: tp("viewTable"),
        viewGrouped: tp("viewGrouped"),
        viewStacked: tp("viewStacked"),
        viewLine: tp("viewLine"),
        selectValues: tp("selectValues"),
        searchValues: tp("searchValues"),
        apply: tp("apply"),
        clearFilter: tp("clearFilter"),
        // Raw ICU template — {count} is only known per-cell at render time in
        // PivotTable, so it's interpolated client-side (next-intl placeholder
        // gotcha; mirrors insights/chat/page.tsx's limitReachedTemplate).
        countHint: tPivot.raw("countHint"),
        maxRowsHint: tp("maxRowsHint"),
        maxColsHint: tp("maxColsHint"),
        valueColumn: tp("valueColumn"),
        close: tp("close"),
        datasets: datasetLabels,
        dimensions: dimensionLabels,
        measures: measureLabels,
      }}
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { CHART_TYPES, DATASETS, DATASET_DIMENSIONS, DATASET_MEASURES, parseInsightConfig } from "@/lib/analytics/types";
import type {
  ChartType,
  Dataset,
  DimensionId,
  InsightConfig,
  InsightRow,
  MeasureId,
} from "@/lib/analytics/types";
import { runInsight } from "@/app/actions/analytics";
import { useActionFeedback } from "@/components/ui/Toast";
import { isAccessError } from "@/lib/actionResult";
import { InsightChart } from "@/components/insights/InsightChart";
import { AiSummaryPanel, type AiSummaryTranslations } from "@/components/insights/AiSummaryPanel";
import { cardClasses } from "@/components/ui/cardRecipe";
import { Notice } from "@/components/ui/Notice";
import { TextAction } from "@/components/ui/TextAction";

export interface ExplorerTranslations {
  dataset: string;
  dimension: string;
  measure: string;
  chartType: string;
  dateFrom: string;
  dateTo: string;
  running: string;
  noResults: string;
  error: string;
  /** J-06 (Q1): the failed-load notice's action ("Reintentar"). */
  retry?: string;
  datasets: Record<Dataset, string>;
  dimensions: Record<DimensionId, string>;
  measures: Record<MeasureId, string>;
  chartTypes: Record<ChartType, string>;
  table: { count: string };
  ai: AiSummaryTranslations;
}

interface ExplorerBuilderProps {
  locale: string;
  t: ExplorerTranslations;
  /** Raw (unvalidated) config pushed down by the workspace when a saved item is loaded. */
  loadedConfig?: unknown;
  /** Bumped by the workspace on every "Open" click so the same item can be reloaded. */
  loadKey?: number;
  /** Notified (synchronously, not debounced) whenever the active config changes, so the workspace can save it. */
  onConfigChange?: (config: InsightConfig) => void;
}

const selectClass =
  "w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body text-on-surface focus:border-primary-container";

export function ExplorerBuilder({ locale, t, loadedConfig, loadKey, onConfigChange }: ExplorerBuilderProps) {
  const [dataset, setDataset] = useState<Dataset>("evaluations");
  const [dimension, setDimension] = useState<DimensionId>("coffeeCountry");
  const [measure, setMeasure] = useState<MeasureId>("count");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [error, setError] = useState(false);
  // J-06 (Q1): bumping this re-runs the same request (the notice's "Reintentar").
  const [attempt, setAttempt] = useState(0);
  const [isPending, startTransition] = useTransition();
  const { notifyError } = useActionFeedback();

  const validDimensions = DATASET_DIMENSIONS[dataset];
  const validMeasures = DATASET_MEASURES[dataset];

  function changeDataset(next: Dataset) {
    setDataset(next);
    if (!DATASET_DIMENSIONS[next].includes(dimension)) {
      setDimension(DATASET_DIMENSIONS[next][0]);
    }
    if (!DATASET_MEASURES[next].includes(measure)) {
      setMeasure(DATASET_MEASURES[next][0]);
    }
  }

  const buildConfig = useCallback((): InsightConfig => {
    return {
      dataset,
      dimension,
      measure,
      chartType,
      filters: {
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      },
    };
  }, [dataset, dimension, measure, chartType, dateFrom, dateTo]);

  // Auto-run debounced so every dropdown change refreshes the preview.
  // onConfigChange fires synchronously (not debounced) on every change so the
  // workspace's "Save" button always captures the latest selection, even
  // before the debounced network request resolves.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const config = buildConfig();
    onConfigChange?.(config);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        // J-06 (Q1): a request that fails outright (a dropped connection, a blocked
        // request) throws here. It is caught so the page stays: the person's choices
        // and the last chart are kept, and a notice offers to try again.
        try {
          const result = await runInsight(config, locale);
          if (result.ok) {
            setRows(result.data);
            setError(false);
          } else {
            setError(true);
            if (isAccessError(result.error)) notifyError(result.error);
          }
        } catch {
          setError(true);
        }
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buildConfig, locale, onConfigChange, notifyError, attempt]);

  // Applies a saved config pushed down by the workspace. Keyed on loadKey
  // (not loadedConfig identity) so re-opening the same saved item retriggers.
  // Adjusted during render (React's "adjust state on prop change" pattern —
  // same as AiSummaryPanel's configKey guard) rather than in an effect, since
  // an effect body calling several setState()s synchronously trips
  // react-hooks/set-state-in-effect.
  //
  // prevLoadKey is seeded with the hardcoded sentinel 0 — NOT `loadKey`'s
  // current value. The workspace's loadKey counter also starts at 0 and only
  // becomes >0 after a real "Open" click, so seeding from the literal prop
  // would make a cross-mode load invisible: switching mode unmounts the
  // other builder and mounts this one fresh with loadKey already at (say) 1,
  // and `useState(loadKey)` would capture that same 1 as the "already
  // applied" baseline on its very first render, so the loadKey!==prevLoadKey
  // check below would never fire and the saved config would be dropped.
  // Seeding from the constant 0 instead means a pending load (loadKey > 0)
  // is always applied on mount, while the very first default mount (no load
  // ever requested, loadKey still 0) still correctly does nothing.
  const [prevLoadKey, setPrevLoadKey] = useState(0);
  if (loadKey !== undefined && loadKey > 0 && loadKey !== prevLoadKey) {
    setPrevLoadKey(loadKey);
    try {
      // Re-validate so a stale config degrades to an error instead of crashing.
      const config = parseInsightConfig(loadedConfig);
      setDataset(config.dataset);
      setDimension(config.dimension);
      setMeasure(config.measure);
      setChartType(config.chartType);
      setDateFrom(config.filters?.dateFrom ?? "");
      setDateTo(config.filters?.dateTo ?? "");
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Builder controls */}
      <div className={cardClasses()}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.dataset}
            </span>
            <select
              className={selectClass}
              value={dataset}
              onChange={(e) => changeDataset(e.target.value as Dataset)}
            >
              {DATASETS.map((d) => (
                <option key={d} value={d}>
                  {t.datasets[d]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.dimension}
            </span>
            <select
              className={selectClass}
              value={dimension}
              onChange={(e) => setDimension(e.target.value as DimensionId)}
            >
              {validDimensions.map((d) => (
                <option key={d} value={d}>
                  {t.dimensions[d]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.measure}
            </span>
            <select
              className={selectClass}
              value={measure}
              onChange={(e) => setMeasure(e.target.value as MeasureId)}
            >
              {validMeasures.map((m) => (
                <option key={m} value={m}>
                  {t.measures[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.chartType}
            </span>
            <select
              className={selectClass}
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
            >
              {CHART_TYPES.map((c) => (
                <option key={c} value={c}>
                  {t.chartTypes[c]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 max-w-md">
          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.dateFrom}
            </span>
            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">
              {t.dateTo}
            </span>
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className={cardClasses()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="label-caps font-sans">
            {t.dimensions[dimension]} · {t.measures[measure]}
          </h2>
          {isPending && (
            <span className="flex items-center gap-1.5 text-caption text-on-surface-variant">
              <Loader2 size={14} className="animate-spin" />
              {t.running}
            </span>
          )}
        </div>

        {error && (
          <Notice
            tone="error"
            className="mb-3"
            action={
              t.retry ? (
                <TextAction onClick={() => setAttempt((n) => n + 1)}>{t.retry}</TextAction>
              ) : undefined
            }
          >
            {t.error}
          </Notice>
        )}
        {error && rows === null ? null : rows === null ? (
          <div className="flex items-center justify-center h-40 text-caption text-on-surface-variant">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t.running}
          </div>
        ) : (
          <InsightChart
            rows={rows}
            chartType={chartType}
            valueLabel={t.measures[measure]}
            dimensionLabel={t.dimensions[dimension]}
            countLabel={t.table.count}
            emptyLabel={t.noResults}
          />
        )}
      </div>

      <AiSummaryPanel
        locale={locale}
        target={{ kind: "insight", config: buildConfig() }}
        translations={t.ai}
      />
    </div>
  );
}

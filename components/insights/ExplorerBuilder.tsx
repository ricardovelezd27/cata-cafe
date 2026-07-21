"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Save, Trash2, FolderOpen, Loader2 } from "lucide-react";
import {
  CHART_TYPES,
  DATASETS,
  DATASET_DIMENSIONS,
  DATASET_MEASURES,
  parseInsightConfig,
} from "@/lib/analytics/types";
import type {
  ChartType,
  Dataset,
  DimensionId,
  InsightConfig,
  InsightRow,
  MeasureId,
} from "@/lib/analytics/types";
import {
  deleteSavedInsight,
  listSavedInsights,
  runInsight,
  saveInsight,
} from "@/app/actions/analytics";
import { InsightChart } from "@/components/insights/InsightChart";
import { AiSummaryPanel, type AiSummaryTranslations } from "@/components/insights/AiSummaryPanel";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

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
  save: string;
  saveName: string;
  saveConfirm: string;
  savedTitle: string;
  savedEmpty: string;
  load: string;
  delete: string;
  close: string;
  datasets: Record<Dataset, string>;
  dimensions: Record<DimensionId, string>;
  measures: Record<MeasureId, string>;
  chartTypes: Record<ChartType, string>;
  table: { count: string };
  ai: AiSummaryTranslations;
}

export interface SavedInsightItem {
  id: string;
  name: string;
  config: unknown;
  createdAt: string;
  isMine: boolean;
}

interface ExplorerBuilderProps {
  locale: string;
  initialSaved: SavedInsightItem[];
  t: ExplorerTranslations;
}

const selectClass =
  "w-full rounded-lg border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";

export function ExplorerBuilder({ locale, initialSaved, t }: ExplorerBuilderProps) {
  const [dataset, setDataset] = useState<Dataset>("evaluations");
  const [dimension, setDimension] = useState<DimensionId>("coffeeCountry");
  const [measure, setMeasure] = useState<MeasureId>("count");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [saved, setSaved] = useState<SavedInsightItem[]>(initialSaved);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const config = buildConfig();
      startTransition(async () => {
        const result = await runInsight(config, locale);
        if (result.ok) {
          setRows(result.rows);
          setError(false);
        } else {
          setError(true);
        }
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buildConfig, locale]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveInsight(saveName, buildConfig());
      if (result.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaved(await listSavedInsights());
      }
    } finally {
      setSaving(false);
    }
  }

  function loadSaved(item: SavedInsightItem) {
    try {
      // Re-validate so stale configs degrade to an error instead of crashing.
      const config = parseInsightConfig(item.config);
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

  async function handleDelete(id: string) {
    const result = await deleteSavedInsight(id);
    if (result.ok) setSaved((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Builder controls */}
      <div className="bg-white rounded-xl border border-[#E8E0D0] shadow-card p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
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
      <div className="bg-white rounded-xl border border-[#E8E0D0] shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
            {t.dimensions[dimension]} · {t.measures[measure]}
          </h2>
          <div className="flex items-center gap-3">
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs text-brown-mid">
                <Loader2 size={14} className="animate-spin" />
                {t.running}
              </span>
            )}
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="flex items-center gap-1.5 text-sm text-[#3D5A3E] font-semibold hover:underline"
            >
              <Save size={15} />
              {t.save}
            </button>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-red-defect py-8 text-center">{t.error}</div>
        ) : rows === null ? (
          <div className="flex items-center justify-center h-40 text-sm text-brown-mid">
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

      {/* Saved insights */}
      <div className="bg-white rounded-xl border border-[#E8E0D0] shadow-card p-5">
        <h2 className="text-xs font-semibold text-brown-mid uppercase tracking-wide mb-3">
          {t.savedTitle}
        </h2>
        {saved.length === 0 ? (
          <p className="text-sm text-brown-mid">{t.savedEmpty}</p>
        ) : (
          <ul className="divide-y divide-[#F5F0E6]">
            {saved.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm text-brown-dark truncate">{item.name}</span>
                <span className="text-xs text-brown-mid hidden sm:block">
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </span>
                <button
                  type="button"
                  onClick={() => loadSaved(item)}
                  className="flex items-center gap-1 text-xs text-[#3D5A3E] font-semibold hover:underline"
                >
                  <FolderOpen size={14} />
                  {t.load}
                </button>
                {item.isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="flex items-center gap-1 text-xs text-brown-mid hover:text-red-defect"
                    aria-label={t.delete}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={t.save}
        closeLabel={t.close}
      >
        <div className="flex flex-col gap-3 p-1">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.saveName}
            </span>
            <input
              type="text"
              className={selectClass}
              value={saveName}
              maxLength={80}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
          </label>
          <button
            type="button"
            disabled={saving || saveName.trim().length === 0}
            onClick={handleSave}
            className="self-end rounded-lg bg-[#3D5A3E] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {saving ? t.running : t.saveConfirm}
          </button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

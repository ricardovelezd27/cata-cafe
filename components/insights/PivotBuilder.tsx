"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { DATASETS, DATASET_DIMENSIONS, DATASET_MEASURES, parsePivotConfig } from "@/lib/analytics/types";
import type {
  Dataset,
  DimensionId,
  MeasureId,
  PivotAxisKey,
  PivotConfig,
  PivotFilterValue,
  PivotResult,
} from "@/lib/analytics/types";
import { listPivotDimensionValues, runPivot } from "@/app/actions/analytics";
import { PivotTable } from "@/components/insights/PivotTable";
import { PivotChart } from "@/components/insights/PivotChart";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export interface PivotTranslations {
  rows: string;
  columns: string;
  values: string;
  filters: string;
  addField: string;
  remove: string;
  dataset: string;
  dateFrom: string;
  dateTo: string;
  total: string;
  grandTotal: string;
  heatmap: string;
  empty: string;
  running: string;
  error: string;
  viewTable: string;
  viewGrouped: string;
  viewStacked: string;
  viewLine: string;
  selectValues: string;
  searchValues: string;
  apply: string;
  clearFilter: string;
  /** ICU-style template with a `{count}` placeholder. */
  countHint: string;
  maxRowsHint: string;
  maxColsHint: string;
  valueColumn: string;
  close: string;
  datasets: Record<Dataset, string>;
  dimensions: Record<DimensionId, string>;
  measures: Record<MeasureId, string>;
}

interface PivotBuilderProps {
  locale: string;
  t: PivotTranslations;
  /** Raw (unvalidated) config pushed down by the workspace when a saved item is loaded. */
  loadedConfig?: unknown;
  /** Bumped by the workspace on every "Open" click so the same item can be reloaded. */
  loadKey?: number;
  /** Notified (synchronously, not debounced) whenever the active config changes, so the workspace can save it. */
  onConfigChange?: (config: PivotConfig) => void;
}

type View = "table" | "grouped" | "stacked" | "line";

// Mirrors the server-side cap in lib/analytics/types.ts (MAX_FILTER_ENTRIES)
// so the "+ add filter" affordance disappears before the server would reject.
const MAX_FILTER_ENTRIES = 5;

const selectClass =
  "w-full rounded-input border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";
const pickerSelectClass =
  "rounded-input border border-[#E8E0D0] bg-white px-2 py-1 text-xs text-brown-dark focus:outline-none focus:border-[#3D5A3E]";
const addFieldButtonClass =
  "inline-flex items-center gap-1 rounded-pill border border-dashed border-[#E8E0D0] px-3 py-1 text-xs font-semibold text-[#3D5A3E] hover:border-[#3D5A3E] hover:bg-cream transition-colors";
const shelfLabelClass = "text-xs font-semibold text-brown-mid uppercase tracking-wide";

function FieldChip({
  label,
  onRemove,
  removeLabel,
  onClick,
}: {
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-[#E8E0D0] bg-cream px-3 py-1 text-xs font-medium text-brown-dark ${
        onClick ? "cursor-pointer hover:border-[#3D5A3E]" : ""
      }`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel}
          className="text-brown-mid hover:text-red-defect"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/**
 * Tableau-esque pivot builder: Rows/Columns/Values/Filters shelves feeding
 * runPivot(), rendered as PivotTable (view "table") or PivotChart (other
 * views). Mirrors ExplorerBuilder's debounced-query / loadedConfig+loadKey
 * plumbing so ExplorerWorkspace can drive both builders the same way.
 */
export function PivotBuilder({ locale, t, loadedConfig, loadKey, onConfigChange }: PivotBuilderProps) {
  const [dataset, setDataset] = useState<Dataset>("evaluations");
  const [rows, setRows] = useState<DimensionId[]>([DATASET_DIMENSIONS.evaluations[0]]);
  const [columns, setColumns] = useState<DimensionId[]>([]);
  const [measure, setMeasure] = useState<MeasureId>("count");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dimensionValues, setDimensionValues] = useState<PivotFilterValue[]>([]);

  const [view, setView] = useState<View>("table");
  const [heatmap, setHeatmap] = useState(false);

  const [result, setResult] = useState<PivotResult | null>(null);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [rowsPickerOpen, setRowsPickerOpen] = useState(false);
  const [columnsPickerOpen, setColumnsPickerOpen] = useState(false);
  const [valuesPickerOpen, setValuesPickerOpen] = useState(false);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);

  const [filterDialogDim, setFilterDialogDim] = useState<DimensionId | null>(null);
  const [filterDialogValues, setFilterDialogValues] = useState<PivotAxisKey[]>([]);
  const [filterDialogLoading, setFilterDialogLoading] = useState(false);
  const [filterDialogSelected, setFilterDialogSelected] = useState<Set<string>>(new Set());
  const [filterDialogSearch, setFilterDialogSearch] = useState("");

  const validDimensions = DATASET_DIMENSIONS[dataset];
  const validMeasures = DATASET_MEASURES[dataset];

  const availableRowDims = validDimensions.filter((d) => !rows.includes(d) && !columns.includes(d));
  const availableColDims = validDimensions.filter((d) => !rows.includes(d) && !columns.includes(d));
  const availableFilterDims = validDimensions.filter(
    (d) => !dimensionValues.some((f) => f.dimension === d),
  );

  function changeDataset(next: Dataset) {
    const nextDims = DATASET_DIMENSIONS[next];

    // Columns must be resolved first: the rows fallback below has to avoid
    // whatever survives on the columns axis, or a rows/columns collision can
    // slip through (e.g. rows=["cupper"], columns=["coffeeCountry"],
    // evaluations -> coffees: "cupper" is invalid for coffees, and a
    // rows-only fallback picking nextDims[0] could land on "coffeeCountry",
    // which is already taken by columns — parsePivotConfig then rejects the
    // whole config as invalid_pivot).
    const nextColumns = columns.filter((d) => nextDims.includes(d));
    const keptRows = rows.filter((d) => nextDims.includes(d) && !nextColumns.includes(d));
    // Every dataset has at least 3 dimensions and columns holds at most 1, so
    // there is always a dim left over for the fallback.
    const fallbackRow = nextDims.find((d) => !nextColumns.includes(d)) ?? nextDims[0];
    const nextRows = keptRows.length > 0 ? keptRows : [fallbackRow];

    setDataset(next);
    setRows(nextRows);
    setColumns(nextColumns);
    setMeasure((prev) => (DATASET_MEASURES[next].includes(prev) ? prev : DATASET_MEASURES[next][0]));
    setDimensionValues((prev) => prev.filter((f) => nextDims.includes(f.dimension)));
  }

  function addRow(dim: DimensionId) {
    setRows((prev) => (prev.includes(dim) || prev.length >= 2 ? prev : [...prev, dim]));
  }
  function removeRow(dim: DimensionId) {
    setRows((prev) => (prev.length > 1 ? prev.filter((d) => d !== dim) : prev));
  }
  function addColumn(dim: DimensionId) {
    setColumns((prev) => (prev.includes(dim) || prev.length >= 1 ? prev : [...prev, dim]));
  }
  function removeColumn(dim: DimensionId) {
    setColumns((prev) => prev.filter((d) => d !== dim));
  }
  function removeFilter(dim: DimensionId) {
    setDimensionValues((prev) => prev.filter((f) => f.dimension !== dim));
  }

  function openFilterDialog(dim: DimensionId) {
    setFilterDialogDim(dim);
    const existing = dimensionValues.find((f) => f.dimension === dim);
    setFilterDialogSelected(new Set(existing?.values ?? []));
    setFilterDialogSearch("");
    setFilterDialogValues([]);
    setFilterDialogLoading(true);
    listPivotDimensionValues(dataset, dim, locale).then((res) => {
      if (res.ok) setFilterDialogValues(res.values);
      setFilterDialogLoading(false);
    });
  }

  function toggleFilterValue(key: string) {
    setFilterDialogSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyFilterDialog() {
    const dim = filterDialogDim;
    if (!dim) return;
    const values = [...filterDialogSelected];
    // A filter entry with zero selected values would exclude every row
    // server-side, so drop the entry entirely instead of sending one.
    setDimensionValues((prev) => {
      const withoutDim = prev.filter((f) => f.dimension !== dim);
      return values.length > 0 ? [...withoutDim, { dimension: dim, values }] : withoutDim;
    });
    setFilterDialogDim(null);
  }

  const filteredDialogValues = filterDialogValues.filter((v) =>
    v.label.toLowerCase().includes(filterDialogSearch.trim().toLowerCase()),
  );

  const buildConfig = useCallback((): PivotConfig => {
    const filters: NonNullable<PivotConfig["filters"]> = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (dimensionValues.length > 0) filters.dimensionValues = dimensionValues;
    return {
      kind: "pivot",
      dataset,
      rows,
      columns,
      measure,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
    };
  }, [dataset, rows, columns, measure, dateFrom, dateTo, dimensionValues]);

  // Auto-run debounced so every shelf change refreshes the preview.
  // onConfigChange fires synchronously (not debounced) on every change so the
  // workspace's "Save" button always captures the latest selection.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const config = buildConfig();
    onConfigChange?.(config);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await runPivot(config, locale);
        if (res.ok) {
          setResult(res.result);
          setError(false);
        } else {
          setError(true);
        }
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buildConfig, locale, onConfigChange]);

  // Applies a saved config pushed down by the workspace. Keyed on loadKey
  // (not loadedConfig identity) so re-opening the same saved item retriggers.
  // Adjusted during render (React's "adjust state on prop change" pattern —
  // same as AiSummaryPanel's configKey guard) rather than in an effect, since
  // an effect body calling several setState()s synchronously trips
  // react-hooks/set-state-in-effect.
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey);
  if (loadKey !== undefined && loadKey !== prevLoadKey) {
    setPrevLoadKey(loadKey);
    try {
      const config = parsePivotConfig(loadedConfig);
      setDataset(config.dataset);
      setRows(config.rows);
      setColumns(config.columns);
      setMeasure(config.measure);
      setDateFrom(config.filters?.dateFrom ?? "");
      setDateTo(config.filters?.dateTo ?? "");
      setDimensionValues(config.filters?.dimensionValues ?? []);
      setError(false);
    } catch {
      setError(true);
    }
  }

  const viewOptions: { id: View; label: string }[] = [
    { id: "table", label: t.viewTable },
    { id: "grouped", label: t.viewGrouped },
    { id: "stacked", label: t.viewStacked },
    { id: "line", label: t.viewLine },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Builder controls */}
      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl">
          <label className="flex flex-col gap-1">
            <span className={shelfLabelClass}>{t.dataset}</span>
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
            <span className={shelfLabelClass}>{t.dateFrom}</span>
            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={shelfLabelClass}>{t.dateTo}</span>
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>

        {/* Rows shelf */}
        <div className="flex flex-col gap-1.5">
          <span className={shelfLabelClass}>{t.rows}</span>
          <div className="flex flex-wrap items-center gap-2">
            {rows.map((dim) => (
              <FieldChip
                key={dim}
                label={t.dimensions[dim]}
                removeLabel={t.remove}
                onRemove={rows.length > 1 ? () => removeRow(dim) : undefined}
              />
            ))}
            {rows.length < 2 &&
              availableRowDims.length > 0 &&
              (rowsPickerOpen ? (
                <select
                  autoFocus
                  className={pickerSelectClass}
                  value=""
                  onChange={(e) => {
                    addRow(e.target.value as DimensionId);
                    setRowsPickerOpen(false);
                  }}
                  onBlur={() => setRowsPickerOpen(false)}
                >
                  <option value="" disabled>
                    {t.addField}
                  </option>
                  {availableRowDims.map((d) => (
                    <option key={d} value={d}>
                      {t.dimensions[d]}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setRowsPickerOpen(true)}
                  className={addFieldButtonClass}
                >
                  <Plus size={12} />
                  {t.addField}
                </button>
              ))}
          </div>
        </div>

        {/* Columns shelf */}
        <div className="flex flex-col gap-1.5">
          <span className={shelfLabelClass}>{t.columns}</span>
          <div className="flex flex-wrap items-center gap-2">
            {columns.map((dim) => (
              <FieldChip
                key={dim}
                label={t.dimensions[dim]}
                removeLabel={t.remove}
                onRemove={() => removeColumn(dim)}
              />
            ))}
            {columns.length < 1 &&
              availableColDims.length > 0 &&
              (columnsPickerOpen ? (
                <select
                  autoFocus
                  className={pickerSelectClass}
                  value=""
                  onChange={(e) => {
                    addColumn(e.target.value as DimensionId);
                    setColumnsPickerOpen(false);
                  }}
                  onBlur={() => setColumnsPickerOpen(false)}
                >
                  <option value="" disabled>
                    {t.addField}
                  </option>
                  {availableColDims.map((d) => (
                    <option key={d} value={d}>
                      {t.dimensions[d]}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setColumnsPickerOpen(true)}
                  className={addFieldButtonClass}
                >
                  <Plus size={12} />
                  {t.addField}
                </button>
              ))}
          </div>
        </div>

        {/* Values shelf — exactly one measure, click the chip to change it. */}
        <div className="flex flex-col gap-1.5">
          <span className={shelfLabelClass}>{t.values}</span>
          <div className="flex flex-wrap items-center gap-2">
            {valuesPickerOpen ? (
              <select
                autoFocus
                aria-label={t.valueColumn}
                className={pickerSelectClass}
                value={measure}
                onChange={(e) => {
                  setMeasure(e.target.value as MeasureId);
                  setValuesPickerOpen(false);
                }}
                onBlur={() => setValuesPickerOpen(false)}
              >
                {validMeasures.map((m) => (
                  <option key={m} value={m}>
                    {t.measures[m]}
                  </option>
                ))}
              </select>
            ) : (
              <FieldChip label={t.measures[measure]} onClick={() => setValuesPickerOpen(true)} />
            )}
          </div>
        </div>

        {/* Filters shelf */}
        <div className="flex flex-col gap-1.5">
          <span className={shelfLabelClass}>{t.filters}</span>
          <div className="flex flex-wrap items-center gap-2">
            {dimensionValues.map((f) => (
              <FieldChip
                key={f.dimension}
                label={`${t.dimensions[f.dimension]} (${f.values.length})`}
                removeLabel={t.remove}
                onClick={() => openFilterDialog(f.dimension)}
                onRemove={() => removeFilter(f.dimension)}
              />
            ))}
            {dimensionValues.length < MAX_FILTER_ENTRIES &&
              availableFilterDims.length > 0 &&
              (filterPickerOpen ? (
                <select
                  autoFocus
                  className={pickerSelectClass}
                  value=""
                  onChange={(e) => {
                    const dim = e.target.value as DimensionId;
                    setFilterPickerOpen(false);
                    openFilterDialog(dim);
                  }}
                  onBlur={() => setFilterPickerOpen(false)}
                >
                  <option value="" disabled>
                    {t.addField}
                  </option>
                  {availableFilterDims.map((d) => (
                    <option key={d} value={d}>
                      {t.dimensions[d]}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setFilterPickerOpen(true)}
                  className={addFieldButtonClass}
                >
                  <Plus size={12} />
                  {t.addField}
                </button>
              ))}
          </div>
        </div>

        <p className="text-xs text-brown-mid">
          {t.maxRowsHint} {t.maxColsHint}
        </p>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="inline-flex rounded-pill border border-[#E8E0D0] bg-cream p-1">
              {viewOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setView(opt.id)}
                  className={`px-3 py-1 rounded-pill text-xs font-semibold transition-colors ${
                    view === opt.id ? "bg-[#3D5A3E] text-white" : "text-brown-mid hover:text-brown-dark"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {view === "table" && (
              <button
                type="button"
                onClick={() => setHeatmap((h) => !h)}
                className={`px-3 py-1 rounded-pill text-xs font-semibold border transition-colors ${
                  heatmap
                    ? "bg-[#3D5A3E] text-white border-[#3D5A3E]"
                    : "border-[#E8E0D0] text-brown-mid hover:text-brown-dark"
                }`}
              >
                {t.heatmap}
              </button>
            )}
          </div>
          {isPending && (
            <span className="flex items-center gap-1.5 text-xs text-brown-mid">
              <Loader2 size={14} className="animate-spin" />
              {t.running}
            </span>
          )}
        </div>

        {error ? (
          <div className="text-sm text-red-defect py-8 text-center">{t.error}</div>
        ) : result === null ? (
          <div className="flex items-center justify-center h-40 text-sm text-brown-mid">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t.running}
          </div>
        ) : view === "table" ? (
          <PivotTable
            result={result}
            heatmap={heatmap}
            measureLabel={t.measures[measure]}
            t={{ total: t.total, grandTotal: t.grandTotal, countHint: t.countHint, empty: t.empty }}
          />
        ) : (
          <PivotChart
            result={result}
            view={view}
            measureLabel={t.measures[measure]}
            t={{ empty: t.empty }}
          />
        )}
      </div>

      <ResponsiveDialog
        open={filterDialogDim !== null}
        onOpenChange={(open) => {
          if (!open) setFilterDialogDim(null);
        }}
        title={t.selectValues}
        subtitle={filterDialogDim ? t.dimensions[filterDialogDim] : undefined}
        closeLabel={t.close}
      >
        <div className="flex flex-col gap-3 p-1">
          <input
            type="text"
            placeholder={t.searchValues}
            className={selectClass}
            value={filterDialogSearch}
            onChange={(e) => setFilterDialogSearch(e.target.value)}
          />
          {filterDialogLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-brown-mid">
              <Loader2 size={16} className="animate-spin mr-2" />
              {t.running}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 max-h-[50vh] overflow-y-auto">
              {filteredDialogValues.map((v) => (
                <label
                  key={v.key}
                  className="flex items-center gap-2 text-sm text-brown-dark py-1 px-1 rounded-input hover:bg-cream cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filterDialogSelected.has(v.key)}
                    onChange={() => toggleFilterValue(v.key)}
                  />
                  {v.label}
                </label>
              ))}
              {filteredDialogValues.length === 0 && (
                <p className="text-sm text-brown-mid py-4 text-center">{t.empty}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-[#E8E0D0]">
            <button
              type="button"
              onClick={() => setFilterDialogSelected(new Set())}
              className="text-xs text-brown-mid hover:text-red-defect"
            >
              {t.clearFilter}
            </button>
            <button
              type="button"
              onClick={applyFilterDialog}
              className="rounded-pill bg-[#3D5A3E] text-white text-sm font-semibold px-4 py-2"
            >
              {t.apply}
            </button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

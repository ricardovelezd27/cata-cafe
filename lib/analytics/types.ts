// Insight-explorer configuration: types + whitelists shared by the client
// dropdowns and the server-side validator. Client-safe — no server imports.
// The server only ever executes hardcoded code paths selected by these enum
// values; nothing from the client reaches a query as a raw string.

export const DATASETS = ["evaluations", "sessions", "coffees", "samples"] as const;
export type Dataset = (typeof DATASETS)[number];

// Data-visibility scope for analytics queries. "platform" = everything
// (super admin); "user" = only that user's own footprint: sessions they
// created (with every evaluation inside them), their own evaluations in
// other people's sessions, and coffees they can use (own + public + shared).
// Queries default to "platform" so existing insights surfaces are unchanged;
// the AI chat is the first consumer that passes a per-user scope.
export type AnalyticsScope = { kind: "platform" } | { kind: "user"; userId: string };

export const PLATFORM_SCOPE: AnalyticsScope = { kind: "platform" };

export const DIMENSIONS = [
  "coffeeCountry",
  "coffeeRegion",
  "coffeeProcess",
  "coffeeVariety",
  "coffeeSpecies",
  "coffeeRoastLevel",
  "sessionFormat",
  "sessionStatus",
  "month",
  "cupper",
  "flavorDescriptor",
  "scoreBucket",
  "blockNariz",
  "blockBoca",
  "blockGusto",
  "blockAcidez",
  "blockDulzura",
  "blockSensacion",
  "harvestYear",
  "altitudeBand",
] as const;
export type DimensionId = (typeof DIMENSIONS)[number];

export const MEASURES = [
  "count",
  "avgIndividualScore",
  "avgCommunityScore",
  "avgAffectiveSum",
  "minIndividualScore",
  "maxIndividualScore",
] as const;
export type MeasureId = (typeof MEASURES)[number];

export const CHART_TYPES = ["bar", "line", "pie", "table"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface InsightConfig {
  dataset: Dataset;
  dimension: DimensionId;
  measure: MeasureId;
  chartType: ChartType;
  /** ISO dates (YYYY-MM-DD), applied to the dataset's canonical date. */
  filters?: { dateFrom?: string; dateTo?: string };
  /** Top-N buckets; default 20, clamped 1..50. */
  limit?: number;
}

export interface InsightRow {
  /** Stable bucket id ("CO", "frutal:baya", "2026-05", "unknown"). */
  key: string;
  /** Locale-resolved display label. */
  label: string;
  /** The measure value. */
  value: number;
  /** Underlying row count for the bucket (tooltips/table). */
  count: number;
  /** Optional fill color (flavor-wheel group color for descriptors). */
  color?: string;
}

// Compatibility matrix — single source of truth for client dropdowns and the
// server validator. A config is valid iff its dimension AND measure appear in
// its dataset's row here.
export const DATASET_DIMENSIONS: Record<Dataset, readonly DimensionId[]> = {
  evaluations: [
    "coffeeCountry",
    "coffeeRegion",
    "coffeeProcess",
    "coffeeVariety",
    "sessionFormat",
    "month",
    "cupper",
    "flavorDescriptor",
    "scoreBucket",
    "blockNariz",
    "blockBoca",
    "blockGusto",
    "blockAcidez",
    "blockDulzura",
    "blockSensacion",
    "harvestYear",
    "altitudeBand",
  ],
  sessions: ["sessionFormat", "sessionStatus", "month"],
  coffees: [
    "coffeeCountry",
    "coffeeRegion",
    "coffeeProcess",
    "coffeeVariety",
    "coffeeSpecies",
    "coffeeRoastLevel",
    "month",
    "harvestYear",
    "altitudeBand",
  ],
  samples: ["coffeeCountry", "coffeeProcess", "sessionFormat", "month", "harvestYear", "altitudeBand"],
};

export const DATASET_MEASURES: Record<Dataset, readonly MeasureId[]> = {
  evaluations: [
    "count",
    "avgIndividualScore",
    "avgAffectiveSum",
    "minIndividualScore",
    "maxIndividualScore",
  ],
  sessions: ["count"],
  coffees: ["count"],
  samples: ["count", "avgCommunityScore"],
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}

// ── Pivot builder ────────────────────────────────────────────────────────────
// A Tableau-like row×column cross-tab layered on the same dataset/dimension/
// measure whitelists above. `kind: "pivot"` discriminates a PivotConfig from
// a plain InsightConfig inside SavedInsight.config (which predates this and
// carries no discriminator at all).

export interface PivotFilterValue {
  dimension: DimensionId;
  values: string[];
}

export interface PivotConfig {
  kind: "pivot";
  dataset: Dataset;
  /** 1..2 dimensions, cross-producted for the row axis. */
  rows: DimensionId[];
  /** 0..1 dimensions; empty means a single implicit total column. */
  columns: DimensionId[];
  measure: MeasureId;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    dimensionValues?: PivotFilterValue[];
  };
  /** Max row-axis keys kept; default 30, clamped 1..50. */
  rowLimit?: number;
  /** Max column-axis keys kept; default 12, clamped 1..24. */
  colLimit?: number;
}

export interface PivotCell {
  value: number | null;
  count: number;
}

export interface PivotAxisKey {
  key: string;
  label: string;
  color?: string;
}

export interface PivotResult {
  measure: MeasureId;
  rowKeys: PivotAxisKey[];
  colKeys: PivotAxisKey[];
  /** cells[rowKey][colKey] */
  cells: Record<string, Record<string, PivotCell>>;
  rowTotals: Record<string, PivotCell>;
  colTotals: Record<string, PivotCell>;
  grandTotal: PivotCell;
}

const DEFAULT_ROW_LIMIT = 30;
const MAX_ROW_LIMIT = 50;
const DEFAULT_COL_LIMIT = 12;
const MAX_COL_LIMIT = 24;
const MAX_FILTER_ENTRIES = 5;
const MAX_FILTER_VALUES_PER_ENTRY = 50;
const MAX_FILTER_VALUE_LENGTH = 120;

/**
 * Cheap structural peek used to route SavedInsight.config to the right parser
 * before validating it. A plain InsightConfig has no `kind` at all.
 */
export function isPivotConfigLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).kind === "pivot"
  );
}

/**
 * Structural validation of an untrusted pivot config. Throws
 * Error("invalid_pivot") on anything outside the whitelist.
 */
export function parsePivotConfig(input: unknown): PivotConfig {
  if (typeof input !== "object" || input === null) throw new Error("invalid_pivot");
  const raw = input as Record<string, unknown>;

  if (raw.kind !== "pivot") throw new Error("invalid_pivot");

  const dataset = raw.dataset as Dataset;
  if (!DATASETS.includes(dataset)) throw new Error("invalid_pivot");
  const allowedDims = DATASET_DIMENSIONS[dataset];

  if (!Array.isArray(raw.rows)) throw new Error("invalid_pivot");
  if (raw.rows.length < 1 || raw.rows.length > 2) throw new Error("invalid_pivot");
  for (const d of raw.rows) {
    if (!allowedDims.includes(d as DimensionId)) throw new Error("invalid_pivot");
  }
  const rows = raw.rows as DimensionId[];

  if (!Array.isArray(raw.columns)) throw new Error("invalid_pivot");
  if (raw.columns.length > 1) throw new Error("invalid_pivot");
  for (const d of raw.columns) {
    if (!allowedDims.includes(d as DimensionId)) throw new Error("invalid_pivot");
  }
  const columns = raw.columns as DimensionId[];

  const allAxisDims = [...rows, ...columns];
  if (new Set(allAxisDims).size !== allAxisDims.length) throw new Error("invalid_pivot");

  const measure = raw.measure as MeasureId;
  if (!DATASET_MEASURES[dataset].includes(measure)) throw new Error("invalid_pivot");

  let rowLimit = DEFAULT_ROW_LIMIT;
  if (raw.rowLimit !== undefined) {
    if (typeof raw.rowLimit !== "number" || !Number.isFinite(raw.rowLimit)) {
      throw new Error("invalid_pivot");
    }
    rowLimit = Math.min(MAX_ROW_LIMIT, Math.max(1, Math.round(raw.rowLimit)));
  }

  let colLimit = DEFAULT_COL_LIMIT;
  if (raw.colLimit !== undefined) {
    if (typeof raw.colLimit !== "number" || !Number.isFinite(raw.colLimit)) {
      throw new Error("invalid_pivot");
    }
    colLimit = Math.min(MAX_COL_LIMIT, Math.max(1, Math.round(raw.colLimit)));
  }

  let filters: PivotConfig["filters"];
  if (raw.filters !== undefined) {
    if (typeof raw.filters !== "object" || raw.filters === null) {
      throw new Error("invalid_pivot");
    }
    const f = raw.filters as Record<string, unknown>;
    filters = {};
    if (f.dateFrom !== undefined && f.dateFrom !== "") {
      if (!isIsoDate(f.dateFrom)) throw new Error("invalid_pivot");
      filters.dateFrom = f.dateFrom;
    }
    if (f.dateTo !== undefined && f.dateTo !== "") {
      if (!isIsoDate(f.dateTo)) throw new Error("invalid_pivot");
      filters.dateTo = f.dateTo;
    }
    if (f.dimensionValues !== undefined) {
      if (!Array.isArray(f.dimensionValues)) throw new Error("invalid_pivot");
      if (f.dimensionValues.length > MAX_FILTER_ENTRIES) throw new Error("invalid_pivot");
      const dimensionValues: PivotFilterValue[] = [];
      for (const entry of f.dimensionValues) {
        if (typeof entry !== "object" || entry === null) throw new Error("invalid_pivot");
        const e = entry as Record<string, unknown>;
        const dimension = e.dimension as DimensionId;
        if (!allowedDims.includes(dimension)) throw new Error("invalid_pivot");
        if (!Array.isArray(e.values)) throw new Error("invalid_pivot");
        if (e.values.length > MAX_FILTER_VALUES_PER_ENTRY) throw new Error("invalid_pivot");
        const values: string[] = [];
        for (const v of e.values) {
          if (typeof v !== "string") throw new Error("invalid_pivot");
          const trimmed = v.trim();
          if (trimmed.length === 0 || trimmed.length > MAX_FILTER_VALUE_LENGTH) {
            throw new Error("invalid_pivot");
          }
          values.push(trimmed);
        }
        dimensionValues.push({ dimension, values });
      }
      filters.dimensionValues = dimensionValues;
    }
  }

  return { kind: "pivot", dataset, rows, columns, measure, filters, rowLimit, colLimit };
}

/**
 * Structural validation of an untrusted config. Throws Error("invalid_config")
 * on anything outside the whitelist.
 */
export function parseInsightConfig(input: unknown): InsightConfig {
  if (typeof input !== "object" || input === null) throw new Error("invalid_config");
  const raw = input as Record<string, unknown>;

  const dataset = raw.dataset as Dataset;
  const dimension = raw.dimension as DimensionId;
  const measure = raw.measure as MeasureId;
  const chartType = raw.chartType as ChartType;

  if (!DATASETS.includes(dataset)) throw new Error("invalid_config");
  if (!DATASET_DIMENSIONS[dataset].includes(dimension)) throw new Error("invalid_config");
  if (!DATASET_MEASURES[dataset].includes(measure)) throw new Error("invalid_config");
  if (!CHART_TYPES.includes(chartType)) throw new Error("invalid_config");

  let limit = DEFAULT_LIMIT;
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "number" || !Number.isFinite(raw.limit)) {
      throw new Error("invalid_config");
    }
    limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(raw.limit)));
  }

  let filters: InsightConfig["filters"];
  if (raw.filters !== undefined) {
    if (typeof raw.filters !== "object" || raw.filters === null) {
      throw new Error("invalid_config");
    }
    const f = raw.filters as Record<string, unknown>;
    filters = {};
    if (f.dateFrom !== undefined && f.dateFrom !== "") {
      if (!isIsoDate(f.dateFrom)) throw new Error("invalid_config");
      filters.dateFrom = f.dateFrom;
    }
    if (f.dateTo !== undefined && f.dateTo !== "") {
      if (!isIsoDate(f.dateTo)) throw new Error("invalid_config");
      filters.dateTo = f.dateTo;
    }
  }

  return { dataset, dimension, measure, chartType, filters, limit };
}

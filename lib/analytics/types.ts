// Insight-explorer configuration: types + whitelists shared by the client
// dropdowns and the server-side validator. Client-safe — no server imports.
// The server only ever executes hardcoded code paths selected by these enum
// values; nothing from the client reaches a query as a raw string.

export const DATASETS = ["evaluations", "sessions", "coffees", "samples"] as const;
export type Dataset = (typeof DATASETS)[number];

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

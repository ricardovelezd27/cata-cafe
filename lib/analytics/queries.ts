import "server-only";
import { prisma } from "@/lib/prisma";
import {
  FLAVOR_DESC_KEYS,
  PERCEPTUAL_BLOCKS,
  collectDescriptors,
  resolveDescriptor,
  resolveMainTaste,
} from "@/lib/descriptors";
import {
  altitudeBand,
  normalizeCountry,
  normalizeProcess,
  parseAltitudeMeters,
  parseHarvestYear,
} from "./normalize";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";
import { PLATFORM_SCOPE } from "./types";
import type {
  AnalyticsScope,
  Dataset,
  DimensionId,
  InsightConfig,
  InsightRow,
  MeasureId,
  PivotAxisKey,
  PivotConfig,
  PivotResult,
} from "./types";
import type { Prisma } from "@/app/generated/prisma/client";

type Locale = "es" | "en";

// Strategy: fetch a flat projection per dataset, aggregate in memory. This
// uniformly handles what Prisma groupBy can't: cross-relation dimensions
// (evaluation → sessionSample → coffee.country), exploding JSON-array
// dimensions (flavor descriptors) and computed buckets (month, score bands).
// Volume is hundreds-to-thousands of rows, so in-memory is fine.

interface AnalyticsRow {
  /** Canonical date of the row (dataset-specific). */
  date: Date | null;
  coffeeCountry?: string | null;
  coffeeRegion?: string | null;
  coffeeProcess?: string | null;
  coffeeVariety?: string | null;
  coffeeSpecies?: string | null;
  coffeeRoastLevel?: string | null;
  /** Free-text; parsed by extractBuckets (parseHarvestYear / parseAltitudeMeters). */
  coffeeHarvestYear?: string | null;
  coffeeAltitude?: string | null;
  sessionFormat?: string | null;
  sessionStatus?: string | null;
  cupperId?: string;
  cupperName?: string;
  individualScore?: number | null;
  affectiveSum?: number | null;
  communityScore?: number | null;
  /** Format-selected descriptor blob (combined → combinedData, etc.). */
  descriptorBlob?: Record<string, unknown> | null;
}

const UNKNOWN_LABEL: Record<Locale, string> = { es: "Sin dato", en: "Unknown" };

// ── Scope → Prisma where fragments ──────────────────────────────────────────
// One helper per dataset; each returns {} for the platform scope so spreading
// it into a where clause is always safe. The "user" semantics deliberately
// mirror what that user can already see elsewhere in the app: a session owner
// sees every evaluation inside their sessions (results page), a participant
// sees their own evaluations, and coffee access follows usableCoffeeWhere.

function scopedEvaluationWhere(scope: AnalyticsScope): Prisma.EvaluationWhereInput {
  if (scope.kind === "platform") return {};
  return {
    OR: [
      { cupperId: scope.userId },
      { sessionSample: { session: { createdBy: scope.userId } } },
    ],
  };
}

function scopedSessionWhere(scope: AnalyticsScope): Prisma.CuppingSessionWhereInput {
  return scope.kind === "platform" ? {} : { createdBy: scope.userId };
}

function scopedCoffeeWhere(scope: AnalyticsScope): Prisma.CoffeeWhereInput {
  return scope.kind === "platform" ? {} : usableCoffeeWhere(scope.userId);
}

function scopedSampleWhere(scope: AnalyticsScope): Prisma.SessionSampleWhereInput {
  return scope.kind === "platform" ? {} : { session: { createdBy: scope.userId } };
}

function dateRange(filters: InsightConfig["filters"]) {
  const gte = filters?.dateFrom ? new Date(filters.dateFrom) : undefined;
  // Make dateTo inclusive of the whole day.
  const lte = filters?.dateTo
    ? new Date(new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1)
    : undefined;
  return gte || lte ? { gte, lte } : undefined;
}

/** Picks the JSON blob that holds descriptor arrays for a session format. */
function descriptorBlobFor(
  format: string | null | undefined,
  descriptiveData: unknown,
  combinedData: unknown,
): Record<string, unknown> | null {
  if (format === "combined") return (combinedData as Record<string, unknown>) ?? null;
  if (format === "descriptive") return (descriptiveData as Record<string, unknown>) ?? null;
  return null; // affective sessions carry no descriptors
}

async function fetchEvaluationRows(
  filters: InsightConfig["filters"],
  scope: AnalyticsScope,
): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.evaluation.findMany({
    where: {
      isDraft: false,
      ...(range ? { submittedAt: range } : {}),
      ...scopedEvaluationWhere(scope),
    },
    select: {
      individualScore: true,
      affectiveSum: true,
      submittedAt: true,
      cupperId: true,
      descriptiveData: true,
      combinedData: true,
      cupper: { select: { displayName: true } },
      sessionSample: {
        select: {
          session: { select: { format: true } },
          coffee: {
            select: {
              country: true,
              region: true,
              processType: true,
              variety: true,
              harvestYear: true,
              altitude: true,
            },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    date: r.submittedAt,
    coffeeCountry: r.sessionSample.coffee?.country,
    coffeeRegion: r.sessionSample.coffee?.region,
    coffeeProcess: r.sessionSample.coffee?.processType,
    coffeeVariety: r.sessionSample.coffee?.variety,
    coffeeHarvestYear: r.sessionSample.coffee?.harvestYear,
    coffeeAltitude: r.sessionSample.coffee?.altitude,
    sessionFormat: r.sessionSample.session.format,
    cupperId: r.cupperId,
    cupperName: r.cupper.displayName,
    individualScore: r.individualScore,
    affectiveSum: r.affectiveSum,
    descriptorBlob: descriptorBlobFor(
      r.sessionSample.session.format,
      r.descriptiveData,
      r.combinedData,
    ),
  }));
}

async function fetchSessionRows(
  filters: InsightConfig["filters"],
  scope: AnalyticsScope,
): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.cuppingSession.findMany({
    where: { ...(range ? { date: range } : {}), ...scopedSessionWhere(scope) },
    select: { format: true, status: true, date: true },
  });
  return rows.map((r) => ({
    date: r.date,
    sessionFormat: r.format,
    sessionStatus: r.status,
  }));
}

async function fetchCoffeeRows(
  filters: InsightConfig["filters"],
  scope: AnalyticsScope,
): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.coffee.findMany({
    where: { ...(range ? { createdAt: range } : {}), ...scopedCoffeeWhere(scope) },
    select: {
      country: true,
      region: true,
      processType: true,
      variety: true,
      species: true,
      roastLevel: true,
      harvestYear: true,
      altitude: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    date: r.createdAt,
    coffeeCountry: r.country,
    coffeeRegion: r.region,
    coffeeProcess: r.processType,
    coffeeVariety: r.variety,
    coffeeSpecies: r.species,
    coffeeRoastLevel: r.roastLevel,
    coffeeHarvestYear: r.harvestYear,
    coffeeAltitude: r.altitude,
  }));
}

async function fetchSampleRows(
  filters: InsightConfig["filters"],
  scope: AnalyticsScope,
): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.sessionSample.findMany({
    where: { ...(range ? { session: { date: range } } : {}), ...scopedSampleWhere(scope) },
    select: {
      coffee: { select: { country: true, processType: true, harvestYear: true, altitude: true } },
      session: { select: { format: true, date: true } },
      aggregateScore: { select: { communityScore: true } },
    },
  });
  return rows.map((r) => ({
    date: r.session.date,
    coffeeCountry: r.coffee?.country,
    coffeeProcess: r.coffee?.processType,
    coffeeHarvestYear: r.coffee?.harvestYear,
    coffeeAltitude: r.coffee?.altitude,
    sessionFormat: r.session.format,
    communityScore: r.aggregateScore?.communityScore,
  }));
}

const FETCHERS: Record<
  InsightConfig["dataset"],
  (filters: InsightConfig["filters"], scope: AnalyticsScope) => Promise<AnalyticsRow[]>
> = {
  evaluations: fetchEvaluationRows,
  sessions: fetchSessionRows,
  coffees: fetchCoffeeRows,
  samples: fetchSampleRows,
};

const SCORE_BUCKETS = [
  { key: "0", label: "< 70", min: -Infinity, max: 70 },
  { key: "1", label: "70–75", min: 70, max: 75 },
  { key: "2", label: "75–80", min: 75, max: 80 },
  { key: "3", label: "80–85", min: 80, max: 85 },
  { key: "4", label: "85–90", min: 85, max: 90 },
  { key: "5", label: "90+", min: 90, max: Infinity },
] as const;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string, locale: Locale): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

interface BucketRef {
  key: string;
  label: string;
  color?: string;
}

/** Maps a row to the bucket(s) it contributes to. Most dimensions yield 0..1
 *  buckets; flavorDescriptor explodes into many. */
function extractBuckets(
  row: AnalyticsRow,
  dimension: InsightConfig["dimension"],
  locale: Locale,
): BucketRef[] {
  // Free-text fields ("Brasil " vs "Brasil") merge after trimming.
  const scalar = (v: string | null | undefined): BucketRef[] => {
    const trimmed = v?.trim();
    return [
      trimmed
        ? { key: trimmed, label: trimmed }
        : { key: "unknown", label: UNKNOWN_LABEL[locale] },
    ];
  };

  switch (dimension) {
    case "coffeeCountry": {
      // Normalized country ("Col"/"colombia"/"COLOMBIA" → CO); unmatched raw
      // text stays visible as its own bucket, motivating data cleanup.
      const norm = normalizeCountry(row.coffeeCountry);
      if (norm) {
        return [{ key: norm.iso2, label: locale === "en" ? norm.nameEn : norm.nameEs }];
      }
      return scalar(row.coffeeCountry);
    }
    case "coffeeRegion":
      return scalar(row.coffeeRegion);
    case "coffeeProcess": {
      const norm = normalizeProcess(row.coffeeProcess);
      if (norm) return [{ key: norm, label: norm }];
      return scalar(row.coffeeProcess);
    }
    case "coffeeVariety":
      return scalar(row.coffeeVariety);
    case "coffeeSpecies":
      return scalar(row.coffeeSpecies);
    case "coffeeRoastLevel":
      return scalar(row.coffeeRoastLevel);
    case "sessionFormat":
      return scalar(row.sessionFormat);
    case "sessionStatus":
      return scalar(row.sessionStatus);
    case "month":
      if (!row.date) return [];
      return [{ key: monthKey(row.date), label: monthLabel(monthKey(row.date), locale) }];
    case "cupper":
      if (!row.cupperId) return [];
      return [{ key: row.cupperId, label: row.cupperName ?? row.cupperId }];
    case "scoreBucket": {
      const s = row.individualScore;
      if (s == null) return [];
      const bucket = SCORE_BUCKETS.find((b) => s >= b.min && s < b.max);
      return bucket ? [{ key: bucket.key, label: bucket.label }] : [];
    }
    case "flavorDescriptor": {
      if (!row.descriptorBlob) return [];
      return collectDescriptors(row.descriptorBlob, FLAVOR_DESC_KEYS).map((id) => {
        const resolved = resolveDescriptor(id, locale);
        return {
          key: id,
          label: resolved?.label ?? id,
          color: resolved?.color,
        };
      });
    }
    case "blockNariz":
    case "blockBoca":
    case "blockGusto":
    case "blockAcidez":
    case "blockDulzura":
    case "blockSensacion": {
      if (!row.descriptorBlob) return [];
      const block = PERCEPTUAL_BLOCKS.find((b) => b.id === BLOCK_DIMENSION_IDS[dimension]);
      if (!block) return [];
      const ids = collectDescriptors(row.descriptorBlob, block.descKeys);
      return ids.flatMap((id) => {
        const resolved =
          block.kind === "taste" ? resolveMainTaste(id, locale) : resolveDescriptor(id, locale);
        return resolved ? [{ key: id, label: resolved.label, color: resolved.color }] : [];
      });
    }
    case "harvestYear": {
      const year = parseHarvestYear(row.coffeeHarvestYear);
      if (year == null) return [];
      return [{ key: String(year), label: String(year) }];
    }
    case "altitudeBand": {
      const meters = parseAltitudeMeters(row.coffeeAltitude);
      if (meters == null) return [];
      const band = altitudeBand(meters);
      return [{ key: band.key, label: band.label }];
    }
  }
}

/** Block-dimension id → PERCEPTUAL_BLOCKS id. */
const BLOCK_DIMENSION_IDS: Partial<Record<DimensionId, string>> = {
  blockNariz: "nariz",
  blockBoca: "boca",
  blockGusto: "gusto",
  blockAcidez: "acidez",
  blockDulzura: "dulzura",
  blockSensacion: "sensacion",
};

/** Value the measure aggregates over; null contributes nothing to avg/min/max. */
function measureValue(row: AnalyticsRow, measure: InsightConfig["measure"]): number | null {
  switch (measure) {
    case "count":
      return null; // count uses row membership only
    case "avgIndividualScore":
    case "minIndividualScore":
    case "maxIndividualScore":
      return row.individualScore ?? null;
    case "avgAffectiveSum":
      return row.affectiveSum ?? null;
    case "avgCommunityScore":
      return row.communityScore ?? null;
  }
}

interface Accumulator {
  label: string;
  color?: string;
  count: number;
  sum: number;
  n: number;
  min: number;
  max: number;
}

/** Pure group-by + measure over fetched rows. */
export function aggregateRows(
  rows: AnalyticsRow[],
  config: InsightConfig,
  locale: Locale,
): InsightRow[] {
  const buckets = new Map<string, Accumulator>();

  for (const row of rows) {
    const refs = extractBuckets(row, config.dimension, locale);
    if (refs.length === 0) continue;
    const v = measureValue(row, config.measure);

    for (const ref of refs) {
      let acc = buckets.get(ref.key);
      if (!acc) {
        acc = {
          label: ref.label,
          color: ref.color,
          count: 0,
          sum: 0,
          n: 0,
          min: Infinity,
          max: -Infinity,
        };
        buckets.set(ref.key, acc);
      }
      acc.count += 1;
      if (v != null) {
        acc.sum += v;
        acc.n += 1;
        if (v < acc.min) acc.min = v;
        if (v > acc.max) acc.max = v;
      }
    }
  }

  const round2 = (x: number) => Math.round(x * 100) / 100;
  const result: InsightRow[] = [];
  for (const [key, acc] of buckets) {
    let value: number;
    switch (config.measure) {
      case "count":
        value = acc.count;
        break;
      case "avgIndividualScore":
      case "avgAffectiveSum":
      case "avgCommunityScore":
        if (acc.n === 0) continue; // drop buckets with no measurable values
        value = round2(acc.sum / acc.n);
        break;
      case "minIndividualScore":
        if (acc.n === 0) continue;
        value = acc.min;
        break;
      case "maxIndividualScore":
        if (acc.n === 0) continue;
        value = acc.max;
        break;
    }
    result.push({ key, label: acc.label, value, count: acc.count, color: acc.color });
  }

  if (
    config.dimension === "month" ||
    config.dimension === "scoreBucket" ||
    config.dimension === "harvestYear" ||
    config.dimension === "altitudeBand"
  ) {
    result.sort((a, b) => a.key.localeCompare(b.key)); // chronological / band order
  } else {
    result.sort((a, b) => b.value - a.value);
  }

  return result.slice(0, config.limit ?? 20);
}

/** Validated-config entry point shared by the explorer action and the dashboard. */
export async function runInsightQuery(
  config: InsightConfig,
  locale: Locale,
  scope: AnalyticsScope = PLATFORM_SCOPE,
): Promise<InsightRow[]> {
  const rows = await FETCHERS[config.dataset](config.filters, scope);
  return aggregateRows(rows, config, locale);
}

// ── Pivot builder ────────────────────────────────────────────────────────────
// Row×column cross-tab over the same fetch/bucket/measure machinery above.
// Parity guarantee: with `columns: []` (the "__total__" synthetic column),
// runPivotQuery's row axis must produce exactly the same buckets AND exactly
// the same numbers as `aggregateRows` over the same rows/config/locale —
// that's the load-bearing consistency guarantee the UI depends on.

/** Dimensions that sort chronologically/numerically instead of by value. */
const CHRONO_DIMS = new Set<DimensionId>(["month", "scoreBucket", "harvestYear", "altitudeBand"]);

/** Cartesian product of each dim's buckets; [] if ANY dim yields no bucket
 *  for this row (the row contributes nothing on that axis). */
function crossBuckets(dims: DimensionId[], row: AnalyticsRow, locale: Locale): BucketRef[] {
  if (dims.length === 0) return [];
  const perDim = dims.map((d) => extractBuckets(row, d, locale));
  if (perDim.some((options) => options.length === 0)) return [];

  let combos: BucketRef[][] = [[]];
  for (const options of perDim) {
    const next: BucketRef[][] = [];
    for (const combo of combos) {
      for (const opt of options) next.push([...combo, opt]);
    }
    combos = next;
  }

  return combos.map((parts) => ({
    key: parts.map((p) => p.key).join("|"),
    label: parts.map((p) => p.label).join(" · "),
    color: parts[0].color,
  }));
}

interface PivotAccumulator {
  count: number;
  sum: number;
  n: number;
  min: number;
  max: number;
}

function newPivotAcc(): PivotAccumulator {
  return { count: 0, sum: 0, n: 0, min: Infinity, max: -Infinity };
}

function foldPivotAcc(acc: PivotAccumulator, v: number | null): void {
  acc.count += 1;
  if (v != null) {
    acc.sum += v;
    acc.n += 1;
    if (v < acc.min) acc.min = v;
    if (v > acc.max) acc.max = v;
  }
}

function mergePivotAcc(a: PivotAccumulator, b: PivotAccumulator): PivotAccumulator {
  return {
    count: a.count + b.count,
    sum: a.sum + b.sum,
    n: a.n + b.n,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

/** Same finalization/rounding rules as aggregateRows, but null (not a
 *  dropped bucket) when a cell has rows but no measurable value — pivot
 *  cells are grid slots, not a filtered list. */
function finalizePivotCell(acc: PivotAccumulator, measure: MeasureId): { value: number | null; count: number } {
  const round2 = (x: number) => Math.round(x * 100) / 100;
  let value: number | null;
  switch (measure) {
    case "count":
      value = acc.count;
      break;
    case "avgIndividualScore":
    case "avgAffectiveSum":
    case "avgCommunityScore":
      value = acc.n === 0 ? null : round2(acc.sum / acc.n);
      break;
    case "minIndividualScore":
      value = acc.n === 0 ? null : acc.min;
      break;
    case "maxIndividualScore":
      value = acc.n === 0 ? null : acc.max;
      break;
  }
  return { value, count: acc.count };
}

/** Sorts axis keys chronologically (by composite key) when the axis's first
 *  dimension is one of CHRONO_DIMS; otherwise by total value desc, nulls
 *  last, ties broken by count desc — mirrors aggregateRows' ordering rule. */
function orderAxisKeys(
  keys: string[],
  firstDim: DimensionId | undefined,
  totalAccFor: (key: string) => PivotAccumulator,
  measure: MeasureId,
): string[] {
  if (firstDim != null && CHRONO_DIMS.has(firstDim)) {
    return [...keys].sort((a, b) => a.localeCompare(b));
  }
  const finalized = new Map(keys.map((k) => [k, finalizePivotCell(totalAccFor(k), measure)]));
  return [...keys].sort((a, b) => {
    const va = finalized.get(a)!;
    const vb = finalized.get(b)!;
    if (va.value == null && vb.value == null) return vb.count - va.count;
    if (va.value == null) return 1;
    if (vb.value == null) return -1;
    if (vb.value !== va.value) return vb.value - va.value;
    return vb.count - va.count;
  });
}

const PIVOT_TOTAL_COL = "__total__";

export async function runPivotQuery(
  config: PivotConfig,
  locale: Locale,
  scope: AnalyticsScope = PLATFORM_SCOPE,
): Promise<PivotResult> {
  const rows = await FETCHERS[config.dataset](config.filters, scope);

  // cells: rowKey -> colKey -> accumulator
  const cells = new Map<string, Map<string, PivotAccumulator>>();
  const rowLabels = new Map<string, { label: string; color?: string }>();
  const colLabels = new Map<string, { label: string; color?: string }>();
  const hasColumns = config.columns.length > 0;
  const dimensionValueFilters = config.filters?.dimensionValues ?? [];

  for (const row of rows) {
    let excluded = false;
    for (const entry of dimensionValueFilters) {
      const keys = extractBuckets(row, entry.dimension, locale).map((b) => b.key);
      if (!keys.some((k) => entry.values.includes(k))) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    // Sparse row dims (e.g. harvestYear/altitudeBand/flavorDescriptor/month/
    // cupper/scoreBucket/block*) intentionally DROP the record from the
    // cross-tab entirely when no bucket applies — this mirrors aggregateRows'
    // (Simple Explorer) semantics for a missing grouping dimension, so a
    // rows-only pivot stays in parity with it. This is deliberately
    // asymmetric with the columns handling just below.
    const rowRefs = crossBuckets(config.rows, row, locale);
    if (rowRefs.length === 0) continue;

    const colRefs = hasColumns
      ? (() => {
          const refs = crossBuckets(config.columns, row, locale);
          // Unlike rows, a sparse column dim must NOT drop the record from
          // the cross-tab — that would silently under-count row/grand totals
          // with no visual signal. Fall back to the same "unknown"/"Sin
          // dato" bucket scalar dimensions use for a missing value (see
          // `scalar()` in extractBuckets), so it merges naturally with any
          // row that already carries a genuine unknown bucket for the same
          // dimension.
          return refs.length > 0 ? refs : [{ key: "unknown", label: UNKNOWN_LABEL[locale] }];
        })()
      : [{ key: PIVOT_TOTAL_COL, label: "" }];

    const v = measureValue(row, config.measure);

    for (const r of rowRefs) {
      if (!rowLabels.has(r.key)) rowLabels.set(r.key, { label: r.label, color: r.color });
      let colMap = cells.get(r.key);
      if (!colMap) {
        colMap = new Map();
        cells.set(r.key, colMap);
      }
      for (const c of colRefs) {
        if (!colLabels.has(c.key)) colLabels.set(c.key, { label: c.label, color: c.color });
        let acc = colMap.get(c.key);
        if (!acc) {
          acc = newPivotAcc();
          colMap.set(c.key, acc);
        }
        foldPivotAcc(acc, v);
      }
    }
  }

  // Marginal accumulator for one row/col key, optionally restricted to a
  // subset of the other axis's keys (used for the post-trim recompute).
  const rowTotalAcc = (rowKey: string, colFilter?: Set<string>): PivotAccumulator => {
    const colMap = cells.get(rowKey);
    let acc = newPivotAcc();
    if (!colMap) return acc;
    for (const [colKey, cAcc] of colMap) {
      if (colFilter && !colFilter.has(colKey)) continue;
      acc = mergePivotAcc(acc, cAcc);
    }
    return acc;
  };
  const colTotalAcc = (colKey: string, rowFilter?: Set<string>): PivotAccumulator => {
    let acc = newPivotAcc();
    for (const [rowKey, colMap] of cells) {
      if (rowFilter && !rowFilter.has(rowKey)) continue;
      const cAcc = colMap.get(colKey);
      if (cAcc) acc = mergePivotAcc(acc, cAcc);
    }
    return acc;
  };

  const allRowKeys = [...cells.keys()];
  const allColKeySet = new Set<string>();
  for (const colMap of cells.values()) {
    for (const colKey of colMap.keys()) allColKeySet.add(colKey);
  }
  const allColKeys = [...allColKeySet];

  // Parity with aggregateRows: for avg/min/max measures it drops a bucket
  // outright when its accumulator has n===0 (`if (acc.n === 0) continue`) —
  // rows/columns whose only matching records had no measurable value. Apply
  // the same rule here, BEFORE the top-N trim, using each key's full
  // (pre-trim, not restricted to the other axis' kept keys) total
  // accumulator, so a dropped key never consumes a row/column slot and never
  // shows as an all-"—" line the Simple Explorer would never render. Count
  // never drops a key here: every key in cells/allRowKeys/allColKeys already
  // has count > 0 by construction, matching aggregateRows' unconditional
  // `case "count": value = acc.count` (no n-check).
  const rowKeysWithData =
    config.measure === "count" ? allRowKeys : allRowKeys.filter((k) => rowTotalAcc(k).n > 0);
  const colKeysWithData =
    config.measure === "count" ? allColKeys : allColKeys.filter((k) => colTotalAcc(k).n > 0);

  const orderedRowKeys = orderAxisKeys(
    rowKeysWithData,
    config.rows[0],
    (k) => rowTotalAcc(k),
    config.measure,
  );
  const orderedColKeys = orderAxisKeys(
    colKeysWithData,
    hasColumns ? config.columns[0] : undefined,
    (k) => colTotalAcc(k),
    config.measure,
  );

  const rowLimit = config.rowLimit ?? 30;
  const colLimit = config.colLimit ?? 12;
  const keptRowKeys = orderedRowKeys.slice(0, rowLimit);
  const keptColKeys = orderedColKeys.slice(0, colLimit);
  const keptRowSet = new Set(keptRowKeys);
  const keptColSet = new Set(keptColKeys);

  const finalCells: PivotResult["cells"] = {};
  for (const rowKey of keptRowKeys) {
    const colMap = cells.get(rowKey);
    if (!colMap) continue;
    const rowOut: Record<string, { value: number | null; count: number }> = {};
    for (const colKey of keptColKeys) {
      const acc = colMap.get(colKey);
      if (!acc) continue;
      rowOut[colKey] = finalizePivotCell(acc, config.measure);
    }
    if (Object.keys(rowOut).length > 0) finalCells[rowKey] = rowOut;
  }

  // Totals are recomputed from the KEPT cell accumulators (not the
  // finalized per-cell values, and not the pre-trim totals used for
  // ordering above) so displayed totals always equal the sum of what's
  // actually shown, including for avg/min/max measures.
  const rowTotals: PivotResult["rowTotals"] = {};
  for (const rowKey of keptRowKeys) {
    rowTotals[rowKey] = finalizePivotCell(rowTotalAcc(rowKey, keptColSet), config.measure);
  }
  const colTotals: PivotResult["colTotals"] = {};
  for (const colKey of keptColKeys) {
    colTotals[colKey] = finalizePivotCell(colTotalAcc(colKey, keptRowSet), config.measure);
  }
  let grandAcc = newPivotAcc();
  for (const rowKey of keptRowKeys) {
    grandAcc = mergePivotAcc(grandAcc, rowTotalAcc(rowKey, keptColSet));
  }
  const grandTotal = finalizePivotCell(grandAcc, config.measure);

  const rowKeysOut: PivotAxisKey[] = keptRowKeys.map((k) => {
    const l = rowLabels.get(k)!;
    return { key: k, label: l.label, color: l.color };
  });
  const colKeysOut: PivotAxisKey[] = keptColKeys.map((k) => {
    const l = colLabels.get(k)!;
    return { key: k, label: l.label, color: l.color };
  });

  return {
    measure: config.measure,
    rowKeys: rowKeysOut,
    colKeys: colKeysOut,
    cells: finalCells,
    rowTotals,
    colTotals,
    grandTotal,
  };
}

/** All distinct bucket values for one dimension, across the full (unfiltered)
 *  dataset — powers the pivot builder's "filter by value" picker. */
export async function listDimensionValues(
  dataset: Dataset,
  dimension: DimensionId,
  locale: Locale,
  scope: AnalyticsScope = PLATFORM_SCOPE,
): Promise<PivotAxisKey[]> {
  const rows = await FETCHERS[dataset](undefined, scope);
  const counts = new Map<string, { label: string; color?: string; count: number }>();
  for (const row of rows) {
    for (const ref of extractBuckets(row, dimension, locale)) {
      const existing = counts.get(ref.key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(ref.key, { label: ref.label, color: ref.color, count: 1 });
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 200)
    .map(([key, v]) => ({ key, label: v.label, color: v.color }));
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardData {
  coffeesRegistered: number;
  coffeesCupped: number;
  sessionsTotal: number;
  sessionsByStatus: Record<string, number>;
  evaluationsSubmitted: number;
  totalUsers: number;
  activeCuppers30d: number;
  avgIndividualScore: number | null;
  avgCommunityScore: number | null;
  monthlyTrend: { key: string; label: string; evaluations: number; sessions: number }[];
  topOrigins: InsightRow[];
  topProcesses: InsightRow[];
  scoreDistribution: InsightRow[];
  topDescriptors: InsightRow[];
}

export async function getDashboardData(
  locale: Locale,
  scope: AnalyticsScope = PLATFORM_SCOPE,
): Promise<DashboardData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const insight = (cfg: Omit<InsightConfig, "chartType">) =>
    runInsightQuery({ ...cfg, chartType: "bar" }, locale, scope);

  const [
    coffeesRegistered,
    cuppedCoffeeIds,
    sessionsTotal,
    sessionsByStatusRaw,
    evaluationsSubmitted,
    totalUsers,
    activeCupperIds,
    avgIndividual,
    avgCommunity,
    recentEvaluations,
    recentSessions,
    topOrigins,
    topProcesses,
    scoreDistribution,
    topDescriptors,
  ] = await Promise.all([
    prisma.coffee.count({ where: scopedCoffeeWhere(scope) }),
    prisma.sessionSample.findMany({
      where: { coffeeId: { not: null }, ...scopedSampleWhere(scope) },
      select: { coffeeId: true },
      distinct: ["coffeeId"],
    }),
    prisma.cuppingSession.count({ where: scopedSessionWhere(scope) }),
    prisma.cuppingSession.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: scopedSessionWhere(scope),
    }),
    prisma.evaluation.count({ where: { isDraft: false, ...scopedEvaluationWhere(scope) } }),
    // Platform: registered profiles. Scoped: distinct cuppers this user's
    // data actually contains (their sessions' participants + themselves).
    scope.kind === "platform"
      ? prisma.profile.count()
      : prisma.evaluation
          .findMany({
            where: { isDraft: false, ...scopedEvaluationWhere(scope) },
            select: { cupperId: true },
            distinct: ["cupperId"],
          })
          .then((rows) => rows.length),
    prisma.evaluation.findMany({
      where: {
        isDraft: false,
        submittedAt: { gte: thirtyDaysAgo },
        ...scopedEvaluationWhere(scope),
      },
      select: { cupperId: true },
      distinct: ["cupperId"],
    }),
    prisma.evaluation.aggregate({
      _avg: { individualScore: true },
      where: { isDraft: false, individualScore: { not: null }, ...scopedEvaluationWhere(scope) },
    }),
    prisma.aggregateScore.aggregate({
      _avg: { communityScore: true },
      where: {
        communityScore: { not: null },
        ...(scope.kind === "user" ? { sessionSample: scopedSampleWhere(scope) } : {}),
      },
    }),
    prisma.evaluation.findMany({
      where: {
        isDraft: false,
        submittedAt: { gte: twelveMonthsAgo },
        ...scopedEvaluationWhere(scope),
      },
      select: { submittedAt: true },
    }),
    prisma.cuppingSession.findMany({
      where: { date: { gte: twelveMonthsAgo }, ...scopedSessionWhere(scope) },
      select: { date: true },
    }),
    insight({ dataset: "samples", dimension: "coffeeCountry", measure: "count", limit: 10 }),
    insight({ dataset: "samples", dimension: "coffeeProcess", measure: "count", limit: 10 }),
    insight({ dataset: "evaluations", dimension: "scoreBucket", measure: "count", limit: 10 }),
    insight({ dataset: "evaluations", dimension: "flavorDescriptor", measure: "count", limit: 15 }),
  ]);

  // Fill the full 12-month range so the trend line has no gaps.
  const evalByMonth = new Map<string, number>();
  for (const e of recentEvaluations) {
    if (!e.submittedAt) continue;
    const k = monthKey(e.submittedAt);
    evalByMonth.set(k, (evalByMonth.get(k) ?? 0) + 1);
  }
  const sessionsByMonth = new Map<string, number>();
  for (const s of recentSessions) {
    const k = monthKey(s.date);
    sessionsByMonth.set(k, (sessionsByMonth.get(k) ?? 0) + 1);
  }
  const monthlyTrend: DashboardData["monthlyTrend"] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(twelveMonthsAgo.getUTCFullYear(), twelveMonthsAgo.getUTCMonth() + i, 1));
    const k = monthKey(d);
    monthlyTrend.push({
      key: k,
      label: monthLabel(k, locale),
      evaluations: evalByMonth.get(k) ?? 0,
      sessions: sessionsByMonth.get(k) ?? 0,
    });
  }

  const sessionsByStatus: Record<string, number> = {};
  for (const g of sessionsByStatusRaw) sessionsByStatus[g.status] = g._count._all;

  const round2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);

  return {
    coffeesRegistered,
    coffeesCupped: cuppedCoffeeIds.length,
    sessionsTotal,
    sessionsByStatus,
    evaluationsSubmitted,
    totalUsers,
    activeCuppers30d: activeCupperIds.length,
    avgIndividualScore: round2(avgIndividual._avg.individualScore),
    avgCommunityScore: round2(avgCommunity._avg.communityScore),
    monthlyTrend,
    topOrigins,
    topProcesses,
    scoreDistribution,
    topDescriptors,
  };
}

// ---------------------------------------------------------------------------
// Session lookup for the AI chat (get_session_summary tool).
// Aggregates and labels ONLY — never evaluation JSON, notes, or user
// identities. lib/ai/chatTypes.ts mirrors these shapes for client code.

export interface SessionCandidate {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  status: string;
  format: string;
  isGroup: boolean;
  sampleCount: number;
  participantCount: number;
}

export interface SessionSampleSummary {
  label: string;
  position: number;
  revealed: boolean;
  coffeeName: string | null;
  communityScore: number | null;
  avgRawScore: number | null;
  submittedCount: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
}

export interface SessionSummary extends SessionCandidate {
  cupsPerSample: number;
  /** Distinct cuppers with a submitted (non-draft) evaluation. */
  submittedCupperCount: number;
  samples: SessionSampleSummary[];
}

/**
 * Resolves a cupping session by (partial, case-insensitive) name — or exactly
 * by id — and returns either a candidate list (several matches, or none) or
 * the full aggregated summary of the single match. Community/average figures
 * come from the trigger-authoritative aggregate_scores rows.
 */
export async function getSessionSummaries(
  nameQuery: string,
  sessionId?: string,
  scope: AnalyticsScope = PLATFORM_SCOPE,
): Promise<{ candidates: SessionCandidate[] } | { summary: SessionSummary }> {
  const select = {
    id: true,
    name: true,
    date: true,
    status: true,
    format: true,
    isGroup: true,
    cupsPerSample: true,
    _count: { select: { samples: true, participants: true } },
  } as const;

  // The scope filter applies to BOTH paths — a scoped user must not be able
  // to fetch someone else's session by guessing its id.
  const matches = sessionId
    ? await prisma.cuppingSession.findMany({
        where: { id: sessionId, ...scopedSessionWhere(scope) },
        select,
      })
    : await prisma.cuppingSession.findMany({
        where: {
          name: { contains: nameQuery, mode: "insensitive" },
          ...scopedSessionWhere(scope),
        },
        orderBy: { date: "desc" },
        take: 5,
        select,
      });

  const toCandidate = (s: (typeof matches)[number]): SessionCandidate => ({
    id: s.id,
    name: s.name,
    date: s.date.toISOString().slice(0, 10),
    status: s.status,
    format: s.format,
    isGroup: s.isGroup,
    sampleCount: s._count.samples,
    participantCount: s._count.participants,
  });

  if (matches.length !== 1) return { candidates: matches.map(toCandidate) };

  const s = matches[0];
  const round2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100);

  const [samples, submittedCuppers] = await Promise.all([
    prisma.sessionSample.findMany({
      where: { sessionId: s.id },
      orderBy: { position: "asc" },
      select: {
        label: true,
        position: true,
        revealed: true,
        coffee: { select: { name: true } },
        aggregateScore: {
          select: {
            communityScore: true,
            avgRawScore: true,
            submittedCount: true,
            totalCups: true,
            totalNonUniform: true,
            totalDefective: true,
          },
        },
      },
    }),
    prisma.evaluation.findMany({
      where: { sessionSample: { sessionId: s.id }, isDraft: false },
      select: { cupperId: true },
      distinct: ["cupperId"],
    }),
  ]);

  return {
    summary: {
      ...toCandidate(s),
      cupsPerSample: s.cupsPerSample,
      submittedCupperCount: submittedCuppers.length,
      samples: samples.map((sm) => ({
        label: sm.label,
        position: sm.position,
        revealed: sm.revealed,
        coffeeName: sm.coffee?.name ?? null,
        communityScore: round2(sm.aggregateScore?.communityScore),
        avgRawScore: round2(sm.aggregateScore?.avgRawScore),
        submittedCount: sm.aggregateScore?.submittedCount ?? 0,
        totalCups: sm.aggregateScore?.totalCups ?? 0,
        totalNonUniform: sm.aggregateScore?.totalNonUniform ?? 0,
        totalDefective: sm.aggregateScore?.totalDefective ?? 0,
      })),
    },
  };
}

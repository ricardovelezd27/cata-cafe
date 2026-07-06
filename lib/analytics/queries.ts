import "server-only";
import { prisma } from "@/lib/prisma";
import {
  FLAVOR_DESC_KEYS,
  collectDescriptors,
  resolveDescriptor,
} from "@/lib/descriptors";
import type { InsightConfig, InsightRow } from "./types";

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

async function fetchEvaluationRows(filters: InsightConfig["filters"]): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.evaluation.findMany({
    where: { isDraft: false, ...(range ? { submittedAt: range } : {}) },
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
            select: { country: true, region: true, processType: true, variety: true },
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

async function fetchSessionRows(filters: InsightConfig["filters"]): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.cuppingSession.findMany({
    where: range ? { date: range } : undefined,
    select: { format: true, status: true, date: true },
  });
  return rows.map((r) => ({
    date: r.date,
    sessionFormat: r.format,
    sessionStatus: r.status,
  }));
}

async function fetchCoffeeRows(filters: InsightConfig["filters"]): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.coffee.findMany({
    where: range ? { createdAt: range } : undefined,
    select: {
      country: true,
      region: true,
      processType: true,
      variety: true,
      species: true,
      roastLevel: true,
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
  }));
}

async function fetchSampleRows(filters: InsightConfig["filters"]): Promise<AnalyticsRow[]> {
  const range = dateRange(filters);
  const rows = await prisma.sessionSample.findMany({
    where: range ? { session: { date: range } } : undefined,
    select: {
      coffee: { select: { country: true, processType: true } },
      session: { select: { format: true, date: true } },
      aggregateScore: { select: { communityScore: true } },
    },
  });
  return rows.map((r) => ({
    date: r.session.date,
    coffeeCountry: r.coffee?.country,
    coffeeProcess: r.coffee?.processType,
    sessionFormat: r.session.format,
    communityScore: r.aggregateScore?.communityScore,
  }));
}

const FETCHERS: Record<
  InsightConfig["dataset"],
  (filters: InsightConfig["filters"]) => Promise<AnalyticsRow[]>
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
    case "coffeeCountry":
      return scalar(row.coffeeCountry);
    case "coffeeRegion":
      return scalar(row.coffeeRegion);
    case "coffeeProcess":
      return scalar(row.coffeeProcess);
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
  }
}

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

  if (config.dimension === "month" || config.dimension === "scoreBucket") {
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
): Promise<InsightRow[]> {
  const rows = await FETCHERS[config.dataset](config.filters);
  return aggregateRows(rows, config, locale);
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

export async function getDashboardData(locale: Locale): Promise<DashboardData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const insight = (cfg: Omit<InsightConfig, "chartType">) =>
    runInsightQuery({ ...cfg, chartType: "bar" }, locale);

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
    prisma.coffee.count(),
    prisma.sessionSample.findMany({
      where: { coffeeId: { not: null } },
      select: { coffeeId: true },
      distinct: ["coffeeId"],
    }),
    prisma.cuppingSession.count(),
    prisma.cuppingSession.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.evaluation.count({ where: { isDraft: false } }),
    prisma.profile.count(),
    prisma.evaluation.findMany({
      where: { isDraft: false, submittedAt: { gte: thirtyDaysAgo } },
      select: { cupperId: true },
      distinct: ["cupperId"],
    }),
    prisma.evaluation.aggregate({
      _avg: { individualScore: true },
      where: { isDraft: false, individualScore: { not: null } },
    }),
    prisma.aggregateScore.aggregate({
      _avg: { communityScore: true },
      where: { communityScore: { not: null } },
    }),
    prisma.evaluation.findMany({
      where: { isDraft: false, submittedAt: { gte: twelveMonthsAgo } },
      select: { submittedAt: true },
    }),
    prisma.cuppingSession.findMany({
      where: { date: { gte: twelveMonthsAgo } },
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

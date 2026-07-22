import "server-only";
import { prisma } from "@/lib/prisma";
import {
  COFFEE_COUNTRIES,
  countryDisplayName,
  normKey,
  normalizeCountry,
  normalizeProcess,
} from "./normalize";
import { PROCESS_TYPES } from "@/lib/constants";

type Locale = "es" | "en";

// Benchmark comparisons pit our CVA evaluations against the CQI arabica
// dataset (benchmark_lots). The two methodologies differ (CVA affective score
// vs. SCA total cup points) — every consumer must surface the methodology
// caveat; this module only computes the numbers.

export interface BenchmarkFilter {
  /** ISO2, from COFFEE_COUNTRIES. */
  countryCode?: string;
  /** Canonical PROCESS_TYPES value. */
  processType?: string;
  /** normKey() of the variety text. */
  variety?: string;
}

/** Whitelist validation of an untrusted benchmark filter (same spirit as parseInsightConfig). */
export function parseBenchmarkFilter(input: unknown): BenchmarkFilter {
  if (typeof input !== "object" || input === null) throw new Error("invalid_filter");
  const raw = input as Record<string, unknown>;
  const filter: BenchmarkFilter = {};
  if (raw.countryCode !== undefined && raw.countryCode !== "") {
    if (
      typeof raw.countryCode !== "string" ||
      !COFFEE_COUNTRIES.some((c) => c.iso2 === raw.countryCode)
    ) {
      throw new Error("invalid_filter");
    }
    filter.countryCode = raw.countryCode;
  }
  if (raw.processType !== undefined && raw.processType !== "") {
    if (
      typeof raw.processType !== "string" ||
      !(PROCESS_TYPES as readonly string[]).includes(raw.processType)
    ) {
      throw new Error("invalid_filter");
    }
    filter.processType = raw.processType;
  }
  if (raw.variety !== undefined && raw.variety !== "") {
    if (typeof raw.variety !== "string" || raw.variety.length > 80) {
      throw new Error("invalid_filter");
    }
    filter.variety = raw.variety;
  }
  return filter;
}

export interface BenchmarkComparison {
  mine: { n: number; avg: number | null; min: number | null; max: number | null };
  benchmark: { n: number; avg: number | null; p25: number | null; p75: number | null };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Nearest-rank percentile over a pre-sorted ascending array. */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return round2(sortedAsc[idx]);
}

interface MyEvaluationRow {
  individualScore: number;
  countryCode: string | null;
  processType: string | null;
  varietyKey: string | null;
  varietyRaw: string | null;
  year: number | null;
}

/** Submitted, scored evaluations with normalized coffee metadata. */
async function fetchMyRows(): Promise<MyEvaluationRow[]> {
  const rows = await prisma.evaluation.findMany({
    where: { isDraft: false, individualScore: { not: null } },
    select: {
      individualScore: true,
      submittedAt: true,
      sessionSample: {
        select: {
          coffee: { select: { country: true, processType: true, variety: true } },
        },
      },
    },
  });
  return rows.map((r) => {
    const coffee = r.sessionSample.coffee;
    const variety = coffee?.variety?.trim() || null;
    return {
      individualScore: r.individualScore as number,
      countryCode: normalizeCountry(coffee?.country)?.iso2 ?? null,
      processType: normalizeProcess(coffee?.processType),
      varietyKey: variety ? normKey(variety) : null,
      varietyRaw: variety,
      year: r.submittedAt ? r.submittedAt.getUTCFullYear() : null,
    };
  });
}

function matchesFilter(
  row: { countryCode: string | null; processType: string | null; varietyKey: string | null },
  filter: BenchmarkFilter,
): boolean {
  if (filter.countryCode && row.countryCode !== filter.countryCode) return false;
  if (filter.processType && row.processType !== filter.processType) return false;
  if (filter.variety && row.varietyKey !== filter.variety) return false;
  return true;
}

export async function getBenchmarkComparison(
  filter: BenchmarkFilter,
): Promise<BenchmarkComparison> {
  const [myRows, lots] = await Promise.all([
    fetchMyRows(),
    prisma.benchmarkLot.findMany({
      where: {
        source: "cqi_arabica",
        ...(filter.countryCode ? { countryCode: filter.countryCode } : {}),
        ...(filter.processType ? { processType: filter.processType } : {}),
      },
      select: { totalCupPoints: true, variety: true },
    }),
  ]);

  const mine = myRows.filter((r) => matchesFilter(r, filter)).map((r) => r.individualScore);
  const bench = lots
    .filter((l) => {
      if (!filter.variety) return true;
      const v = l.variety?.trim();
      return v ? normKey(v) === filter.variety : false;
    })
    .map((l) => l.totalCupPoints)
    .sort((a, b) => a - b);

  const avg = (xs: number[]) =>
    xs.length === 0 ? null : round2(xs.reduce((s, x) => s + x, 0) / xs.length);

  return {
    mine: {
      n: mine.length,
      avg: avg(mine),
      min: mine.length ? round2(Math.min(...mine)) : null,
      max: mine.length ? round2(Math.max(...mine)) : null,
    },
    benchmark: {
      n: bench.length,
      avg: avg(bench),
      p25: percentile(bench, 25),
      p75: percentile(bench, 75),
    },
  };
}

export interface BenchmarkSlices {
  countries: { iso2: string; label: string }[];
  processes: string[];
  varieties: { key: string; label: string }[];
}

/** Picker values present in BOTH our evaluated data and the CQI dataset. */
export async function listBenchmarkSlices(locale: Locale): Promise<BenchmarkSlices> {
  const [myRows, lots] = await Promise.all([
    fetchMyRows(),
    prisma.benchmarkLot.findMany({
      where: { source: "cqi_arabica" },
      select: { countryCode: true, processType: true, variety: true },
    }),
  ]);

  const benchCountries = new Set(lots.map((l) => l.countryCode).filter(Boolean) as string[]);
  const benchProcesses = new Set(lots.map((l) => l.processType).filter(Boolean) as string[]);
  const benchVarieties = new Set(
    lots.map((l) => (l.variety?.trim() ? normKey(l.variety.trim()) : null)).filter(Boolean) as string[],
  );

  const countries = new Map<string, string>();
  const processes = new Set<string>();
  const varieties = new Map<string, string>();
  for (const r of myRows) {
    if (r.countryCode && benchCountries.has(r.countryCode)) {
      countries.set(r.countryCode, countryDisplayName(r.countryCode, locale) ?? r.countryCode);
    }
    if (r.processType && benchProcesses.has(r.processType)) processes.add(r.processType);
    if (r.varietyKey && r.varietyRaw && benchVarieties.has(r.varietyKey)) {
      if (!varieties.has(r.varietyKey)) varieties.set(r.varietyKey, r.varietyRaw);
    }
  }

  return {
    countries: [...countries.entries()]
      .map(([iso2, label]) => ({ iso2, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    processes: [...processes].sort(),
    varieties: [...varieties.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export interface OriginContext {
  countryCode: string;
  countryName: string;
  /** OWID/FAO production series, tonnes, ascending years. */
  production: { year: number; value: number }[];
  /** Our cupping activity for that origin by calendar year. */
  myActivity: { year: number; evaluations: number; avgScore: number | null }[];
}

const ORIGIN_CONTEXT_YEARS = 30;

export async function getOriginContext(
  countryCode: string,
  locale: Locale,
): Promise<OriginContext> {
  const sinceYear = new Date().getUTCFullYear() - ORIGIN_CONTEXT_YEARS;
  const [series, myRows] = await Promise.all([
    prisma.referenceSeries.findMany({
      where: {
        source: "owid_fao",
        metric: "production",
        countryCode,
        year: { gte: sinceYear },
      },
      orderBy: { year: "asc" },
      select: { year: true, value: true },
    }),
    fetchMyRows(),
  ]);

  const byYear = new Map<number, { count: number; sum: number }>();
  for (const r of myRows) {
    if (r.countryCode !== countryCode || r.year == null) continue;
    const acc = byYear.get(r.year) ?? { count: 0, sum: 0 };
    acc.count += 1;
    acc.sum += r.individualScore;
    byYear.set(r.year, acc);
  }

  return {
    countryCode,
    countryName: countryDisplayName(countryCode, locale) ?? countryCode,
    production: series.map((s) => ({ year: s.year, value: s.value })),
    myActivity: [...byYear.entries()]
      .map(([year, acc]) => ({
        year,
        evaluations: acc.count,
        avgScore: acc.count ? round2(acc.sum / acc.count) : null,
      }))
      .sort((a, b) => a.year - b.year),
  };
}

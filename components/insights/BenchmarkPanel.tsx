"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { runBenchmark } from "@/app/actions/analytics";
import type { BenchmarkComparison, BenchmarkSlices } from "@/lib/analytics/benchmarks";

export interface BenchmarkTranslations {
  country: string;
  process: string;
  variety: string;
  all: string;
  mineTitle: string;
  benchmarkTitle: string;
  evaluations: string;
  lots: string;
  avg: string;
  range: string;
  p25p75: string;
  methodologyNote: string;
  empty: string;
}

interface BenchmarkPanelProps {
  slices: BenchmarkSlices;
  initialComparison: BenchmarkComparison;
  t: BenchmarkTranslations;
}

const selectClass =
  "w-full rounded-input border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";

// Comparison bars are scaled against a fixed CVA/SCA score band rather than
// 0–100 — scores below 60 essentially never occur, so a 60–100 scale keeps
// the visual difference between "mine" and "benchmark" legible.
const SCALE_MIN = 60;
const SCALE_MAX = 100;

function fmtScore(n: number | null, digits = 2): string {
  return n == null ? "—" : n.toFixed(digits);
}

function barPercent(value: number | null): number {
  if (value == null) return 0;
  const pct = ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
  return Math.min(100, Math.max(2, pct));
}

/**
 * Country/process/variety filter for comparing this account's CVA scores
 * against the CQI arabica benchmark dataset. Filters are validated
 * server-side by app/actions/analytics.ts (runBenchmark); this component
 * only ever sends values that came from the server-computed slices.
 */
export function BenchmarkPanel({ slices, initialComparison, t }: BenchmarkPanelProps) {
  const [countryCode, setCountryCode] = useState("");
  const [processType, setProcessType] = useState("");
  const [variety, setVariety] = useState("");
  const [comparison, setComparison] = useState<BenchmarkComparison>(initialComparison);
  const [isPending, startTransition] = useTransition();

  function refresh(next: { countryCode: string; processType: string; variety: string }) {
    startTransition(async () => {
      const result = await runBenchmark(next);
      // On error, keep showing the last-good comparison rather than blanking it.
      if (result.ok) setComparison(result.comparison);
    });
  }

  function onCountryChange(value: string) {
    setCountryCode(value);
    refresh({ countryCode: value, processType, variety });
  }

  function onProcessChange(value: string) {
    setProcessType(value);
    refresh({ countryCode, processType: value, variety });
  }

  function onVarietyChange(value: string) {
    setVariety(value);
    refresh({ countryCode, processType, variety: value });
  }

  const { mine, benchmark } = comparison;
  const showEmpty = mine.n === 0 || benchmark.n === 0;

  return (
    <section className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.country}
            </span>
            <select
              className={selectClass}
              value={countryCode}
              onChange={(e) => onCountryChange(e.target.value)}
            >
              <option value="">{t.all}</option>
              {slices.countries.map((c) => (
                <option key={c.iso2} value={c.iso2}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.process}
            </span>
            <select
              className={selectClass}
              value={processType}
              onChange={(e) => onProcessChange(e.target.value)}
            >
              <option value="">{t.all}</option>
              {slices.processes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.variety}
            </span>
            <select
              className={selectClass}
              value={variety}
              onChange={(e) => onVarietyChange(e.target.value)}
            >
              <option value="">{t.all}</option>
              {slices.varieties.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isPending && (
          <Loader2 size={16} className="animate-spin text-brown-mid shrink-0 mt-2.5" aria-hidden />
        )}
      </div>

      {showEmpty ? (
        <div className="text-sm text-brown-mid py-8 text-center">{t.empty}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <StatBlock
              title={t.mineTitle}
              n={mine.n}
              nLabel={t.evaluations}
              avgLabel={t.avg}
              avg={mine.avg}
              color="#3D5A3E"
              subLabel={t.range}
              subValue={`${fmtScore(mine.min)}–${fmtScore(mine.max)}`}
            />
            <StatBlock
              title={t.benchmarkTitle}
              n={benchmark.n}
              nLabel={t.lots}
              avgLabel={t.avg}
              avg={benchmark.avg}
              color="#C17817"
              subLabel={t.p25p75}
              subValue={`${fmtScore(benchmark.p25)}–${fmtScore(benchmark.p75)}`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <ComparisonBar label={t.mineTitle} value={mine.avg} color="#3D5A3E" />
            <ComparisonBar label={t.benchmarkTitle} value={benchmark.avg} color="#C17817" />
          </div>
        </>
      )}

      <p className="text-[11px] text-brown-mid/70 leading-relaxed mt-4">{t.methodologyNote}</p>
    </section>
  );
}

function StatBlock({
  title,
  n,
  nLabel,
  avgLabel,
  avg,
  color,
  subLabel,
  subValue,
}: {
  title: string;
  n: number;
  nLabel: string;
  avgLabel: string;
  avg: number | null;
  color: string;
  subLabel: string;
  subValue: string;
}) {
  return (
    <div className="rounded-card border border-[#E8E0D0] bg-[#FAF7F0] p-4 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
          {title}
        </span>
        <span className="text-[11px] text-brown-mid whitespace-nowrap">
          {n} {nLabel}
        </span>
      </div>
      <span className="text-[10px] text-brown-mid uppercase tracking-wide mt-2">{avgLabel}</span>
      <span className="font-display text-3xl leading-none" style={{ color }}>
        {fmtScore(avg)}
      </span>
      <span className="text-xs text-brown-mid mt-1">
        {subLabel}: {subValue}
      </span>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-brown-dark truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-[#F5F0E6] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm"
          style={{ width: `${barPercent(value)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-semibold text-brown-dark tabular-nums">
        {fmtScore(value)}
      </span>
    </div>
  );
}

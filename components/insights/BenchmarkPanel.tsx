"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { runBenchmark } from "@/app/actions/analytics";
import { useActionFeedback } from "@/components/ui/Toast";
import type { BenchmarkComparison, BenchmarkSlices } from "@/lib/analytics/benchmarks";
import { cardClasses } from "@/components/ui/cardRecipe";

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
  "w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body text-on-surface focus:border-primary-container";

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
  const feedback = useActionFeedback();

  function refresh(next: { countryCode: string; processType: string; variety: string }) {
    startTransition(async () => {
      // On error, keep showing the last-good comparison rather than blanking it.
      await feedback.run(runBenchmark(next), (data) => setComparison(data));
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
    <section className={cardClasses()}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <label className="flex flex-col gap-1">
            <span className="label-caps">
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
            <span className="label-caps">
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
            <span className="label-caps">
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
          <Loader2 size={16} className="animate-spin text-on-surface-variant shrink-0 mt-2.5" aria-hidden />
        )}
      </div>

      {showEmpty ? (
        <div className="text-caption text-on-surface-variant py-8 text-center">{t.empty}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <StatBlock
              title={t.mineTitle}
              n={mine.n}
              nLabel={t.evaluations}
              avgLabel={t.avg}
              avg={mine.avg}
              color="var(--color-primary-container)"
              subLabel={t.range}
              subValue={`${fmtScore(mine.min)}–${fmtScore(mine.max)}`}
            />
            <StatBlock
              title={t.benchmarkTitle}
              n={benchmark.n}
              nLabel={t.lots}
              avgLabel={t.avg}
              avg={benchmark.avg}
              color="var(--color-secondary)"
              subLabel={t.p25p75}
              subValue={`${fmtScore(benchmark.p25)}–${fmtScore(benchmark.p75)}`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <ComparisonBar label={t.mineTitle} value={mine.avg} color="var(--color-primary-container)" />
            <ComparisonBar label={t.benchmarkTitle} value={benchmark.avg} color="var(--color-secondary)" />
          </div>
        </>
      )}

      <p className="text-caption text-on-surface-variant/70 leading-relaxed mt-4">{t.methodologyNote}</p>
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
    <div className="rounded-card border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps">
          {title}
        </span>
        <span className="text-caption text-on-surface-variant whitespace-nowrap">
          {n} {nLabel}
        </span>
      </div>
      <span className="label-caps mt-2">{avgLabel}</span>
      <span className="font-display text-page leading-none" style={{ color }}>
        {fmtScore(avg)}
      </span>
      <span className="text-caption text-on-surface-variant mt-1">
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
      <span className="w-32 shrink-0 text-caption text-on-surface truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-surface-container rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm"
          style={{ width: `${barPercent(value)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-caption font-semibold text-on-surface tabular-nums">
        {fmtScore(value)}
      </span>
    </div>
  );
}

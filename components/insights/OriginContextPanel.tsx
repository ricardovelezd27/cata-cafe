"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { runOriginContext } from "@/app/actions/analytics";
import type { OriginContext } from "@/lib/analytics/benchmarks";

const CHART_HEIGHT = 280;
const GREEN = "#3D5A3E";
const AMBER = "#C17817";
const GRID = "#E8E0D0";
const AXIS_TEXT = "#8B7355";

export interface OriginContextTranslations {
  title: string;
  country: string;
  production: string;
  myActivity: string;
  avgScore: string;
  empty: string;
}

interface OriginContextPanelProps {
  locale: string;
  countries: { iso2: string; label: string }[];
  initialCountryCode: string | null;
  initialContext: OriginContext | null;
  t: OriginContextTranslations;
}

const selectClass =
  "w-full rounded-input border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";

interface OriginRow {
  year: number;
  production: number | null;
  evaluations: number | null;
}

/**
 * Production (tonnes, left axis, line) vs. our own cupping activity (count,
 * right axis, bars) for a single origin country. Uses useContainerWidth +
 * explicit chart width instead of Recharts ResponsiveContainer — see
 * hooks/useContainerWidth.ts for why (iOS Safari ResizeObserver bug).
 */
export function OriginContextPanel({
  locale,
  countries,
  initialCountryCode,
  initialContext,
  t,
}: OriginContextPanelProps) {
  const [countryCode, setCountryCode] = useState(initialCountryCode ?? "");
  const [context, setContext] = useState<OriginContext | null>(initialContext);
  const [isPending, startTransition] = useTransition();
  const { ref, width } = useContainerWidth();

  function onCountryChange(next: string) {
    setCountryCode(next);
    startTransition(async () => {
      const result = await runOriginContext(next, locale);
      // On error, keep showing the last-good context rather than blanking it.
      if (result.ok) setContext(result.context);
    });
  }

  const production = context?.production ?? [];
  const myActivity = context?.myActivity ?? [];
  const activityByYear = new Map(myActivity.map((a) => [a.year, a]));
  const years = Array.from(
    new Set([...production.map((p) => p.year), ...myActivity.map((a) => a.year)]),
  ).sort((a, b) => a - b);
  const rows: OriginRow[] = years.map((year) => ({
    year,
    production: production.find((p) => p.year === year)?.value ?? null,
    evaluations: activityByYear.get(year)?.evaluations ?? null,
  }));

  const scoreLines: string[] = [];
  for (const a of myActivity) {
    if (a.avgScore != null) scoreLines.push(`${a.year}: ${a.avgScore.toFixed(2)}`);
  }

  return (
    <section className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-brown-dark">{t.title}</h2>
        {isPending && <Loader2 size={16} className="animate-spin text-brown-mid" aria-hidden />}
      </div>

      {countries.length === 0 ? (
        <div className="text-sm text-brown-mid py-8 text-center">{t.empty}</div>
      ) : (
        <>
          <label className="flex flex-col gap-1 max-w-xs mb-5">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.country}
            </span>
            <select
              className={selectClass}
              value={countryCode}
              onChange={(e) => onCountryChange(e.target.value)}
            >
              {countries.map((c) => (
                <option key={c.iso2} value={c.iso2}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {production.length === 0 ? (
            <div className="text-sm text-brown-mid py-8 text-center">{t.empty}</div>
          ) : (
            <>
              <div ref={ref} className="w-full">
                {width > 0 && (
                  <ComposedChart
                    width={width}
                    height={CHART_HEIGHT}
                    data={rows}
                    margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: AXIS_TEXT }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: AXIS_TEXT }} width={44} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10, fill: AXIS_TEXT }}
                      width={36}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={{ fontSize: 12, borderColor: GRID }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />
                    <Bar
                      yAxisId="right"
                      dataKey="evaluations"
                      name={t.myActivity}
                      fill={AMBER}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="production"
                      name={t.production}
                      stroke={GREEN}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: GREEN }}
                      connectNulls
                    />
                  </ComposedChart>
                )}
              </div>

              {scoreLines.length > 0 && (
                <p className="text-xs text-brown-mid mt-3">
                  {t.avgScore}: {scoreLines.join(" · ")}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

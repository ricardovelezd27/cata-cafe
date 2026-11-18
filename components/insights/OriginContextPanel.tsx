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
import { useActionFeedback } from "@/components/ui/Toast";
import type { OriginContext } from "@/lib/analytics/benchmarks";
import { getChartColors } from "@/components/results/chartColors";
import { chartTick, CHART_HTML_PX } from "./chartText";
import { cardClasses } from "@/components/ui/cardRecipe";

const CHART_HEIGHT = 280;

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
  "w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body text-on-surface focus:border-primary-container";

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
  const feedback = useActionFeedback();
  const { ref, width } = useContainerWidth();
  // S10: the shared chart colours (tokens), never a private palette.
  const colors = getChartColors();

  function onCountryChange(next: string) {
    setCountryCode(next);
    startTransition(async () => {
      // On error, keep showing the last-good context rather than blanking it.
      await feedback.run(runOriginContext(next, locale), (data) => setContext(data));
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
    <section className={cardClasses()}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-card">{t.title}</h2>
        {isPending && <Loader2 size={16} className="animate-spin text-on-surface-variant" aria-hidden />}
      </div>

      {countries.length === 0 ? (
        <div className="text-caption text-on-surface-variant py-8 text-center">{t.empty}</div>
      ) : (
        <>
          <label className="flex flex-col gap-1 max-w-xs mb-5">
            <span className="label-caps">
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
            <div className="text-caption text-on-surface-variant py-8 text-center">{t.empty}</div>
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
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis dataKey="year" tick={chartTick(colors.axisText)} />
                    <YAxis yAxisId="left" tick={chartTick(colors.axisText)} width={44} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={chartTick(colors.axisText)}
                      width={36}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }} />
                    <Legend wrapperStyle={{ fontSize: CHART_HTML_PX, color: colors.axisText }} />
                    <Bar
                      yAxisId="right"
                      dataKey="evaluations"
                      name={t.myActivity}
                      fill={colors.community}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="production"
                      name={t.production}
                      stroke={colors.mine}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: colors.mine }}
                      connectNulls
                    />
                  </ComposedChart>
                )}
              </div>

              {scoreLines.length > 0 && (
                <p className="text-caption text-on-surface-variant mt-3">
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

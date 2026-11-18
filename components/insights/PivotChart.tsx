"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import type { PivotResult } from "@/lib/analytics/types";
import { getChartColors, seriesColor } from "@/components/results/chartColors";
import { chartTick, CHART_HTML_PX } from "@/lib/chartText";

// Same palette/margins/tooltip conventions as InsightChart.tsx.
const CHART_HEIGHT = 320;
const TOTAL_COL = "__total__";

export interface PivotChartTranslations {
  empty: string;
}

interface PivotChartProps {
  result: PivotResult;
  view: "grouped" | "stacked" | "line";
  /** Translated label for the active measure — used as the single series
   *  name when there is no column axis. */
  measureLabel: string;
  t: PivotChartTranslations;
}

/**
 * Bar (grouped/stacked) or line chart over a PivotResult: one datum per row
 * key, one Bar/Line per column key. colKeys are already capped server-side
 * (colLimit, default 12) so no client-side series trimming is needed.
 */
export function PivotChart({ result, view, measureLabel, t }: PivotChartProps) {
  const { ref, width } = useContainerWidth();
  // S10: the shared chart colours (tokens), never a private palette.
  const colors = getChartColors();
  const { rowKeys, colKeys, cells } = result;

  if (rowKeys.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-caption text-on-surface-variant">{t.empty}</div>
    );
  }

  const totalOnly = colKeys.length === 1 && colKeys[0].key === TOTAL_COL;
  const series = totalOnly
    ? [{ key: TOTAL_COL, label: measureLabel }]
    : colKeys.map((c) => ({ key: c.key, label: c.label }));

  const data = rowKeys.map((r) => {
    const rowCells = cells[r.key] ?? {};
    const datum: Record<string, string | number | null> = { name: r.label };
    for (const s of series) {
      datum[s.key] = rowCells[s.key]?.value ?? null;
    }
    return datum;
  });

  const showLegend = series.length > 1;
  const rotateLabels = rowKeys.length > 6;

  return (
    <div ref={ref} className="w-full">
      {width > 0 && view !== "line" && (
        <BarChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={chartTick(colors.axisText)}
            interval={0}
            angle={rotateLabels ? -35 : 0}
            textAnchor={rotateLabels ? "end" : "middle"}
            height={rotateLabels ? 70 : 30}
          />
          <YAxis tick={chartTick(colors.axisText)} width={40} />
          <Tooltip contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: CHART_HTML_PX, color: colors.axisText }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={seriesColor(colors, i)}
              radius={[3, 3, 0, 0]}
              stackId={view === "stacked" ? "a" : undefined}
            />
          ))}
        </BarChart>
      )}

      {width > 0 && view === "line" && (
        <LineChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis dataKey="name" tick={chartTick(colors.axisText)} />
          <YAxis tick={chartTick(colors.axisText)} width={40} />
          <Tooltip contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: CHART_HTML_PX, color: colors.axisText }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(colors, i)}
              strokeWidth={2}
              dot={{ r: 3, fill: seriesColor(colors, i) }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </div>
  );
}

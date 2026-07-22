"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import type { PivotResult } from "@/lib/analytics/types";

// Same palette/margins/tooltip conventions as InsightChart.tsx.
const CHART_HEIGHT = 320;
const GREEN = "#3D5A3E";
const AMBER = "#C17817";
const GRID = "#E8E0D0";
const AXIS_TEXT = "#8B7355";
const PALETTE = [GREEN, AMBER, "#6B8F71", "#A83232", "#8B7355", "#D9A441", "#4E6E58", "#B5651D"];
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
  const { rowKeys, colKeys, cells } = result;

  if (rowKeys.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-brown-mid">{t.empty}</div>
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: AXIS_TEXT }}
            interval={0}
            angle={rotateLabels ? -35 : 0}
            textAnchor={rotateLabels ? "end" : "middle"}
            height={rotateLabels ? 70 : 30}
          />
          <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} width={40} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: GRID }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={PALETTE[i % PALETTE.length]}
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: AXIS_TEXT }} />
          <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} width={40} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: GRID }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: PALETTE[i % PALETTE.length] }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </div>
  );
}

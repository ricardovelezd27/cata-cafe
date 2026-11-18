"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import type { ChartType, InsightRow } from "@/lib/analytics/types";
import { getChartColors, seriesColor } from "@/components/results/chartColors";
import { chartTick, CHART_HTML_PX, CHART_TICK_PX } from "@/lib/chartText";

const CHART_HEIGHT = 300;



interface InsightChartProps {
  rows: InsightRow[];
  chartType: ChartType;
  /** Column/tooltip label for the measure (e.g. "Cantidad"). */
  valueLabel: string;
  /** Column label for the dimension in table mode. */
  dimensionLabel: string;
  /** Row-count column label in table mode. */
  countLabel: string;
  emptyLabel: string;
}

export function InsightChart({
  rows,
  chartType,
  valueLabel,
  dimensionLabel,
  countLabel,
  emptyLabel,
}: InsightChartProps) {
  const { ref, width } = useContainerWidth();
  // S10: the shared chart colours (tokens), never a private palette.
  const colors = getChartColors();

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-caption text-on-surface-variant">
        {emptyLabel}
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-outline-variant text-left">
              <th className="label-caps py-2 pr-4">
                {dimensionLabel}
              </th>
              <th className="label-caps py-2 pr-4 text-right">
                {valueLabel}
              </th>
              <th className="label-caps py-2 text-right">
                {countLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-outline-variant/50">
                <td className="py-2 pr-4 text-on-surface">
                  <span className="inline-flex items-center gap-2">
                    {r.color && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: r.color }}
                        aria-hidden
                      />
                    )}
                    {r.label}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-semibold text-on-surface tabular-nums">
                  {r.value}
                </td>
                <td className="py-2 text-right text-on-surface-variant tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full">
      {width > 0 && chartType === "bar" && (
        <BarChart
          width={width}
          height={CHART_HEIGHT}
          data={rows}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={chartTick(colors.axisText)}
            interval={0}
            angle={rows.length > 6 ? -35 : 0}
            textAnchor={rows.length > 6 ? "end" : "middle"}
            height={rows.length > 6 ? 70 : 30}
          />
          <YAxis tick={chartTick(colors.axisText)} width={40} />
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }}
          />
          <Bar dataKey="value" name={valueLabel} radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={r.key} fill={r.color ?? seriesColor(colors, i)} />
            ))}
          </Bar>
        </BarChart>
      )}

      {width > 0 && chartType === "line" && (
        <LineChart
          width={width}
          height={CHART_HEIGHT}
          data={rows}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis dataKey="label" tick={chartTick(colors.axisText)} />
          <YAxis tick={chartTick(colors.axisText)} width={40} />
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke={colors.mine}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.mine }}
          />
        </LineChart>
      )}

      {width > 0 && chartType === "pie" && (
        <PieChart width={width} height={CHART_HEIGHT}>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={Math.min(width, CHART_HEIGHT) / 2 - 40}
            label={({ name, percent }) =>
              `${name} ${percent != null ? Math.round(percent * 100) : 0}%`
            }
            labelLine={{ stroke: colors.grid }}
            fontSize={CHART_TICK_PX}
          >
            {rows.map((r, i) => (
              <Cell key={r.key} fill={r.color ?? seriesColor(colors, i)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: CHART_HTML_PX, borderColor: colors.grid }}
          />
          <Legend wrapperStyle={{ fontSize: CHART_HTML_PX, color: colors.axisText }} />
        </PieChart>
      )}
    </div>
  );
}

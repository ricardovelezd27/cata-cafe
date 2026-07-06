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

const CHART_HEIGHT = 300;

const GREEN = "#3D5A3E";
const AMBER = "#C17817";
const GRID = "#E8E0D0";
const AXIS_TEXT = "#8B7355";

// Brand-derived cycle for pie slices (and bars without descriptor colors).
const PALETTE = [GREEN, AMBER, "#6B8F71", "#A83232", "#8B7355", "#D9A441", "#4E6E58", "#B5651D"];

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

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-brown-mid">
        {emptyLabel}
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8E0D0] text-left">
              <th className="py-2 pr-4 text-xs font-semibold text-brown-mid uppercase tracking-wide">
                {dimensionLabel}
              </th>
              <th className="py-2 pr-4 text-xs font-semibold text-brown-mid uppercase tracking-wide text-right">
                {valueLabel}
              </th>
              <th className="py-2 text-xs font-semibold text-brown-mid uppercase tracking-wide text-right">
                {countLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[#F5F0E6]">
                <td className="py-2 pr-4 text-brown-dark">
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
                <td className="py-2 pr-4 text-right font-semibold text-brown-dark tabular-nums">
                  {r.value}
                </td>
                <td className="py-2 text-right text-brown-mid tabular-nums">{r.count}</td>
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: AXIS_TEXT }}
            interval={0}
            angle={rows.length > 6 ? -35 : 0}
            textAnchor={rows.length > 6 ? "end" : "middle"}
            height={rows.length > 6 ? 70 : 30}
          />
          <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} width={40} />
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: 12, borderColor: GRID }}
          />
          <Bar dataKey="value" name={valueLabel} radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={r.key} fill={r.color ?? PALETTE[i % PALETTE.length]} />
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
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_TEXT }} />
          <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} width={40} />
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: 12, borderColor: GRID }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke={GREEN}
            strokeWidth={2}
            dot={{ r: 3, fill: GREEN }}
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
            labelLine={{ stroke: GRID }}
            fontSize={11}
          >
            {rows.map((r, i) => (
              <Cell key={r.key} fill={r.color ?? PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [String(value), valueLabel]}
            contentStyle={{ fontSize: 12, borderColor: GRID }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />
        </PieChart>
      )}
    </div>
  );
}

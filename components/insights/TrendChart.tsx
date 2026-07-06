"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";

const CHART_HEIGHT = 260;
const GREEN = "#3D5A3E";
const AMBER = "#C17817";
const GRID = "#E8E0D0";
const AXIS_TEXT = "#8B7355";

interface TrendChartProps {
  data: { key: string; label: string; evaluations: number; sessions: number }[];
  evaluationsLabel: string;
  sessionsLabel: string;
}

/** Dual-series monthly activity line for the insights dashboard. */
export function TrendChart({ data, evaluationsLabel, sessionsLabel }: TrendChartProps) {
  const { ref, width } = useContainerWidth();

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <LineChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_TEXT }} />
          <YAxis tick={{ fontSize: 10, fill: AXIS_TEXT }} width={40} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: GRID }} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />
          <Line
            type="monotone"
            dataKey="evaluations"
            name={evaluationsLabel}
            stroke={GREEN}
            strokeWidth={2}
            dot={{ r: 2.5, fill: GREEN }}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            name={sessionsLabel}
            stroke={AMBER}
            strokeWidth={2}
            dot={{ r: 2.5, fill: AMBER }}
          />
        </LineChart>
      )}
    </div>
  );
}

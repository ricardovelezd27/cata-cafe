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
import { getChartColors } from "@/components/results/chartColors";

const CHART_HEIGHT = 260;

interface TrendChartProps {
  data: { key: string; label: string; evaluations: number; sessions: number }[];
  evaluationsLabel: string;
  sessionsLabel: string;
}

/** Dual-series monthly activity line for the insights dashboard. */
export function TrendChart({ data, evaluationsLabel, sessionsLabel }: TrendChartProps) {
  const { ref, width } = useContainerWidth();
  // S10: the shared chart colours (tokens), never a private palette.
  const colors = getChartColors();

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <LineChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: colors.axisText }} />
          <YAxis tick={{ fontSize: 10, fill: colors.axisText }} width={40} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: colors.grid }} />
          <Legend wrapperStyle={{ fontSize: 11, color: colors.axisText }} />
          <Line
            type="monotone"
            dataKey="evaluations"
            name={evaluationsLabel}
            stroke={colors.mine}
            strokeWidth={2}
            dot={{ r: 2.5, fill: colors.mine }}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            name={sessionsLabel}
            stroke={colors.community}
            strokeWidth={2}
            dot={{ r: 2.5, fill: colors.community }}
          />
        </LineChart>
      )}
    </div>
  );
}

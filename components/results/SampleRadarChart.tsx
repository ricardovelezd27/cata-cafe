"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Legend,
  Tooltip,
} from "recharts";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import {
  calcIndividualBreakdown,
  calcIndividualScore,
  hasAffectiveData,
  scoreBand,
} from "@/lib/scoring";
import { ScoreBreakdownPanel } from "@/components/results/ScoreBreakdownPanel";

const CHART_HEIGHT = 220;

/**
 * Measures the container width with useLayoutEffect (runs after layout, before
 * paint — so width is correct the first time the chart mounts) plus a
 * rAF-debounced resize/orientation listener.
 *
 * This replaces Recharts' ResponsiveContainer, whose ResizeObserver-based
 * measurement freezes on iOS Safari when the chart mounts into a grid cell that
 * was just revealed by a tab switch (measures width 0 and gets stuck, or trips
 * the "ResizeObserver loop" that locks the main thread). Measuring manually
 * sidesteps that entirely and renders identically on desktop.
 */
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setWidth(el.clientWidth);
    measure();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return { ref, width };
}

type AggregateScoreData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
  submittedCount: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
  uniformityPenalty: number;
  defectPenalty: number;
  attrAverages: Record<string, number>;
};

type CoffeeInfo = {
  name: string;
  country: string | null;
  region: string | null;
  producer: string | null;
  variety: string | null;
  altitude: string | null;
  roastLevel: string | null;
};

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: CoffeeInfo | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  physical: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
  aggregateScore: AggregateScoreData | null;
};

const SCORE_COLORS: Record<string, string> = {
  green: "#3D5A3E",
  amber: "#C17817",
  red: "#A83232",
};

export function SampleRadarChart({
  sample,
  format,
  cupsPerSample,
  showCommunity,
  isOwner,
  onReveal,
  locale,
  t,
}: {
  sample: SampleResult;
  format: string;
  cupsPerSample: number;
  showCommunity: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
  locale: string;
  t: { mine: string; community: string; deltaAttribute: string };
}) {
  const showAffective = format !== "descriptive";
  const { ref: chartRef, width: chartWidth } = useContainerWidth();

  const affData =
    format === "affective"
      ? sample.affective
      : format === "combined"
      ? sample.combined
      : null;

  const hasMyData = hasAffectiveData(affData);

  const radarData = AFFECTIVE_ATTRIBUTES.map((attr) => {
    const rawVal = affData
      ? Number(
          (affData[`${attr.id}_final`] as number | undefined) ??
          (affData[attr.id] as number | undefined) ??
          0
        )
      : 0;
    const myVal = rawVal > 0 ? rawVal : 5;
    const comVal = sample.aggregateScore?.attrAverages[attr.label] ?? 0;
    return {
      subject: attr.label,
      mine: hasMyData ? myVal : undefined,
      community: comVal > 0 ? comVal : undefined,
    };
  });
  const hasCommunityData =
    showCommunity &&
    Object.keys(sample.aggregateScore?.attrAverages ?? {}).length > 0 &&
    radarData.some((d) => d.community !== undefined && d.community > 0);

  // Mine-vs-community delta rows. Built from the raw values (not radarData)
  // so the chart's "default to 5 when unset" fallback never fakes a delta.
  const deltaRows = hasCommunityData
    ? AFFECTIVE_ATTRIBUTES.flatMap((attr) => {
        const rawVal = affData
          ? Number(
              (affData[`${attr.id}_final`] as number | undefined) ??
                (affData[attr.id] as number | undefined) ??
                0,
            )
          : 0;
        const comVal = sample.aggregateScore?.attrAverages[attr.label] ?? 0;
        if (rawVal <= 0 || comVal <= 0) return [];
        return [{ label: attr.label, mine: rawVal, community: comVal }];
      })
    : [];

  const score = hasMyData && affData ? calcIndividualScore(affData, cupsPerSample) : null;
  const scoreNum = score !== null && score !== "—" ? Number(score) : null;
  const band = scoreNum !== null ? scoreBand(scoreNum) : null;
  const scoreColor = band ? SCORE_COLORS[band] : "#8B7355";

  const setup = {
    cupsPerSample,
    uniformityTracked: cupsPerSample >= 5,
    roundingEnforced: true,
  };

  return (
    <div
      style={{
        background: "#FDFBF7",
        border: "1px solid #E8E0D0",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 700,
              color: "#3D5A3E",
              fontSize: 18,
              lineHeight: 1.1,
            }}
          >
            {sample.label}
          </div>
          {sample.revealed && sample.coffee && (
            <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
              {sample.coffee.name}
              {sample.coffee.country && ` · ${sample.coffee.country}`}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {scoreNum !== null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#8B7355", letterSpacing: "0.4px", marginBottom: 1 }}>
                PUNTAJE CVA
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 28,
                  fontWeight: 700,
                  color: scoreColor,
                  lineHeight: 1,
                }}
              >
                {scoreNum.toFixed(2)}
              </div>
            </div>
          )}

          {isOwner && !sample.revealed && (
            <button
              onClick={() => onReveal(sample.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #3D5A3E",
                background: "white",
                color: "#3D5A3E",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Revelar
            </button>
          )}
        </div>
      </div>

      {/* Individual score transparency (N5) */}
      {affData && scoreNum !== null && (
        <ScoreBreakdownPanel
          variant="individual"
          breakdown={calcIndividualBreakdown(affData, cupsPerSample)}
          setup={setup}
          locale={locale}
        />
      )}

      {/* Community score line */}
      {showCommunity && sample.aggregateScore?.communityScore != null && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 8,
            marginBottom: 8,
            padding: "6px 10px",
            background: "#FEF9EE",
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          <span style={{ color: "#8B7355" }}>
            Puntuación comunidad:{" "}
            <span style={{ fontWeight: 700, color: "#C17817" }}>
              {sample.aggregateScore.communityScore.toFixed(2)}
            </span>
          </span>
          <span style={{ color: "#8B7355" }}>
            {sample.aggregateScore.participantCount} de{" "}
            {sample.aggregateScore.submittedCount} evaluadores incluidos en el
            promedio
          </span>
        </div>
      )}

      {/* Community score transparency (N5) */}
      {showCommunity && sample.aggregateScore?.communityScore != null && (
        <ScoreBreakdownPanel
          variant="group"
          group={sample.aggregateScore}
          cupsPerSample={cupsPerSample}
          setup={setup}
          locale={locale}
        />
      )}

      {/* Radar chart */}
      {showAffective && hasMyData ? (
        <div ref={chartRef} style={{ width: "100%", height: CHART_HEIGHT }}>
          {chartWidth > 0 && (
            <RadarChart
              width={chartWidth}
              height={CHART_HEIGHT}
              data={radarData}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
            >
              <PolarGrid stroke="#E8E0D0" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 9, fill: "#8B7355" }}
              />
              <Radar
                name={t.mine}
                dataKey="mine"
                stroke="#3D5A3E"
                fill="#3D5A3E"
                fillOpacity={0.2}
                dot={false}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              />
              {hasCommunityData && (
                <Radar
                  name={t.community}
                  dataKey="community"
                  stroke="#C17817"
                  fill="#C17817"
                  fillOpacity={0.1}
                  strokeDasharray="5 3"
                  dot={false}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
              <Tooltip
                formatter={(value) => [typeof value === "number" ? value.toFixed(1) : String(value ?? ""), ""]}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #E8E0D0" }}
              />
              {hasCommunityData && (
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                />
              )}
            </RadarChart>
          )}
        </div>
      ) : showAffective ? (
        <div
          style={{
            textAlign: "center",
            color: "#8B7355",
            fontSize: 12,
            padding: "32px 0",
          }}
        >
          Sin datos afectivos registrados
        </div>
      ) : null}

      {/* Mine vs community per-attribute delta */}
      {showAffective && hasMyData && deltaRows.length > 0 && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            marginTop: 8,
          }}
        >
          <thead>
            <tr
              style={{
                fontSize: 9,
                color: "#8B7355",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600 }}>
                {t.deltaAttribute}
              </th>
              <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600 }}>
                {t.mine}
              </th>
              <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600 }}>
                {t.community}
              </th>
              <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600 }}>
                Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {deltaRows.map((row) => {
              const d = row.mine - row.community;
              return (
                <tr key={row.label} style={{ borderTop: "1px solid #E8E0D0" }}>
                  <td style={{ padding: "4px 0", color: "#5C4A32" }}>{row.label}</td>
                  <td
                    style={{
                      padding: "4px 0",
                      textAlign: "right",
                      color: "#3D5A3E",
                      fontWeight: 600,
                    }}
                  >
                    {row.mine.toFixed(1)}
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      textAlign: "right",
                      color: "#C17817",
                      fontWeight: 600,
                    }}
                  >
                    {row.community.toFixed(1)}
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      textAlign: "right",
                      fontWeight: 700,
                      color: d >= 0 ? "#3D5A3E" : "#C17817",
                    }}
                  >
                    {`${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!showAffective && (
        <div
          style={{
            textAlign: "center",
            color: "#8B7355",
            fontSize: 12,
            padding: "32px 0",
          }}
        >
          El gráfico radar requiere datos afectivos (formato afectivo o combinado)
        </div>
      )}
    </div>
  );
}

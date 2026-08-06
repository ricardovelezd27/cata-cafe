"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Legend,
  Tooltip,
} from "recharts";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import type { SessionFormat } from "@/lib/constants";
import {
  calcIndividualBreakdown,
  calcIndividualScore,
  hasAffectiveData,
  scoreBand,
} from "@/lib/scoring";
import { ScoreBreakdownPanel, type ScoreBreakdownTranslations } from "@/components/results/ScoreBreakdownPanel";
import { getChartColors } from "@/components/results/chartColors";
import { useContainerWidth } from "@/hooks/useContainerWidth";

const CHART_HEIGHT = 220;

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

export function SampleRadarChart({
  sample,
  format,
  cupsPerSample,
  showCommunity,
  isOwner,
  onReveal,
  t,
}: {
  sample: SampleResult;
  format: SessionFormat;
  cupsPerSample: number;
  showCommunity: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
  t: { mine: string; community: string; deltaAttribute: string; breakdown: ScoreBreakdownTranslations };
}) {
  const showAffective = format !== "descriptive";
  const { ref: chartRef, width: chartWidth } = useContainerWidth();
  const colors = getChartColors();

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
  const scoreColorClass =
    band === "green"
      ? "text-primary-container"
      : band === "amber"
        ? "text-secondary"
        : band === "red"
          ? "text-error"
          : "text-on-surface-variant";

  const setup = {
    cupsPerSample,
    uniformityTracked: cupsPerSample >= 5,
    roundingEnforced: true,
  };

  return (
    <div className="mb-3 rounded-card border border-outline-variant bg-surface-container-lowest p-4 shadow-card">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-semibold leading-tight text-primary-container">
            {sample.label}
          </div>
          {sample.revealed && sample.coffee && (
            <div className="mt-0.5 text-[11px] text-on-surface-variant">
              {sample.coffee.name}
              {sample.coffee.country && ` · ${sample.coffee.country}`}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {scoreNum !== null && (
            <div className="text-right">
              <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant">
                PUNTAJE CVA
              </div>
              <div
                className={`font-display text-2xl font-semibold leading-none tabular-nums ${scoreColorClass}`}
              >
                {scoreNum.toFixed(2)}
              </div>
            </div>
          )}

          {isOwner && !sample.revealed && (
            <button
              type="button"
              onClick={() => onReveal(sample.id)}
              className="min-h-[44px] shrink-0 rounded-pill border border-primary-container px-4 text-xs font-semibold text-primary-container transition-colors hover:bg-primary-fixed"
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
          t={t.breakdown}
        />
      )}

      {/* Community score line */}
      {showCommunity && sample.aggregateScore?.communityScore != null && (
        <div className="mb-2 mt-2 flex flex-wrap gap-4 rounded-input bg-surface-container-low px-3 py-1.5 text-xs">
          <span className="text-on-surface-variant">
            Puntuación comunidad:{" "}
            <span className="font-semibold text-secondary">
              {sample.aggregateScore.communityScore.toFixed(2)}
            </span>
          </span>
          <span className="text-on-surface-variant">
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
          t={t.breakdown}
        />
      )}

      {/* Radar chart */}
      {showAffective && hasMyData ? (
        <div ref={chartRef} className="h-[220px] w-full">
          {chartWidth > 0 && (
            <RadarChart
              width={chartWidth}
              height={CHART_HEIGHT}
              data={radarData}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
            >
              <PolarGrid stroke={colors.grid} />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 9, fill: colors.axisText }}
              />
              <Radar
                name={t.mine}
                dataKey="mine"
                stroke={colors.mine}
                fill={colors.mine}
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
                  stroke={colors.community}
                  fill={colors.community}
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
                contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${colors.grid}` }}
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
        <div className="py-8 text-center text-xs text-on-surface-variant">
          Sin datos afectivos registrados
        </div>
      ) : null}

      {/* Mine vs community per-attribute delta */}
      {showAffective && hasMyData && deltaRows.length > 0 && (
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-on-surface-variant">
              <th className="py-1 text-left font-semibold">{t.deltaAttribute}</th>
              <th className="py-1 text-right font-semibold">{t.mine}</th>
              <th className="py-1 text-right font-semibold">{t.community}</th>
              <th className="py-1 text-right font-semibold">Δ</th>
            </tr>
          </thead>
          <tbody>
            {deltaRows.map((row) => {
              const d = row.mine - row.community;
              return (
                <tr key={row.label} className="border-t border-outline-variant/50">
                  <td className="py-1 text-on-surface">{row.label}</td>
                  <td className="py-1 text-right font-semibold tabular-nums text-primary-container">
                    {row.mine.toFixed(1)}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums text-secondary">
                    {row.community.toFixed(1)}
                  </td>
                  <td
                    className={`py-1 text-right font-bold tabular-nums ${
                      d >= 0 ? "text-primary-container" : "text-secondary"
                    }`}
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
        <div className="py-8 text-center text-xs text-on-surface-variant">
          El gráfico radar requiere datos afectivos (formato afectivo o combinado)
        </div>
      )}
    </div>
  );
}

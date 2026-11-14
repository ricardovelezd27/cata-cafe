"use client";

import type { ScoreRule } from "@/lib/scoreRule";

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
  hasIndividualScore,
} from "@/lib/scoring";
import { ScoreBreakdownPanel, type ScoreBreakdownTranslations } from "@/components/results/ScoreBreakdownPanel";
import { getChartColors } from "@/components/results/chartColors";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { formatSignedDelta } from "@/lib/referenceDelta";
import { canShowMyScore, type MyEvaluation } from "@/lib/evaluationState";
import { Badge } from "@/components/ui";
import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";

const CHART_HEIGHT = 220;

type RadarDotProps = { cx?: number; cy?: number; index?: number; payload?: Record<string, unknown> };

/** Dots only (no polygon) where an axis has a value: a missing point must not read as 0 (S10 WP3b). */
function renderRadarDot(key: "mine" | "community", color: string, props: RadarDotProps) {
  return props.payload && typeof props.payload[key] === "number" && props.cx !== undefined && props.cy !== undefined ? (
    <circle key={`${key}-${props.index}`} cx={props.cx} cy={props.cy} r={3} fill={color} />
  ) : (
    <g key={`${key}-${props.index}`} />
  );
}

type AggregateScoreData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
  submittedCount: number;
  /** N of "n de N": every submitted evaluation, excluded cuppers included. */
  totalSubmitted?: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
  uniformityPenalty: number;
  defectPenalty: number;
  attrAverages: Record<string, number>;
  partialCount?: number;
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
  /** Rule the viewer's own evaluation was scored under ("v1" = before 2026-11). */
  scoreRule?: ScoreRule;
  isReference?: boolean;
  // Optional so pre-existing callers (print/PDF previews) keep working; when
  // absent the row is treated as submitted (today's behaviour).
  myEvaluation?: MyEvaluation;
};

export function SampleRadarChart({
  sample,
  format,
  cupsPerSample,
  showCommunity,
  isOwner,
  onReveal,
  // The VIEWER'S OWN score of the reference sample (see ResultsClient). The
  // card's headline number is always the viewer's own score, so its Δ must
  // be own-vs-own — never the reference's community score. null when there
  // is no reference or the viewer did not score it.
  referenceMyScore = null,
  referenceBadge,
  deltaVsReference,
  deltaVsReferenceAria,
  inProgressLabel,
  notEvaluatedLabel,
  sessionClosed = false,
  t,
}: {
  sample: SampleResult;
  format: SessionFormat;
  cupsPerSample: number;
  showCommunity: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
  referenceMyScore?: number | null;
  referenceBadge?: string;
  deltaVsReference?: string;
  deltaVsReferenceAria?: string;
  // Own-evaluation state chip labels (results page only).
  inProgressLabel?: string;
  notEvaluatedLabel?: string;
  /** Closed sessions are read-only: no "Revelar" (the close already revealed every coffee). */
  sessionClosed?: boolean;
  t: {
    mine: string;
    community: string;
    deltaAttribute: string;
    breakdown: ScoreBreakdownTranslations;
    /** Radar card copy (results.radar.*); `includedLine` is a raw {n}/{total} template. */
    radar: {
      score: string;
      reveal: string;
      communityScore: string;
      includedLine: string;
      noAffective: string;
      requiresAffective: string;
      /** S10 WP3b: "Parcial · sin puntaje" and the "Incluye {n} evaluación(es) parcial(es)" templates. */
      partialLabel?: string;
      /** "· no evaluado" appended to the label of an axis the partial evaluation left out. */
      axisNotEvaluated?: string;
      includesOne?: string;
      includesMany?: string;
    };
  };
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

  // The "mine" polygon plots unset attributes at 5 (below), so an unfinished
  // draft would draw a plausible-looking shape and score — gate both on the
  // row's own-evaluation state, exactly like ScoreTable.
  const myState: MyEvaluation = sample.myEvaluation ?? { status: "submitted", complete: true };
  const hasMyData = hasAffectiveData(affData) && canShowMyScore(myState);
  const isPartial = hasMyData && isAffectiveDeclaredPartial(affData);
  const stateChip =
    myState.status === "draft"
      ? (inProgressLabel ?? null)
      : myState.status === "none"
        ? (notEvaluatedLabel ?? null)
        : null;

  const radarData = AFFECTIVE_ATTRIBUTES.map((attr) => {
    const rawVal = affData
      ? Number(
          (affData[`${attr.id}_final`] as number | undefined) ??
          (affData[attr.id] as number | undefined) ??
          0
        )
      : 0;
    // A declared partial is NOT drawn as a polygon and has no point on a section it did not rate
    // (never 0, which reads as "the lowest value"); a normal evaluation keeps the 5 default.
    const myVal = rawVal > 0 ? rawVal : isPartial ? undefined : 5;
    const comVal = sample.aggregateScore?.attrAverages[attr.label] ?? 0;
    return {
      subject:
        isPartial && rawVal <= 0 && t.radar.axisNotEvaluated ? `${attr.label} ${t.radar.axisNotEvaluated}` : attr.label,
      mine: hasMyData ? myVal : undefined,
      community: comVal > 0 ? comVal : undefined,
    };
  });
  const hasCommunityData =
    showCommunity &&
    Object.keys(sample.aggregateScore?.attrAverages ?? {}).length > 0 &&
    radarData.some((d) => d.community !== undefined && d.community > 0);
  const communityHasGaps = hasCommunityData && radarData.some((d) => d.community === undefined);

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

  const score = hasMyData && affData && hasIndividualScore(affData) ? calcIndividualScore(affData, cupsPerSample, { rule: sample.scoreRule }) : null;
  const scoreNum = score !== null && score !== "—" ? Number(score) : null;
  const scoreColorClass = "text-on-surface";

  const setup = {
    cupsPerSample,
    uniformityTracked: cupsPerSample >= 2,
    roundingEnforced: true,
  };

  return (
    <div className="mb-3 rounded-card border border-outline-variant bg-surface-container-lowest p-4 shadow-card">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <div className="font-display text-lg font-semibold leading-tight text-primary-container">
              {sample.label}
            </div>
            {sample.isReference && referenceBadge && (
              <Badge tone="accent" size="xs">
                {referenceBadge}
              </Badge>
            )}
            {stateChip && (
              <Badge tone={myState.status === "draft" ? "accent" : "outline"} size="xs">
                {stateChip}
              </Badge>
            )}
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
                {t.radar.score}
              </div>
              <div
                className={`font-display text-2xl font-semibold leading-none tabular-nums ${scoreColorClass}`}
              >
                {scoreNum.toFixed(2)}
              </div>
              {referenceMyScore !== null && (
                <div
                  className="mt-0.5 text-[10px] font-medium text-on-surface-variant tabular-nums"
                  title={deltaVsReference}
                >
                  <span className="sr-only">{deltaVsReferenceAria}: </span>
                  Δ {formatSignedDelta(scoreNum - referenceMyScore)}
                </div>
              )}
            </div>
          )}

          {isPartial && scoreNum === null && t.radar.partialLabel && (
            <div className="text-right text-xs font-medium text-on-surface-variant">{t.radar.partialLabel}</div>
          )}

          {isOwner && !sample.revealed && !sessionClosed && (
            <button
              type="button"
              onClick={() => onReveal(sample.id)}
              className="min-h-[44px] shrink-0 rounded-pill border border-primary-container px-4 text-xs font-semibold text-primary-container transition-colors hover:bg-primary-fixed"
            >
              {t.radar.reveal}
            </button>
          )}
        </div>
      </div>

      {/* Individual score transparency (N5) */}
      {affData && scoreNum !== null && (
        <ScoreBreakdownPanel
          variant="individual"
          breakdown={calcIndividualBreakdown(affData, cupsPerSample, { rule: sample.scoreRule })}
          data={affData}
          setup={setup}
          t={t.breakdown}
        />
      )}

      {/* Community score line */}
      {showCommunity && sample.aggregateScore?.communityScore != null && (
        <div className="mb-2 mt-2 flex flex-wrap gap-4 rounded-input bg-surface-container-low px-3 py-1.5 text-xs">
          <span className="text-on-surface-variant">
            {t.radar.communityScore}:{" "}
            <span className="font-semibold text-secondary">
              {sample.aggregateScore.communityScore.toFixed(2)}
            </span>
          </span>
          <span className="text-on-surface-variant">
            {t.radar.includedLine
              .replace("{n}", String(sample.aggregateScore.participantCount))
              .replace(
                "{total}",
                String(
                  sample.aggregateScore.totalSubmitted ?? sample.aggregateScore.submittedCount,
                ),
              )}
          </span>
        </div>
      )}

      {/* S10 WP3b: the per-attribute averages include declared partial evaluations. */}
      {showCommunity && (sample.aggregateScore?.partialCount ?? 0) > 0 && t.radar.includesOne && (
        <p className="mb-2 text-[11px] text-on-surface-variant">
          {((sample.aggregateScore?.partialCount ?? 0) === 1 ? t.radar.includesOne : (t.radar.includesMany ?? t.radar.includesOne)).replace(
            "{n}",
            String(sample.aggregateScore?.partialCount ?? 0),
          )}
        </p>
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

      {/* Radar chart — drawn whenever there is SOMETHING to plot: the viewer's
          own (complete) polygon and/or the community one. An unfinished draft
          still sees the community shape, just not its own. */}
      {showAffective && (hasMyData || hasCommunityData) ? (
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
              {hasMyData && (
                <Radar
                  name={t.mine}
                  dataKey="mine"
                  stroke={isPartial ? "none" : colors.mine}
                  fill={isPartial ? "none" : colors.mine}
                  fillOpacity={isPartial ? 0 : 0.2}
                  dot={isPartial ? (p: RadarDotProps) => renderRadarDot("mine", colors.mine, p) : false}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
              {hasCommunityData && (
                <Radar
                  name={t.community}
                  dataKey="community"
                  stroke={communityHasGaps ? "none" : colors.community}
                  fill={communityHasGaps ? "none" : colors.community}
                  fillOpacity={communityHasGaps ? 0 : 0.1}
                  strokeDasharray="5 3"
                  dot={communityHasGaps ? (p: RadarDotProps) => renderRadarDot("community", colors.community, p) : false}
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
          {t.radar.noAffective}
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
          {t.radar.requiresAffective}
        </div>
      )}
    </div>
  );
}

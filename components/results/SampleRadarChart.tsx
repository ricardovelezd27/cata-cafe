"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { calcIndividualScore, scoreBand } from "@/lib/scoring";

type AggregateScoreData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
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
}: {
  sample: SampleResult;
  format: string;
  cupsPerSample: number;
  showCommunity: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
}) {
  const showAffective = format !== "descriptive";

  const affData =
    format === "affective"
      ? sample.affective
      : format === "combined"
      ? sample.combined
      : null;

  const radarData = AFFECTIVE_ATTRIBUTES.map((attr) => {
    const myVal = affData
      ? Number(
          (affData[`${attr.id}_final`] as number | undefined) ??
          (affData[attr.id] as number | undefined) ??
          0
        )
      : 0;
    const comVal = sample.aggregateScore?.attrAverages[attr.label] ?? 0;
    return {
      subject: attr.label,
      mine: myVal > 0 ? myVal : undefined,
      community: comVal > 0 ? comVal : undefined,
    };
  });

  const hasMyData = radarData.some((d) => d.mine !== undefined && d.mine > 0);
  const hasCommunityData =
    showCommunity &&
    Object.keys(sample.aggregateScore?.attrAverages ?? {}).length > 0 &&
    radarData.some((d) => d.community !== undefined && d.community > 0);

  const score = affData ? calcIndividualScore(affData, cupsPerSample) : null;
  const scoreNum = score !== null && score !== "—" ? Number(score) : null;
  const band = scoreNum !== null ? scoreBand(scoreNum) : null;
  const scoreColor = band ? SCORE_COLORS[band] : "#8B7355";

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

      {/* Community score line */}
      {showCommunity && sample.aggregateScore?.communityScore != null && (
        <div
          style={{
            display: "flex",
            gap: 16,
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
            {sample.aggregateScore.participantCount} evaluador
            {sample.aggregateScore.participantCount !== 1 ? "es" : ""}
          </span>
        </div>
      )}

      {/* Radar chart */}
      {showAffective && hasMyData ? (
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <PolarGrid stroke="#E8E0D0" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 9, fill: "#8B7355" }}
            />
            <Radar
              name="Mi evaluación"
              dataKey="mine"
              stroke="#3D5A3E"
              fill="#3D5A3E"
              fillOpacity={0.2}
              dot={false}
            />
            {hasCommunityData && (
              <Radar
                name="Comunidad"
                dataKey="community"
                stroke="#C17817"
                fill="#C17817"
                fillOpacity={0.1}
                strokeDasharray="5 3"
                dot={false}
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
        </ResponsiveContainer>
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
      ) : (
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

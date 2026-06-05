"use client";

import { useState } from "react";
import { calcIndividualScore } from "@/lib/scoring";
import { MyResultsSummary } from "./MyResultsSummary";

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: { name: string } | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
};

export type ParticipantResult = {
  id: string;
  name: string;
  samples: SampleResult[];
};

const T = {
  es: {
    matrixTitle: "Resumen de puntajes CVA",
    sample: "Muestra",
    legendAmber: "> 1 DE de la media",
    legendRed: "≥ 2 DE (posible atípico)",
    selectorLabel: "Ver evaluación de:",
    noScore: "—",
  },
  en: {
    matrixTitle: "CVA score summary",
    sample: "Sample",
    legendAmber: "> 1 SD from mean",
    legendRed: "≥ 2 SD (possible outlier)",
    selectorLabel: "View evaluation of:",
    noScore: "—",
  },
};

/* Pick the dataset that drives CVA, mirroring MyResultsSummary.dataFor. */
function dataFor(s: SampleResult, format: string): Record<string, unknown> {
  return format === "affective"
    ? s.affective
    : format === "descriptive"
      ? s.descriptive
      : s.combined;
}

function hasData(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0
  );
}

/* CVA total for one participant on one sample, or null when not applicable. */
function cvaFor(
  s: SampleResult,
  format: string,
  cupsPerSample: number
): number | null {
  if (format === "descriptive") return null; // no CVA without affective scores
  const data = dataFor(s, format);
  if (!hasData(data)) return null;
  const cva = calcIndividualScore(data, cupsPerSample);
  return typeof cva === "number" ? cva : null;
}

type CellTone = "neutral" | "amber" | "red";

function toneStyles(tone: CellTone): React.CSSProperties {
  if (tone === "red") return { background: "#F9E3E3", color: "#A83232", fontWeight: 700 };
  if (tone === "amber") return { background: "#FEF3E2", color: "#C17817", fontWeight: 700 };
  return { background: "transparent", color: "#5C4A32", fontWeight: 600 };
}

export function IndividualResultsPanel({
  participants,
  format,
  cupsPerSample,
  locale,
}: {
  participants: ParticipantResult[];
  format: string;
  cupsPerSample: number;
  locale: string;
}) {
  const t = T[locale === "en" ? "en" : "es"];
  const [selectedId, setSelectedId] = useState<string>(participants[0]?.id ?? "");

  const selected =
    participants.find((p) => p.id === selectedId) ?? participants[0] ?? null;

  // Build the sample axis from the first participant (all share the same sample
  // order/labels because each ParticipantResult is built over session.samples).
  const sampleAxis = participants[0]?.samples ?? [];

  // Precompute CVA matrix: [sampleIndex][participantIndex] = number | null
  const matrix: (number | null)[][] = sampleAxis.map((_, si) =>
    participants.map((p) => {
      const s = p.samples[si];
      return s ? cvaFor(s, format, cupsPerSample) : null;
    })
  );

  // Per-row mean + population SD over the numeric values, used for outlier tone.
  const rowStats = matrix.map((row) => {
    const nums = row.filter((v): v is number => v !== null);
    if (nums.length < 2) return { mean: 0, sd: 0, count: nums.length };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance =
      nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return { mean, sd: Math.sqrt(variance), count: nums.length };
  });

  const toneFor = (value: number | null, rowIdx: number): CellTone => {
    if (value === null) return "neutral";
    const { sd, mean, count } = rowStats[rowIdx];
    if (count < 2 || sd === 0) return "neutral";
    const dev = Math.abs(value - mean);
    if (dev >= 2 * sd) return "red";
    if (dev >= sd) return "amber";
    return "neutral";
  };

  const thBase: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#3D5A3E",
    textAlign: "center",
    padding: "8px 10px",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #E8E0D0",
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px",
    borderRadius: 9999,
    border: active ? "1px solid #3D5A3E" : "1px solid #E8E0D0",
    background: active ? "#3D5A3E" : "transparent",
    color: active ? "#FFF" : "#8B7355",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* a) CVA summary matrix */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E8E0D0",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#3D5A3E",
            marginBottom: 12,
          }}
        >
          {t.matrixTitle}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 }}>
            <thead>
              <tr>
                <th
                  style={{
                    ...thBase,
                    textAlign: "left",
                    position: "sticky",
                    left: 0,
                    background: "#fff",
                    zIndex: 1,
                  }}
                >
                  {t.sample}
                </th>
                {participants.map((p) => (
                  <th key={p.id} style={thBase}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleAxis.map((sample, si) => (
                <tr key={sample.id}>
                  <td
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#5C4A32",
                      padding: "8px 10px",
                      whiteSpace: "nowrap",
                      borderBottom: "1px solid #F0EBE0",
                      position: "sticky",
                      left: 0,
                      background: "#fff",
                      zIndex: 1,
                    }}
                  >
                    {sample.label}
                  </td>
                  {participants.map((p, pi) => {
                    const value = matrix[si][pi];
                    const tone = toneFor(value, si);
                    return (
                      <td
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        style={{
                          fontSize: 13,
                          textAlign: "center",
                          padding: "8px 10px",
                          borderBottom: "1px solid #F0EBE0",
                          cursor: "pointer",
                          ...toneStyles(tone),
                        }}
                      >
                        {value !== null ? value.toFixed(2) : t.noScore}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          {(["amber", "red"] as const).map((tone) => (
            <span
              key={tone}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8B7355" }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: tone === "amber" ? "#FEF3E2" : "#F9E3E3",
                  border: `1px solid ${tone === "amber" ? "#C17817" : "#A83232"}`,
                }}
              />
              {tone === "amber" ? t.legendAmber : t.legendRed}
            </span>
          ))}
        </div>
      </div>

      {/* b) Participant selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#8B7355",
          }}
        >
          {t.selectorLabel}
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {participants.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={pillStyle(selected?.id === p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* c) Selected participant detail */}
      {selected && (
        <MyResultsSummary
          samples={selected.samples}
          format={format}
          cupsPerSample={cupsPerSample}
          locale={locale}
          hideEdit
        />
      )}
    </div>
  );
}

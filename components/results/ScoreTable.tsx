"use client";

import { calcIndividualScore } from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

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

const DESCRIPTIVE_ATTRS = [
  { id: "fragancia", label: "Fragancia" },
  { id: "aroma", label: "Aroma" },
  { id: "sabor", label: "Sabor" },
  { id: "sabor_residual", label: "Regusto" },
  { id: "acidez", label: "Acidez" },
  { id: "dulzor", label: "Dulzor" },
  { id: "sensacion", label: "Sensación" },
];

function ScoreCell({
  myScore,
  communityScore,
  showGroup,
  u,
  d,
}: {
  myScore: number | "—" | null;
  communityScore: number | null;
  showGroup: boolean;
  u: number;
  d: number;
}) {
  const hasMyScore = myScore !== null && myScore !== "—";
  const scoreNum = hasMyScore ? (myScore as number) : null;
  const color = scoreNum !== null
    ? scoreNum >= 85 ? "#3D5A3E" : scoreNum >= 75 ? "#C17817" : "#A83232"
    : "#8B7355";

  return (
    <td
      style={{
        textAlign: "center",
        padding: "8px 10px",
        background: "#F0F5F0",
        borderLeft: "2px solid #3D5A3E",
        verticalAlign: "middle",
      }}
    >
      {hasMyScore ? (
        <>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 20,
              fontWeight: 700,
              color,
              lineHeight: 1,
            }}
          >
            {(myScore as number).toFixed(2)}
          </div>
          {showGroup && communityScore !== null && (
            <div style={{ fontSize: 10, color: "#C17817", marginTop: 2 }}>
              Com: {communityScore.toFixed(2)}
            </div>
          )}
          {(u > 0 || d > 0) && (
            <div style={{ fontSize: 9, color: "#A83232", marginTop: 1 }}>
              u:{u} d:{d}
            </div>
          )}
        </>
      ) : (
        <span style={{ color: "#C8C0B0", fontSize: 13 }}>—</span>
      )}
    </td>
  );
}

export function ScoreTable({
  samples,
  cupsPerSample,
  format,
  showGroup,
  isOwner,
  onReveal,
}: {
  samples: SampleResult[];
  cupsPerSample: number;
  format: string;
  showGroup: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
}) {
  const showDescriptive = format !== "affective";
  const showAffective = format !== "descriptive";
  const showCVA = showAffective;

  const thBase: React.CSSProperties = {
    padding: "6px 8px",
    textAlign: "center",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.4px",
    whiteSpace: "nowrap",
    border: "1px solid #E8E0D0",
  };

  const tdBase: React.CSSProperties = {
    padding: "6px 8px",
    textAlign: "center",
    fontSize: 12,
    color: "#5C4A32",
    border: "1px solid #F0EBE0",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };

  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: 10,
        border: "1px solid #E8E0D0",
        background: "#FDFBF7",
        marginBottom: 12,
      }}
    >
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th
              rowSpan={2}
              style={{
                ...thBase,
                background: "#F0EBE0",
                color: "#5C4A32",
                minWidth: 90,
                textAlign: "left",
                paddingLeft: 12,
                verticalAlign: "middle",
              }}
            >
              Muestra
            </th>

            {showDescriptive && (
              <th
                colSpan={DESCRIPTIVE_ATTRS.length}
                style={{
                  ...thBase,
                  background: "#E8F0E8",
                  color: "#3D5A3E",
                  textTransform: "uppercase",
                }}
              >
                Evaluación Descriptiva
              </th>
            )}

            {showAffective && (
              <th
                colSpan={AFFECTIVE_ATTRIBUTES.length}
                style={{
                  ...thBase,
                  background: "#FEF3E2",
                  color: "#C17817",
                  textTransform: "uppercase",
                }}
              >
                Evaluación Afectiva
              </th>
            )}

            {showCVA && (
              <th
                rowSpan={2}
                style={{
                  ...thBase,
                  background: "#3D5A3E",
                  color: "#FFF",
                  minWidth: 85,
                  textTransform: "uppercase",
                  verticalAlign: "middle",
                }}
              >
                Puntaje CVA
              </th>
            )}
          </tr>

          <tr>
            {showDescriptive &&
              DESCRIPTIVE_ATTRS.map((a) => (
                <th
                  key={a.id}
                  style={{
                    ...thBase,
                    background: "#F0F5F0",
                    color: "#3D5A3E",
                    minWidth: 52,
                    fontWeight: 600,
                  }}
                >
                  {a.label}
                </th>
              ))}

            {showAffective &&
              AFFECTIVE_ATTRIBUTES.map((a) => (
                <th
                  key={a.id}
                  style={{
                    ...thBase,
                    background: "#FEF9EE",
                    color: "#C17817",
                    minWidth: showGroup ? 68 : 52,
                    fontWeight: 600,
                  }}
                >
                  {a.label}
                </th>
              ))}
          </tr>
        </thead>

        <tbody>
          {samples.map((sample, rowIdx) => {
            const affData =
              format === "affective"
                ? sample.affective
                : format === "combined"
                ? sample.combined
                : null;

            const descData =
              format === "descriptive"
                ? sample.descriptive
                : format === "combined"
                ? sample.combined
                : null;

            const score = affData ? calcIndividualScore(affData, cupsPerSample) : null;
            const nonUniform = (affData?.tazas_no_uniformes as boolean[] | undefined) ?? [];
            const defective = (affData?.tazas_defectuosas as boolean[] | undefined) ?? [];
            const u = nonUniform.filter(Boolean).length;
            const d = defective.filter(Boolean).length;
            const rowBg = rowIdx % 2 === 0 ? "#FDFBF7" : "#F9F6F0";

            return (
              <tr key={sample.id}>
                {/* Sample label cell */}
                <td
                  style={{
                    ...tdBase,
                    textAlign: "left",
                    paddingLeft: 12,
                    background: rowBg,
                    minWidth: 90,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontWeight: 700,
                      color: "#3D5A3E",
                      fontSize: 16,
                      lineHeight: 1.1,
                    }}
                  >
                    {sample.label}
                  </div>
                  {sample.revealed && sample.coffee && (
                    <div style={{ fontSize: 10, color: "#8B7355", marginTop: 2 }}>
                      {sample.coffee.name}
                    </div>
                  )}
                  {isOwner && !sample.revealed && (
                    <button
                      onClick={() => onReveal(sample.id)}
                      style={{
                        marginTop: 4,
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px solid #3D5A3E",
                        background: "white",
                        color: "#3D5A3E",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Revelar
                    </button>
                  )}
                  {isOwner && sample.revealed && (
                    <div style={{ fontSize: 9, color: "#3D5A3E", marginTop: 2 }}>✓ Revelada</div>
                  )}
                </td>

                {/* Descriptive intensity cells */}
                {showDescriptive &&
                  DESCRIPTIVE_ATTRS.map((attr) => {
                    const raw = descData
                      ? (descData[`${attr.id}_int`] as number | undefined)
                      : undefined;
                    const val = raw !== undefined && raw > 0 ? raw : 1;
                    const isDefault = raw === undefined || raw === 0;
                    return (
                      <td key={attr.id} style={{ ...tdBase, background: rowBg }}>
                        <span style={isDefault ? { color: "#C8C0B0" } : undefined}>
                          {val}
                        </span>
                      </td>
                    );
                  })}

                {/* Affective score cells */}
                {showAffective &&
                  AFFECTIVE_ATTRIBUTES.map((attr) => {
                    const myVal = affData
                      ? ((affData[`${attr.id}_final`] as number | undefined) ??
                         (affData[attr.id] as number | undefined))
                      : undefined;
                    const comVal = showGroup
                      ? sample.aggregateScore?.attrAverages[attr.label]
                      : undefined;

                    return (
                      <td key={attr.id} style={{ ...tdBase, background: rowBg }}>
                        {showGroup ? (
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                color: "#3D5A3E",
                                fontSize: 13,
                                lineHeight: 1.2,
                              }}
                            >
                              {myVal ?? <span style={{ color: "#C8C0B0" }}>—</span>}
                            </div>
                            <div style={{ color: "#C17817", fontSize: 10, lineHeight: 1.2 }}>
                              {comVal !== undefined ? (
                                comVal.toFixed(1)
                              ) : (
                                <span style={{ color: "#C8C0B0" }}>—</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#3D5A3E", fontWeight: 600 }}>
                            {myVal ?? <span style={{ color: "#C8C0B0" }}>—</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}

                {/* CVA score cell */}
                {showCVA && (
                  <ScoreCell
                    myScore={score}
                    communityScore={sample.aggregateScore?.communityScore ?? null}
                    showGroup={showGroup}
                    u={u}
                    d={d}
                  />
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Group legend */}
      {showGroup && showAffective && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: "1px solid #F0EBE0",
            fontSize: 10,
            color: "#8B7355",
            display: "flex",
            gap: 16,
          }}
        >
          <span>
            <span style={{ color: "#3D5A3E", fontWeight: 700 }}>■</span> Mi evaluación
          </span>
          <span>
            <span style={{ color: "#C17817", fontWeight: 700 }}>■</span> Comunidad
          </span>
        </div>
      )}
    </div>
  );
}

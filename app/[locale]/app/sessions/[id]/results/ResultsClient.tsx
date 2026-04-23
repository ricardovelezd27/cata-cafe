"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { calcIndividualScore } from "@/lib/scoring";
import {
  AFFECTIVE_ATTRIBUTES,
  FLAVOR_TREE,
  ACIDITY_DESCRIPTORS,
  SWEETNESS_DESCRIPTORS,
  MOUTHFEEL_DESCRIPTORS,
} from "@/lib/constants";
import { revealSample } from "@/app/actions/community";

function resolveLabel(id: string): string {
  for (const cat of FLAVOR_TREE) {
    if (cat.id === id) return cat.label;
    for (const sub of cat.subs) {
      if (sub.id === id) return sub.label;
    }
  }
  for (const d of [...ACIDITY_DESCRIPTORS, ...SWEETNESS_DESCRIPTORS]) {
    if (d.id === id) return d.label;
  }
  for (const d of MOUTHFEEL_DESCRIPTORS) {
    if (d.id === id) return d.label;
  }
  return id;
}

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

type ViewMode = "mine" | "group";

export function ResultsClient({
  locale,
  session,
  isOwner,
  isGroup,
  sessionStatus,
  canViewGroup,
  translations,
}: {
  locale: string;
  session: {
    id: string;
    name: string;
    format: string;
    cupsPerSample: number;
    date: string;
    samples: SampleResult[];
  };
  isOwner: boolean;
  isGroup: boolean;
  sessionStatus: string;
  canViewGroup: boolean;
  translations: {
    myResults: string;
    groupResults: string;
    communityScore: string;
    avgRaw: string;
    participantCount: string;
    radarChart: string;
    myScore: string;
    delta: string;
    noGroupData: string;
    reveal: string;
    revealed: string;
  };
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("mine");
  const [, startTransition] = useTransition();

  const isAffective = session.format === "affective";
  const isCombined = session.format === "combined";
  const isDescriptive = session.format === "descriptive";
  const showCVA = isAffective || isCombined;

  const DESCRIPTIVE_ATTRS = [
    { id: "fragancia", label: "Fragancia" },
    { id: "aroma", label: "Aroma" },
    { id: "sabor", label: "Sabor" },
    { id: "residual", label: "Sabor Residual" },
    { id: "acidez", label: "Acidez" },
    { id: "dulzor", label: "Dulzor" },
    { id: "sensacion", label: "Sensación en Boca" },
  ];

  const handleReveal = (sampleId: string) => {
    startTransition(async () => {
      await revealSample(sampleId);
      router.refresh();
    });
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F5F0E6 0%, #EDE5D5 100%)",
        color: "#5C4A32",
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
          padding: "12px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => router.back()}
            style={{
              color: "#FFF",
              background: "transparent",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <div>
            <div
              style={{
                color: "#FFF",
                fontWeight: 700,
                fontSize: 20,
                fontFamily: "'Cormorant Garamond', Georgia, serif",
              }}
            >
              Resultados de la Sesión
            </div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              {session.name} · {session.date}
            </div>
          </div>
        </div>
      </div>

      {/* View toggle — only for group sessions */}
      {canViewGroup && (
        <div
          style={{
            display: "flex",
            margin: "12px 16px 0",
            background: "#E8E0D0",
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}
        >
          {(["mine", "group"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 8,
                border: "none",
                background: view === v ? "#FDFBF7" : "transparent",
                color: view === v ? "#3D5A3E" : "#8B7355",
                fontSize: 12,
                fontWeight: view === v ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {v === "mine" ? translations.myResults : translations.groupResults}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: 16, paddingBottom: 88 }}>
        {session.samples.map((sample) => {
          const affData = isAffective
            ? sample.affective
            : isCombined
              ? sample.combined
              : null;
          const descData = isDescriptive
            ? sample.descriptive
            : isCombined
              ? sample.combined
              : null;
          const score = affData ? calcIndividualScore(affData, session.cupsPerSample) : null;
          const gustosSrc = descData || affData;
          const gustos = (gustosSrc?.gustos as string[] | undefined) ?? [];
          const defective = (affData?.tazas_defectuosas as boolean[] | undefined) ?? [];
          const defectCount = defective.filter(Boolean).length;

          const agg = sample.aggregateScore;

          // ── Coffee identity card (shown when revealed) ──────────────────────
          const CoffeeCard = sample.revealed && sample.coffee ? (
            <div
              style={{
                background: "#E8F0E8",
                border: "1px solid #B4C8A8",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 10,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: "#3D5A3E", marginBottom: 4 }}>
                {sample.coffee.name}
              </div>
              {[
                sample.coffee.producer && `Productor: ${sample.coffee.producer}`,
                sample.coffee.country && `País: ${sample.coffee.country}`,
                sample.coffee.region && `Región: ${sample.coffee.region}`,
                sample.coffee.variety && `Variedad: ${sample.coffee.variety}`,
                sample.coffee.altitude && `Altitud: ${sample.coffee.altitude}`,
                sample.coffee.roastLevel && `Tueste: ${sample.coffee.roastLevel}`,
              ]
                .filter(Boolean)
                .map((line) => (
                  <div key={line as string} style={{ color: "#5C4A32", lineHeight: 1.6 }}>
                    {line}
                  </div>
                ))}
            </div>
          ) : null;

          // ── Reveal button (owner only, not yet revealed) ─────────────────────
          const RevealBtn = isOwner && !sample.revealed ? (
            <button
              onClick={() => handleReveal(sample.id)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid #3D5A3E",
                background: "white",
                color: "#3D5A3E",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: 10,
              }}
            >
              {translations.reveal}
            </button>
          ) : isOwner && sample.revealed ? (
            <div style={{ fontSize: 10, color: "#3D5A3E", marginBottom: 6 }}>
              ✓ {translations.revealed}
            </div>
          ) : null;

          // ── Group view ──────────────────────────────────────────────────────
          if (view === "group" && canViewGroup) {
            const radarData =
              agg && Object.keys(agg.attrAverages).length > 0
                ? Object.entries(agg.attrAverages).map(([attr, avg]) => ({
                    subject: attr,
                    score: avg,
                    fullMark: 9,
                  }))
                : AFFECTIVE_ATTRIBUTES.map((a) => ({
                    subject: a.label,
                    score: 0,
                    fullMark: 9,
                  }));

            const myIndividual = score !== null && score !== "—" ? Number(score) : null;
            const delta =
              myIndividual !== null && agg?.communityScore != null
                ? (myIndividual - agg.communityScore).toFixed(2)
                : null;

            return (
              <div
                key={sample.id}
                style={{
                  background: "#FDFBF7",
                  border: "1px solid #E8E0D0",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#3D5A3E",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  {sample.label}
                </div>

                {RevealBtn}
                {CoffeeCard}

                {agg ? (
                  <>
                    {/* Community score hero */}
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#8B7355",
                          letterSpacing: "0.5px",
                          marginBottom: 2,
                          textTransform: "uppercase",
                        }}
                      >
                        {translations.communityScore}
                      </div>
                      <div
                        style={{
                          fontSize: 52,
                          fontWeight: 700,
                          color: "#3D5A3E",
                          fontFamily: "'Cormorant Garamond', Georgia, serif",
                          lineHeight: 1,
                        }}
                      >
                        {agg.communityScore?.toFixed(2) ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "#8B7355", marginTop: 4 }}>
                        {agg.participantCount} {translations.participantCount}
                      </div>
                    </div>

                    {/* Radar chart */}
                    {showCVA && radarData.some((d) => d.score > 0) && (
                      <div style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#8B7355",
                            letterSpacing: "0.5px",
                            marginBottom: 6,
                            textTransform: "uppercase",
                          }}
                        >
                          {translations.radarChart}
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                          <RadarChart data={radarData}>
                            <PolarGrid stroke="#E8E0D0" />
                            <PolarAngleAxis
                              dataKey="subject"
                              tick={{ fontSize: 9, fill: "#8B7355" }}
                            />
                            <Radar
                              dataKey="score"
                              stroke="#3D5A3E"
                              fill="#3D5A3E"
                              fillOpacity={0.25}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Score breakdown */}
                    <div style={{ fontSize: 12, color: "#5C4A32" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "4px 0",
                          borderBottom: "1px solid #F0EBE0",
                        }}
                      >
                        <span>{translations.avgRaw}</span>
                        <span style={{ fontWeight: 600, color: "#3D5A3E" }}>
                          {agg.avgRawScore?.toFixed(2) ?? "—"}
                        </span>
                      </div>
                      {agg.uniformityPenalty > 0 && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "4px 0",
                            borderBottom: "1px solid #F0EBE0",
                          }}
                        >
                          <span>Penalización uniformidad</span>
                          <span style={{ fontWeight: 600, color: "#A83232" }}>
                            −{agg.uniformityPenalty.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {agg.defectPenalty > 0 && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "4px 0",
                            borderBottom: "1px solid #F0EBE0",
                          }}
                        >
                          <span>Penalización defectos</span>
                          <span style={{ fontWeight: 600, color: "#A83232" }}>
                            −{agg.defectPenalty.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {myIndividual !== null && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "4px 0",
                            borderBottom: "1px solid #F0EBE0",
                          }}
                        >
                          <span>{translations.myScore}</span>
                          <span style={{ fontWeight: 600, color: "#5C4A32" }}>
                            {myIndividual.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {delta !== null && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "4px 0",
                          }}
                        >
                          <span>{translations.delta}</span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: Number(delta) >= 0 ? "#3D5A3E" : "#A83232",
                            }}
                          >
                            {Number(delta) > 0 ? "+" : ""}
                            {delta}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#8B7355", textAlign: "center", lineHeight: 1.5 }}>
                    {translations.noGroupData}
                  </div>
                )}
              </div>
            );
          }

          // ── My results view (default) ───────────────────────────────────────
          return (
            <div
              key={sample.id}
              style={{
                background: "#FDFBF7",
                border: "1px solid #E8E0D0",
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
              }}
            >
              {/* Sample header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#3D5A3E",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {sample.label}
                </div>
                {showCVA && score !== null && (
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#8B7355",
                        letterSpacing: "0.5px",
                        marginBottom: 2,
                      }}
                    >
                      PUNTAJE CVA
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        color: "#3D5A3E",
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        lineHeight: 1,
                      }}
                    >
                      {score}
                    </div>
                  </div>
                )}
              </div>

              {RevealBtn}
              {CoffeeCard}

              {/* Affective attribute rows */}
              {affData &&
                AFFECTIVE_ATTRIBUTES.map((attr, i) => {
                  const first = affData[attr.id] as number | undefined;
                  const final =
                    (affData[`${attr.id}_final`] as number | undefined) || first;
                  if (!first && !final) return null;
                  return (
                    <div
                      key={attr.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "5px 0",
                        borderBottom:
                          i < AFFECTIVE_ATTRIBUTES.length - 1
                            ? "1px solid #F0EBE0"
                            : "none",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "#5C4A32" }}>{attr.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {first !== final && (
                          <span style={{ fontSize: 11, color: "#C17817" }}>{first}</span>
                        )}
                        {first !== final && (
                          <span style={{ color: "#8B7355", fontSize: 11 }}>→</span>
                        )}
                        <span style={{ fontWeight: 700, color: "#3D5A3E", fontSize: 14 }}>
                          {final}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {/* Descriptive attribute rows */}
              {descData &&
                !affData &&
                DESCRIPTIVE_ATTRS.map((attr, i) => {
                  const val = descData[`${attr.id}_int`] as number | undefined;
                  if (val === undefined) return null;
                  const descs =
                    (descData[`${attr.id}_desc`] as string[] | undefined) ?? [];
                  return (
                    <div
                      key={attr.id}
                      style={{
                        padding: "5px 0",
                        borderBottom:
                          i < DESCRIPTIVE_ATTRS.length - 1
                            ? "1px solid #F0EBE0"
                            : "none",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{attr.label}</span>
                        <span style={{ color: "#3D5A3E", fontWeight: 600 }}>
                          {val.toFixed(1)}
                        </span>
                      </div>
                      {descs.length > 0 && (
                        <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
                          {descs.map(resolveLabel).join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Gustos predominantes */}
              {gustos.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: "#8B7355",
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                    }}
                  >
                    GUSTOS
                  </span>
                  {gustos.map((g) => (
                    <span
                      key={g}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        background: "#E8F0E8",
                        borderRadius: 10,
                        color: "#3D5A3E",
                        fontWeight: 600,
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Defective cups warning */}
              {defectCount > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#A83232",
                    fontWeight: 600,
                  }}
                >
                  ⚠ {defectCount} taza{defectCount > 1 ? "s" : ""} defectuosa
                  {defectCount > 1 ? "s" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Print CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "12px 16px",
          boxSizing: "border-box",
          zIndex: 99,
        }}
      >
        <button
          onClick={() => router.push(`/${locale}/app/sessions/${session.id}/print`)}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
            color: "#FFF",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            letterSpacing: "0.3px",
          }}
        >
          🖨 Ver Formulario Imprimible
        </button>
      </div>
    </div>
  );
}

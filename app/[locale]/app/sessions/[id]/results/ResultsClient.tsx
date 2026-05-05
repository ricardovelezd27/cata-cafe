"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revealSample } from "@/app/actions/community";
import { ScoreTable } from "@/components/results/ScoreTable";
import { SampleRadarChart } from "@/components/results/SampleRadarChart";

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
type DisplayView = "table" | "radar";

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
  const [displayView, setDisplayView] = useState<DisplayView>("table");
  const [, startTransition] = useTransition();

  const handleReveal = (sampleId: string) => {
    startTransition(async () => {
      await revealSample(sampleId);
      router.refresh();
    });
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 0",
    borderRadius: 8,
    border: "none",
    background: active ? "#FDFBF7" : "transparent",
    color: active ? "#3D5A3E" : "#8B7355",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
    transition: "all 0.15s",
  });

  const showGroup = view === "group" && canViewGroup;

  return (
    <div
      style={{
        maxWidth: 520,
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

      <div style={{ padding: "12px 16px 0" }}>
        {/* Mine / Group toggle */}
        {canViewGroup && (
          <div
            style={{
              display: "flex",
              background: "#E8E0D0",
              borderRadius: 10,
              padding: 3,
              gap: 2,
              marginBottom: 8,
            }}
          >
            {(["mine", "group"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)} style={toggleBtnStyle(view === v)}>
                {v === "mine" ? translations.myResults : translations.groupResults}
              </button>
            ))}
          </div>
        )}

        {/* Tabla / Gráfico toggle */}
        <div
          style={{
            display: "flex",
            background: "#E8E0D0",
            borderRadius: 10,
            padding: 3,
            gap: 2,
            marginBottom: 12,
          }}
        >
          {(["table", "radar"] as DisplayView[]).map((v) => (
            <button key={v} onClick={() => setDisplayView(v)} style={toggleBtnStyle(displayView === v)}>
              {v === "table" ? "📋 Tabla" : "📡 Gráfico"}
            </button>
          ))}
        </div>

        {/* Format badge */}
        <div style={{ marginBottom: 10, display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.5px",
              padding: "2px 8px",
              borderRadius: 10,
              background: "#E8F0E8",
              color: "#3D5A3E",
              textTransform: "uppercase",
            }}
          >
            {session.format}
          </span>
          <span style={{ fontSize: 11, color: "#8B7355" }}>
            {session.samples.length} muestra{session.samples.length !== 1 ? "s" : ""}
          </span>
          {showGroup && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.4px",
                padding: "2px 8px",
                borderRadius: 10,
                background: "#FEF3E2",
                color: "#C17817",
                textTransform: "uppercase",
              }}
            >
              Vista grupal
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: "0 16px", paddingBottom: 88 }}>
        {displayView === "table" ? (
          <ScoreTable
            samples={session.samples}
            cupsPerSample={session.cupsPerSample}
            format={session.format}
            showGroup={showGroup}
            isOwner={isOwner}
            onReveal={handleReveal}
          />
        ) : (
          session.samples.map((sample) => (
            <SampleRadarChart
              key={sample.id}
              sample={sample}
              format={session.format}
              cupsPerSample={session.cupsPerSample}
              showCommunity={showGroup}
              isOwner={isOwner}
              onReveal={handleReveal}
            />
          ))
        )}
      </div>

      {/* Print CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 520,
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

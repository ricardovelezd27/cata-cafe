"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revealSample, refreshAggregateScores } from "@/app/actions/community";
import { ScoreTable } from "@/components/results/ScoreTable";
import { SampleRadarChart } from "@/components/results/SampleRadarChart";
import { FlavorCloud } from "@/components/results/FlavorCloud";

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
  const [refreshing, setRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  const handleReveal = (sampleId: string) => {
    startTransition(async () => {
      await revealSample(sampleId);
      router.refresh();
    });
  };

  const handleRefreshScores = async () => {
    setRefreshing(true);
    try {
      await refreshAggregateScores(session.id);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const showGroup = view === "group" && canViewGroup;

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

  const segStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "6px 0",
    borderRadius: 7,
    border: "none",
    background: active ? "#FDFBF7" : "transparent",
    color: active ? "#5C4A32" : "#8B7355",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
    transition: "all 0.15s",
  });

  return (
    <div
      className="-m-4 -mb-20 lg:-m-6 flex flex-col"
      style={{ minHeight: "100%", background: "#FDFBF7", color: "#5C4A32" }}
    >
      {/* Sticky header — light themed */}
      <div
        className="sticky top-0 z-[100]"
        style={{ background: "#FDFBF7", borderBottom: "1px solid #E8E0D0" }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
          }}
        >
          <button
            onClick={() => router.push(`/${locale}/app/sessions/${session.id}/cup`)}
            style={{
              color: "#8B7355",
              background: "transparent",
              border: "none",
              fontSize: 13,
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
              fontFamily: "inherit",
              letterSpacing: "0.3px",
            }}
          >
            ← Editar evaluación
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 17,
                fontWeight: 700,
                color: "#3D5A3E",
              }}
            >
              Resultados de la Sesión
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#8B7355",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.name} · {session.date}
            </div>
          </div>
        </div>

        {/* Mine / Group pills */}
        {canViewGroup && (
          <div style={{ padding: "0 16px 8px", display: "flex", gap: 4, alignItems: "center", overflow: "hidden" }}>
            {(["mine", "group"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)} style={pillStyle(view === v)}>
                {v === "mine" ? translations.myResults : translations.groupResults}
              </button>
            ))}
            <button
              onClick={handleRefreshScores}
              disabled={refreshing}
              style={{
                marginLeft: "auto",
                padding: "5px 12px",
                borderRadius: 9999,
                border: "1px solid #C17817",
                background: refreshing ? "#FEF3E2" : "transparent",
                color: "#C17817",
                fontSize: 11,
                fontWeight: 600,
                cursor: refreshing ? "default" : "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              {refreshing ? "Actualizando…" : "⟳ Actualizar"}
            </button>
          </div>
        )}

        {/* Tabla / Gráfico segmented control */}
        <div
          style={{
            display: "flex",
            margin: "0 16px 10px",
            background: "#E8E0D0",
            borderRadius: 9,
            padding: 3,
            gap: 2,
          }}
        >
          {(["table", "radar"] as DisplayView[]).map((v) => (
            <button key={v} onClick={() => setDisplayView(v)} style={segStyle(displayView === v)}>
              {v === "table" ? "📋 Tabla" : "📡 Gráfico"}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      {displayView === "table" ? (
        <div className="p-4 lg:p-6 flex flex-col gap-6">
          <ScoreTable
            samples={session.samples}
            cupsPerSample={session.cupsPerSample}
            format={session.format}
            showGroup={showGroup}
            isOwner={isOwner}
            onReveal={handleReveal}
          />
          {session.samples.some((s) => Object.keys(s.descriptive).length > 0) && (
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #E8E0D0",
                padding: "16px",
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
                Perfiles de Sabor
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {session.samples.map((sample) => (
                  <div key={sample.id}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#8B7355",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {sample.label}
                    </div>
                    <FlavorCloud descriptive={sample.descriptive} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-4 lg:p-6">
          {session.samples.map((sample) => (
            <div key={sample.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <SampleRadarChart
                sample={sample}
                format={session.format}
                cupsPerSample={session.cupsPerSample}
                showCommunity={showGroup}
                isOwner={isOwner}
                onReveal={handleReveal}
              />
              {Object.keys(sample.descriptive).length > 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "0 0 12px 12px",
                    border: "1px solid #E8E0D0",
                    borderTop: "none",
                    padding: "12px 16px 16px",
                  }}
                >
                  <FlavorCloud descriptive={sample.descriptive} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Print CTA — sticky footer */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 99,
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "12px 16px",
          paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))",
        }}
      >
        <button
          onClick={() => router.push(`/${locale}/app/sessions/${session.id}/print`)}
          style={{
            width: "100%",
            padding: "13px 0",
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

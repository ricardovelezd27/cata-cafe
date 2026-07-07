"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { revealSample, refreshAggregateScores } from "@/app/actions/community";
import { ScoreTable } from "@/components/results/ScoreTable";
import { SampleRadarChart } from "@/components/results/SampleRadarChart";
import { FlavorCloud } from "@/components/results/FlavorCloud";
import { MyResultsSummary } from "@/components/results/MyResultsSummary";
import {
  DescriptorFrequency,
  type SampleBlockFreq,
} from "@/components/results/DescriptorFrequency";
import {
  CupperAlignment,
  type CupperAlignmentRow,
} from "@/components/results/CupperAlignment";
import {
  IndividualResultsPanel,
  type ParticipantResult,
} from "@/components/results/IndividualResultsPanel";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { updateSampleMetadata } from "@/app/actions/sessions";

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

type SampleCoffee = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: CoffeeInfo | null;
  masterCoffee: SampleCoffee | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  physical: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
  aggregateScore: AggregateScoreData | null;
};

type ViewMode = "mine" | "group";
type DisplayView = "summary" | "table" | "radar" | "descriptors" | "individual";

export function ResultsClient({
  locale,
  session,
  isOwner,
  isGroup,
  sessionStatus,
  canViewGroup,
  currentUserId,
  participationLabel,
  lastUpdatedLabel,
  participants,
  descriptorFrequency,
  blockLabels,
  cupperAlignment,
  partialSyncNotice,
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
  currentUserId: string;
  participationLabel?: string | null;
  lastUpdatedLabel?: string | null;
  participants?: ParticipantResult[] | null;
  descriptorFrequency?: SampleBlockFreq[] | null;
  blockLabels?: Record<string, string>;
  cupperAlignment?: CupperAlignmentRow[] | null;
  partialSyncNotice?: string | null;
  translations: {
    title: string;
    backToCupping: string;
    refresh: string;
    refreshing: string;
    refreshNew: string;
    radarMine: string;
    radarCommunity: string;
    deltaAttribute: string;
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
    descViewAll: string;
    descOf: string;
    descParticipants: string;
    descEmptyStage: string;
    descEmptyBlock: string;
    descEmptyAll: string;
    alignTitle: string;
    alignSubtitle: string;
    alignExcluded: string;
    alignNoData: string;
    editSample: string;
    editSampleError: string;
    sampleLabel: string;
    coffeeName: string;
    coffeeCountry: string;
    coffeeRegion: string;
    coffeeFarm: string;
    producerRoaster: string;
    coffeeVariety: string;
    coffeeProcess: string;
    coffeeAltitude: string;
    coffeeRoastLevel: string;
    save: string;
    saving: string;
    cancel: string;
  };
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("mine");
  const [displayView, setDisplayView] = useState<DisplayView>("summary");
  const [refreshing, setRefreshing] = useState(false);
  const [newSubmissions, setNewSubmissions] = useState(0);
  const [, startTransition] = useTransition();
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  // Evaluation ids already counted toward the badge. Never cleared (only the
  // counter resets on refresh) so the no-op UPDATE storms from exclusion
  // toggles / owner recomputes don't re-badge the same evaluations.
  const seenEvalIds = useRef(new Set<string>());

  // ─── Realtime: badge the refresh button when other cuppers submit ──────────
  // Manual-refresh design is intentional (no auto re-render); this only tells
  // the viewer that pressing "Actualizar" will show something new.
  useEffect(() => {
    if (!isGroup || !canViewGroup) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const sampleIds = new Set(session.samples.map((s) => s.id));

    const channel = supabase
      .channel(`results:${session.id}`)
      .on(
        "postgres_changes",
        // No filter string (Realtime filter length limits) — filter client-side.
        { event: "UPDATE", schema: "public", table: "evaluations" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Columns are camelCase in Postgres; accept snake_case defensively.
          const isDraft = (row.isDraft ?? row.is_draft) as boolean | undefined;
          const sampleId = (row.sessionSampleId ?? row.session_sample_id) as
            | string
            | undefined;
          const cupperId = (row.cupperId ?? row.cupper_id) as string | undefined;
          const evalId = row.id as string | undefined;
          if (
            isDraft === false &&
            sampleId &&
            sampleIds.has(sampleId) &&
            cupperId !== currentUserId &&
            evalId &&
            !seenEvalIds.current.has(evalId)
          ) {
            seenEvalIds.current.add(evalId);
            setNewSubmissions((n) => n + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGroup, canViewGroup, session.id, session.samples, currentUserId]);

  const handleEditSample = (sampleId: string) => {
    router.push(`/${locale}/app/sessions/${session.id}/cup?sample=${sampleId}`);
  };

  const editingSample = session.samples.find((s) => s.id === editingSampleId) ?? null;

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    if (!editingSampleId) return;
    await updateSampleMetadata(editingSampleId, data);
    setEditingSampleId(null);
    router.refresh();
  };

  const handleReveal = (sampleId: string) => {
    startTransition(async () => {
      await revealSample(sampleId);
      router.refresh();
    });
  };

  const handleRefreshScores = async () => {
    setRefreshing(true);
    setNewSubmissions(0);
    try {
      // Owner-only self-healing recompute (re-fires the aggregate trigger).
      // Non-owners skip it: aggregates are trigger-maintained and the page
      // recomputes group data at render, so a re-render is all they need.
      if (isOwner) await refreshAggregateScores(session.id);
    } catch {
      // Swallow — the re-render below still shows the current server data.
    }
    router.refresh();
    setRefreshing(false);
  };

  const showGroup = view === "group" && canViewGroup;
  const canViewIndividual = isOwner && isGroup && !!participants?.length;
  const canViewDescriptors = !!descriptorFrequency?.length;
  // Defensive: fall back to summary if a gated view is selected without access.
  const effectiveDisplayView: DisplayView =
    (displayView === "individual" && !canViewIndividual) ||
    (displayView === "descriptors" && !canViewDescriptors)
      ? "summary"
      : displayView;

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
      className="absolute inset-0 bottom-14 lg:bottom-0 flex flex-col"
      style={{ background: "#FDFBF7", color: "#5C4A32" }}
    >
      {/* Docked header */}
      <div
        className="shrink-0 z-[1]"
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
            {translations.backToCupping}
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
              {translations.title}
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

        {isOwner && (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              padding: "0 16px 8px",
            }}
          >
            {session.samples.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditingSampleId(s.id)}
                style={{
                  flexShrink: 0,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  border: "1px solid #E8E0D0",
                  background: "transparent",
                  color: "#8B7355",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                ✎ {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Mine / Group pills — only relevant to table/chart views */}
        {canViewGroup && displayView !== "summary" && displayView !== "individual" && displayView !== "descriptors" && (
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
                background: refreshing
                  ? "#FEF3E2"
                  : newSubmissions > 0
                    ? "#C17817"
                    : "transparent",
                color: newSubmissions > 0 && !refreshing ? "#FFF" : "#C17817",
                fontSize: 11,
                fontWeight: 600,
                cursor: refreshing ? "default" : "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                transition: "background 0.2s, color 0.2s",
              }}
            >
              {refreshing
                ? translations.refreshing
                : newSubmissions > 0
                  ? translations.refreshNew.replace("{count}", String(newSubmissions))
                  : translations.refresh}
            </button>
          </div>
        )}

        {/* Participation + freshness — muted metadata under the pill row */}
        {canViewGroup &&
          displayView !== "summary" &&
          displayView !== "individual" &&
          displayView !== "descriptors" &&
          (participationLabel || lastUpdatedLabel) && (
            <div
              style={{
                padding: "0 16px 8px",
                display: "flex",
                gap: 12,
                fontSize: 10,
                color: "#8B7355",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {participationLabel && <span>{participationLabel}</span>}
              {lastUpdatedLabel && <span>{lastUpdatedLabel}</span>}
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
          {(
            [
              "summary",
              "table",
              "radar",
              ...(canViewDescriptors ? (["descriptors"] as const) : []),
              ...(canViewIndividual ? (["individual"] as const) : []),
            ] as DisplayView[]
          ).map((v) => (
            <button key={v} onClick={() => setDisplayView(v)} style={segStyle(displayView === v)}>
              {v === "summary"
                ? locale === "es" ? "📝 Resumen" : "📝 Summary"
                : v === "table"
                ? locale === "es" ? "📋 Tabla" : "📋 Table"
                : v === "radar"
                ? locale === "es" ? "📡 Gráfico" : "📡 Chart"
                : v === "descriptors"
                ? locale === "es" ? "🌸 Descriptores" : "🌸 Descriptors"
                : locale === "es" ? "👥 Individual" : "👥 Individual"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content region — header/footer dock outside it */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {showGroup && partialSyncNotice && (
        <div
          role="status"
          className="mx-4 mt-4 rounded-md border border-amber-warm/40 bg-amber-warm/10 px-4 py-2 font-sans text-sm text-amber-warm lg:mx-6"
        >
          {partialSyncNotice}
        </div>
      )}
      {effectiveDisplayView === "individual" && canViewIndividual ? (
        <div className="p-4 lg:p-6">
          <IndividualResultsPanel
            sessionId={session.id}
            participants={participants!}
            format={session.format}
            cupsPerSample={session.cupsPerSample}
            locale={locale}
          />
        </div>
      ) : effectiveDisplayView === "descriptors" && canViewDescriptors ? (
        <div className="p-4 lg:p-6 flex flex-col gap-6">
          <DescriptorFrequency
            samples={descriptorFrequency!}
            blockLabels={blockLabels ?? {}}
            t={{
              viewAll: translations.descViewAll,
              of: translations.descOf,
              participants: translations.descParticipants,
              emptyBlock: translations.descEmptyBlock,
              emptyAll: translations.descEmptyAll,
            }}
          />
          {/* Owner-only cupper alignment (uses per-participant consensus data). */}
          {isOwner && cupperAlignment && cupperAlignment.length > 0 && (
            <CupperAlignment
              rows={cupperAlignment}
              t={{
                title: translations.alignTitle,
                subtitle: translations.alignSubtitle,
                excluded: translations.alignExcluded,
                noData: translations.alignNoData,
              }}
            />
          )}
        </div>
      ) : effectiveDisplayView === "summary" ? (
        <div className="p-4 lg:p-6">
          <MyResultsSummary
            samples={session.samples}
            format={session.format}
            cupsPerSample={session.cupsPerSample}
            locale={locale}
            onEdit={handleEditSample}
          />
        </div>
      ) : effectiveDisplayView === "table" ? (
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
                    <FlavorCloud descriptive={sample.descriptive} locale={locale === "en" ? "en" : "es"} />
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
                locale={locale}
                t={{
                  mine: translations.radarMine,
                  community: translations.radarCommunity,
                  deltaAttribute: translations.deltaAttribute,
                }}
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
                  <FlavorCloud descriptive={sample.descriptive} locale={locale === "en" ? "en" : "es"} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Print CTA — docked footer */}
      <div
        className="shrink-0"
        style={{
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "12px 16px",
          paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.push(`/${locale}/app/sessions/${session.id}/print`)}
            style={{
              flex: 1,
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
          {/* Server-generated CVA PDF — plain link so no @react-pdf ships to the client. */}
          <a
            href={`/api/sessions/${session.id}/cva-pdf?locale=${locale}`}
            style={{
              flex: 1,
              padding: "13px 0",
              borderRadius: 10,
              border: "1.5px solid #3D5A3E",
              background: "#FFF",
              color: "#3D5A3E",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              letterSpacing: "0.3px",
              textAlign: "center",
              textDecoration: "none",
              lineHeight: "1.2",
            }}
          >
            📄 {locale === "en" ? "Download PDF (CVA)" : "Descargar PDF (CVA)"}
          </a>
        </div>
      </div>

      {isOwner && editingSample && (
        <ResponsiveDialog
          open
          onOpenChange={() => setEditingSampleId(null)}
          title={`${translations.editSample}: ${editingSample.label}`}
        >
          <EditSampleMetadataForm
            initialData={{
              label: editingSample.label,
              name: editingSample.masterCoffee?.name ?? "",
              country: editingSample.masterCoffee?.country ?? "",
              region: editingSample.masterCoffee?.region ?? "",
              farm: editingSample.masterCoffee?.farm ?? "",
              producer: editingSample.masterCoffee?.producer ?? "",
              variety: editingSample.masterCoffee?.variety ?? "",
              processType: editingSample.masterCoffee?.processType ?? "",
              altitude: editingSample.masterCoffee?.altitude ?? "",
              roastLevel: editingSample.masterCoffee?.roastLevel ?? "",
            }}
            onSubmit={handleSaveSampleMetadata}
            onCancel={() => setEditingSampleId(null)}
            translations={{
              label: translations.sampleLabel,
              name: translations.coffeeName,
              country: translations.coffeeCountry,
              region: translations.coffeeRegion,
              farm: translations.coffeeFarm,
              producer: translations.producerRoaster,
              variety: translations.coffeeVariety,
              process: translations.coffeeProcess,
              altitude: translations.coffeeAltitude,
              roastLevel: translations.coffeeRoastLevel,
              save: translations.save,
              saving: translations.saving,
              cancel: translations.cancel,
              error: translations.editSampleError,
            }}
          />
        </ResponsiveDialog>
      )}
    </div>
  );
}

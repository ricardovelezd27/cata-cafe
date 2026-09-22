"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { revealSample, refreshAggregateScores, resendCloseEmails } from "@/app/actions/community";
import { ScoreTable, type ScoreTableTranslations } from "@/components/results/ScoreTable";
import { SampleRadarChart } from "@/components/results/SampleRadarChart";
import type { ScoreBreakdownTranslations } from "@/components/results/ScoreBreakdownPanel";
import { FlavorCloud } from "@/components/results/FlavorCloud";
import type { SampleBlockFreq } from "@/components/results/DescriptorFrequency";
import type { CupperAlignmentRow } from "@/components/results/CupperAlignment";
import { DescriptoresTab } from "./DescriptoresTab";
import {
  OwnerParticipantSection,
  type ParticipantResult,
} from "@/components/results/OwnerParticipantSection";
import {
  SampleDetailDialog,
  type SampleDetailDialogTranslations,
  type SampleDetailParticipant,
} from "@/components/results/SampleDetailDialog";
import { GuestSaveCta, type GuestSaveCtaTranslations } from "@/components/results/GuestSaveCta";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ExtrinsicEditDialog } from "@/components/results/ExtrinsicEditDialog";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  PillTabs,
  SegmentedControl,
  InfoHint,
  Button,
  ButtonLink,
  useActionFeedback,
} from "@/components/ui";
import { updateSampleMetadata } from "@/app/actions/sessions";
import { asSessionFormat, type SessionFormat } from "@/lib/constants";
import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import { ArrowLeft, FileDown, Printer, RefreshCw } from "lucide-react";
import { ResumenTab } from "./ResumenTab";
import type { SampleResult, ResultsHelp } from "./types";

type MatrixTranslations = {
  title: string;
  manageTitle: string;
  manageHint: string;
  included: string;
  excluded: string;
  excludedTag: string;
  legendGreen: string;
  legendAmber: string;
  legendRed: string;
  noScore: string;
  sdHeader: string;
};

type Tab = "resumen" | "resultados" | "descriptores";
type ResultsView = "tabla" | "grafico";

const RESULTS_VIEW_KEY = "cata_results_view";
const RESULTS_VIEW_EVENT = "cata-results-view-change";

// Persisted Tabla/Gráfico choice read via an external store (same pattern as
// DashboardIntro) so we avoid setState-in-effect and hydration flashes.
function subscribeResultsView(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(RESULTS_VIEW_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(RESULTS_VIEW_EVENT, cb);
  };
}
function getResultsViewSnapshot(): ResultsView {
  return localStorage.getItem(RESULTS_VIEW_KEY) === "grafico" ? "grafico" : "tabla";
}
function getResultsViewServerSnapshot(): ResultsView {
  return "tabla";
}

export function ResultsClient({
  locale,
  session,
  isOwner,
  isAdminViewer = false,
  adminViewNotice = null,
  adminOwnerName = null,
  isGroup,
  canViewGroup,
  sessionStatus,
  closedOnLabel = null,
  closeEmails = null,
  currentUserId,
  participationLabel,
  lastUpdatedLabel,
  participants,
  descriptorFrequency,
  blockLabels,
  cupperAlignment,
  partialSyncNotice,
  knownEvalIds,
  format,
  myAlignment,
  participation,
  isSoloDescriptors,
  guestSave = null,
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
  // Super-admin read-only view of someone else's session: owner-equivalent
  // READS (matrix, alignment, master coffee), zero mutation affordances.
  isAdminViewer?: boolean;
  adminViewNotice?: string | null;
  // Owner's display name — replaces the "Mi evaluación" pill label, since the
  // "mine" slots hold the owner's evaluation in the admin view.
  adminOwnerName?: string | null;
  isGroup: boolean;
  canViewGroup: boolean;
  // "active" | "closed" (+ legacy "draft"/"open") — gates the backToCupping
  // button (a closed session's cupping form is final) and the closed notice.
  sessionStatus: string;
  // Pre-formatted "Cata cerrada el {date}" — null unless this is a closed
  // group session (see CLAUDE.md's product-law on closedAt).
  closedOnLabel?: string | null;
  // Owner-only, closed group sessions: pre-formatted close-email summary line
  // + whether the resend action should show (failed or pending recipients).
  closeEmails?: { line: string; showResend: boolean } | null;
  currentUserId: string;
  participationLabel?: string | null;
  lastUpdatedLabel?: string | null;
  participants?: ParticipantResult[] | null;
  descriptorFrequency?: SampleBlockFreq[] | null;
  blockLabels?: Record<string, string>;
  cupperAlignment?: CupperAlignmentRow[] | null;
  partialSyncNotice?: string | null;
  knownEvalIds?: string[];
  // Narrowed session format (mirrors session.format, typed) — feeds the
  // Resumen dashboard's score derivation and ranking gates.
  format?: SessionFormat;
  // Every viewer's own alignment triple (never another cupper's row/name/id).
  myAlignment?: { alignment: number; matches: number; opportunities: number } | null;
  // Group-session submission progress, shown in the Resumen dashboard.
  participation?: { submitted: number; total: number } | null;
  // True for solo descriptive/combined sessions — the Descriptores tab (and
  // the Resumen highlights card) feed from the current user's own data
  // instead of the anonymous group core.
  isSoloDescriptors?: boolean;
  // Non-null only when the viewer is an anonymous guest: the "save your
  // results" banner that sends them through the normal login flow with a
  // claim token (see lib/guestClaim.ts).
  guestSave?: GuestSaveCtaTranslations | null;
  translations: {
    title: string;
    backToCupping: string;
    viewForm: string;
    downloadPdf: string;
    refresh: string;
    refreshing: string;
    refreshNew: string;
    radarMine: string;
    radarCommunity: string;
    deltaAttribute: string;
    flavorProfiles: string;
    referenceBadge: string;
    deltaVsReference: string;
    deltaVsReferenceAria: string;
    referenceLegend: string;
    tabResumen: string;
    tabResultados: string;
    tabDescriptores: string;
    viewTable: string;
    viewChart: string;
    communityPending: string;
    ownerSection: string;
    liveUpdatesDown: string;
    closeEmailsResend: string;
    closeEmailsResending: string;
    closeEmailsResent: string;
    closeEmailsResendError: string;
    descViewAll: string;
    descOf: string;
    descParticipants: string;
    descEmptyStage: string;
    descEmptyBlock: string;
    descEmptyAll: string;
    cloudTitle: string;
    cloudScopeSession: string;
    cloudScopeSample: string;
    cloudScopeTaster: string;
    cloudEmpty: string;
    filterSampleAll: string;
    filterBlockLabel: string;
    soloCloudTitle: string;
    tasterScopeAll: string;
    alignTitle: string;
    alignSubtitle: string;
    alignExcluded: string;
    alignNoData: string;
    editSample: string;
    editSampleError: string;
    editSampleNotOwner: string;
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
    dashboard: {
      statSamples: string;
      statParticipation: string;
      statAvg: string;
      statBest: string;
      statAvgMine: string;
      statAvgCommunity: string;
      ranking: string;
      notScored: string;
      performance: string;
      myAvg: string;
      communityAvg: string;
      alignmentLabel: string;
      alignmentNote: string;
      highlights: string;
      soloTopDescriptors: string;
      viewInDescriptors: string;
      communityPending: string;
      sdAria: string;
      referenceBadge: string;
      deltaVsReference: string;
      deltaVsReferenceAria: string;
    };
    table: ScoreTableTranslations;
    detail: SampleDetailDialogTranslations;
    matrix: MatrixTranslations;
    breakdown: ScoreBreakdownTranslations;
    help: ResultsHelp;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("resumen");
  // Sub-view of the Resultados tab, persisted across visits.
  const resultsView = useSyncExternalStore(
    subscribeResultsView,
    getResultsViewSnapshot,
    getResultsViewServerSnapshot,
  );
  const changeResultsView = (v: string) => {
    try {
      window.localStorage.setItem(RESULTS_VIEW_KEY, v === "grafico" ? "grafico" : "tabla");
    } catch {
      // Private mode / storage denied — the choice just won't persist.
    }
    window.dispatchEvent(new Event(RESULTS_VIEW_EVENT));
  };
  const [refreshing, setRefreshing] = useState(false);
  const [newSubmissions, setNewSubmissions] = useState(0);
  // Realtime channel is not SUBSCRIBED — "no new submissions" may just mean
  // "we stopped listening", so point the viewer at the refresh button (F10).
  const [liveUpdatesDown, setLiveUpdatesDown] = useState(false);
  const [, startTransition] = useTransition();
  const feedback = useActionFeedback();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [editingExtrinsicSampleId, setEditingExtrinsicSampleId] = useState<string | null>(null);
  // Set after a metadata save when the linked coffee belongs to someone else
  // — the label still saved, but the coffee record itself was skipped.
  const [coffeeNotOwnedNotice, setCoffeeNotOwnedNotice] = useState(false);
  // Personal drill-down dialog. participantId is non-null only when the owner
  // opens another catador's evaluation from the CVA matrix.
  const [detail, setDetail] = useState<{ sampleId: string; participantId: string | null } | null>(
    null,
  );
  // Evaluation ids already counted toward the badge — SEEDED with the ids that
  // were visible at page load, and never cleared (only the counter resets on
  // refresh), so the no-op UPDATE storms from exclusion toggles / owner
  // recomputes don't re-badge evaluations the viewer has already seen.
  const seenEvalIds = useRef(new Set<string>(knownEvalIds));

  // ─── Realtime: badge the refresh button when other cuppers submit ──────────
  // Manual-refresh design is intentional (no auto re-render); this only tells
  // the viewer that pressing "Actualizar" will show something new.
  useEffect(() => {
    if (!isGroup || !canViewGroup) return;
    // Admin god-mode runs under the admin's own JWT, and the evaluations RLS
    // policy only exposes own/participant rows — the subscription would be a
    // dead socket. Server renders run as postgres, so manual refresh works.
    if (isAdminViewer) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const sampleIds = new Set(session.samples.map((s) => s.id));

    const channel = supabase
      .channel(`results:${session.id}`)
      .on(
        "postgres_changes",
        // Denormalized sessionId column lets Realtime filter server-side; sampleIds/isDraft guards stay client-side.
        {
          event: "UPDATE",
          schema: "public",
          table: "evaluations",
          filter: `sessionId=eq.${session.id}`,
        },
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
      // A dropped channel otherwise looks exactly like "no new submissions".
      // Flag it so the viewer knows to use Actualizar instead of waiting (F10).
      .subscribe((status) => {
        setLiveUpdatesDown(status !== "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGroup, canViewGroup, isAdminViewer, session.id, session.samples, currentUserId]);

  const handleEditSample = (sampleId: string) => {
    router.push(`/${locale}/app/sessions/${session.id}/cup?sample=${sampleId}`);
  };

  const editingSample = session.samples.find((s) => s.id === editingSampleId) ?? null;
  const editingExtrinsicSample =
    session.samples.find((s) => s.id === editingExtrinsicSampleId) ?? null;

  const detailSample = detail ? (session.samples.find((s) => s.id === detail.sampleId) ?? null) : null;
  const detailParticipants: SampleDetailParticipant[] | null =
    (isOwner || isAdminViewer) && participants && participants.length > 0 ? participants : null;

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    if (!editingSampleId) return;
    const result = await updateSampleMetadata(editingSampleId, data);
    setEditingSampleId(null);
    setCoffeeNotOwnedNotice(!result.coffeeUpdated);
    router.refresh();
  };

  const handleReveal = (sampleId: string) => {
    startTransition(async () => {
      try {
        await revealSample(sampleId);
        router.refresh();
      } catch {
        feedback.notifyError("unknown");
      }
    });
  };

  const handleRefreshScores = async () => {
    setRefreshing(true);
    setNewSubmissions(0);
    try {
      // The button is available to everyone; only the owner additionally fires
      // the self-healing trigger recompute. Non-owners just re-render: the page
      // recomputes group data at render and the trigger re-stamps computedAt on
      // every submission, so a plain refresh is always fresh for them.
      if (isOwner) await refreshAggregateScores(session.id);
    } catch {
      // Swallow — the re-render below still shows the current server data.
      feedback.notifyError("unknown");
    }
    router.refresh();
    setRefreshing(false);
  };

  const handleResendCloseEmails = () => {
    setResendState("sending");
    startTransition(async () => {
      try {
        const r = await resendCloseEmails(session.id);
        setResendState(r.ok ? "sent" : "error");
        if (!r.ok) feedback.notifyError("unknown");
      } catch {
        setResendState("error");
        feedback.notifyError("unknown");
      }
    });
  };

  // One merged view: community data renders whenever the viewer may see it —
  // the old "Mis resultados / Resultados grupales" toggle is gone.
  const showCommunity = canViewGroup;
  const canViewIndividual = (isOwner || isAdminViewer) && isGroup && !!participants?.length;
  const canViewDescriptors = !!descriptorFrequency?.length;

  // ─── Reference (control) sample — display-only Δ basis for the ranking,
  // table, radar, matrix, and drill-down surfaces. Scoring is untouched;
  // this only decides what a Δ chip compares against. ───────────────────────
  const resolvedFormat = format ?? asSessionFormat(session.format);
  const referenceId = session.samples.find((s) => s.isReference)?.id ?? null;
  const referenceSample = referenceId
    ? (session.samples.find((s) => s.id === referenceId) ?? null)
    : null;
  // Same "my score" derivation ScoreTable/ResumenTab use: pick the format's
  // affective dataset, guard on hasAffectiveData, then calcIndividualScore.
  const referenceMyScore = ((): number | null => {
    if (!referenceSample) return null;
    const affData =
      resolvedFormat === "affective"
        ? referenceSample.affective
        : resolvedFormat === "combined"
          ? referenceSample.combined
          : null;
    if (!affData || !hasAffectiveData(affData)) return null;
    const score = calcIndividualScore(affData, session.cupsPerSample);
    return typeof score === "number" ? score : null;
  })();
  // Each surface pairs bases itself (ScoreTable per row, ResumenTab via
  // rankFor's basis, the radar own-vs-own) — never mix my score with the
  // reference's community score in one Δ.

  // ─── Descriptores tab filters (lifted so the Resumen dashboard can
  // preselect a sample before switching tabs) ────────────────────────────────
  const [descSampleId, setDescSampleId] = useState<"all" | string>("all");
  const [descBlockId, setDescBlockId] = useState<string>("general");

  // Defensive: fall back to the dashboard if a gated tab is selected without access.
  const effectiveTab: Tab =
    tab === "descriptores" && !canViewDescriptors ? "resumen" : tab;

  const tabItems = [
    { id: "resumen", label: translations.tabResumen },
    { id: "resultados", label: translations.tabResultados },
    ...(canViewDescriptors
      ? [{ id: "descriptores", label: translations.tabDescriptores }]
      : []),
  ];

  return (
    <div className="absolute inset-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] lg:bottom-0 flex flex-col bg-surface text-on-surface">
      {/* Docked header — three stacked rows, same structure on mobile and desktop */}
      <div className="shrink-0 z-[1] border-b border-outline-variant bg-surface">
        {/* Row 1: title block — no controls */}
        <div className="px-4 pt-3 pb-1">
          <div className="font-display text-xl text-primary-container leading-tight">
            {translations.title}
          </div>
          <div className="truncate text-[11px] text-on-surface-variant">
            {session.name} · {session.date}
          </div>
        </div>

        {/* Row 2: actions */}
        <div className="flex items-center gap-2 px-4 py-2">
          {/* Admin view: /cup would just bounce back here — hide the loop.
              A closed session's cupping form is final, so the button never
              renders once the session is closed (for anyone). */}
          {!isAdminViewer && sessionStatus !== "closed" && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeft size={14} aria-hidden />}
              onClick={() => router.push(`/${locale}/app/sessions/${session.id}/cup`)}
            >
              {translations.backToCupping}
            </Button>
          )}
          <Button
            size="sm"
            variant={newSubmissions > 0 && !refreshing ? "accent" : "accentOutline"}
            icon={<RefreshCw size={14} aria-hidden className={refreshing ? "animate-spin" : ""} />}
            onClick={handleRefreshScores}
            disabled={refreshing}
            className="ml-auto"
          >
            {refreshing
              ? translations.refreshing
              : newSubmissions > 0
                ? translations.refreshNew.replace("{count}", String(newSubmissions))
                : translations.refresh}
          </Button>
        </div>

        {liveUpdatesDown && (
          <p role="status" className="px-4 pb-2 text-[11px] text-secondary">
            {translations.liveUpdatesDown}
          </p>
        )}

        {closeEmails && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 text-[11px] text-on-surface-variant">
            <span>{closeEmails.line}</span>
            {closeEmails.showResend && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResendCloseEmails}
                disabled={resendState === "sending"}
              >
                {resendState === "sending"
                  ? translations.closeEmailsResending
                  : resendState === "sent"
                    ? translations.closeEmailsResent
                    : resendState === "error"
                      ? translations.closeEmailsResendError
                      : translations.closeEmailsResend}
              </Button>
            )}
          </div>
        )}

        {closedOnLabel && (
          <div className="px-4 pb-2">
            <span
              role="status"
              className="inline-flex rounded-card border border-outline-variant bg-surface-container px-3 py-1 text-[11px] text-on-surface-variant"
            >
              {closedOnLabel}
            </span>
          </div>
        )}

        {/* Row 3: participation/freshness meta + main tabs */}
        {canViewGroup && (participationLabel || lastUpdatedLabel) && (
          <div className="flex gap-3 overflow-hidden whitespace-nowrap px-4 pb-2 text-[10px] tabular-nums text-on-surface-variant">
            {participationLabel && <span>{participationLabel}</span>}
            {lastUpdatedLabel && <span>{lastUpdatedLabel}</span>}
          </div>
        )}
        <div className="px-4 pb-2">
          <PillTabs
            items={tabItems}
            value={effectiveTab}
            onChange={(id) => {
              setTab(id as Tab);
              setDetail(null);
            }}
            ariaLabel={translations.title}
          />
        </div>
      </div>

      {/* Scrollable content region — header/footer dock outside it */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {adminViewNotice && (
        <div
          role="status"
          className="mx-4 mt-4 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6"
        >
          {adminViewNotice}
        </div>
      )}
      {partialSyncNotice && (
        <div
          role="status"
          className="mx-4 mt-4 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6"
        >
          {partialSyncNotice}
        </div>
      )}
      {coffeeNotOwnedNotice && (
        <div
          role="status"
          className="mx-4 mt-4 flex items-start gap-2 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6"
        >
          <span className="flex-1">{translations.editSampleNotOwner}</span>
          <button
            type="button"
            onClick={() => setCoffeeNotOwnedNotice(false)}
            aria-label={translations.detail.close}
            className="shrink-0 font-semibold hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      )}
      {guestSave && !isAdminViewer && (
        <GuestSaveCta sessionId={session.id} locale={locale} translations={guestSave} />
      )}
      {effectiveTab === "descriptores" && canViewDescriptors ? (
        <div className="p-4 lg:p-6">
          <DescriptoresTab
            descriptorFrequency={descriptorFrequency!}
            blockLabels={blockLabels ?? {}}
            cupperAlignment={cupperAlignment ?? null}
            participants={isOwner || isAdminViewer ? (participants ?? null) : null}
            isOwner={isOwner || isAdminViewer}
            isSoloDescriptors={isSoloDescriptors ?? false}
            format={format ?? asSessionFormat(session.format)}
            sampleId={descSampleId}
            onSampleIdChange={setDescSampleId}
            blockId={descBlockId}
            onBlockIdChange={setDescBlockId}
            locale={locale}
            t={{
              cloudTitle: translations.cloudTitle,
              soloCloudTitle: translations.soloCloudTitle,
              cloudEmpty: translations.cloudEmpty,
              filterSampleAll: translations.filterSampleAll,
              filterBlockLabel: translations.filterBlockLabel,
              tasterScopeAll: translations.tasterScopeAll,
              descViewAll: translations.descViewAll,
              descOf: translations.descOf,
              descParticipants: translations.descParticipants,
              descEmptyBlock: translations.descEmptyBlock,
              descEmptyAll: translations.descEmptyAll,
              close: translations.cancel,
              alignTitle: translations.alignTitle,
              alignSubtitle: translations.alignSubtitle,
              alignExcluded: translations.alignExcluded,
              alignNoData: translations.alignNoData,
            }}
            help={translations.help}
          />
        </div>
      ) : effectiveTab === "resumen" ? (
        <div className="p-4 lg:p-6 flex flex-col gap-6">
          <ResumenTab
            samples={session.samples}
            format={format ?? asSessionFormat(session.format)}
            cupsPerSample={session.cupsPerSample}
            isGroup={isGroup}
            canViewGroup={canViewGroup}
            participation={participation ?? null}
            myAlignment={myAlignment ?? null}
            descriptorFrequency={descriptorFrequency ?? null}
            isSoloDescriptors={isSoloDescriptors ?? false}
            referenceId={referenceId}
            locale={locale}
            onOpenSample={(id) => {
              setTab("resultados");
              setDetail({ sampleId: id, participantId: null });
            }}
            onOpenDescriptors={(id) => {
              setTab("descriptores");
              if (id) setDescSampleId(id);
            }}
            t={translations.dashboard}
            help={translations.help}
          />
        </div>
      ) : (
        <div className="p-4 lg:p-6 flex flex-col gap-5">
          {/* Tabla / Gráfico sub-view switch — the hint's content follows the active sub-view */}
          <div className="flex w-full max-w-[400px] items-center justify-center gap-2 self-center">
            <SegmentedControl
              className="w-full max-w-[360px]"
              items={[
                { id: "tabla", label: translations.viewTable },
                { id: "grafico", label: translations.viewChart },
              ]}
              value={resultsView}
              onChange={changeResultsView}
              ariaLabel={translations.tabResultados}
            />
            <InfoHint
              title={translations.help[resultsView].title}
              body={translations.help[resultsView].body}
              closeLabel={translations.help.closeLabel}
            />
            {referenceId !== null && (
              <InfoHint
                title={translations.help.referencia.title}
                body={translations.help.referencia.body}
                closeLabel={translations.help.closeLabel}
              />
            )}
          </div>

          {/* Community results not yet visible to this participant */}
          {isGroup && !canViewGroup && (
            <div className="rounded-card border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
              {translations.communityPending}
            </div>
          )}

          {resultsView === "tabla" ? (
            <>
              <ScoreTable
                samples={session.samples}
                cupsPerSample={session.cupsPerSample}
                format={format ?? asSessionFormat(session.format)}
                showCommunity={showCommunity}
                isOwner={isOwner}
                onReveal={handleReveal}
                onOpenDetail={(id) => setDetail({ sampleId: id, participantId: null })}
                referenceId={referenceId}
                t={{
                  ...translations.table,
                  referenceBadge: translations.referenceBadge,
                  deltaVsReference: translations.deltaVsReference,
                  deltaVsReferenceAria: translations.deltaVsReferenceAria,
                  referenceLegend: translations.referenceLegend,
                }}
              />
              {session.samples.some((s) => Object.keys(s.descriptive).length > 0) && (
                <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
                  <div className="mb-3 font-display text-[15px] font-medium text-primary-container">
                    {translations.flavorProfiles}
                  </div>
                  <div className="flex flex-col gap-4">
                    {session.samples.map((sample) => (
                      <div key={sample.id}>
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                          {sample.label}
                        </div>
                        <FlavorCloud descriptive={sample.descriptive} locale={locale === "en" ? "en" : "es"} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {session.samples.map((sample) => (
                <div key={sample.id} className="flex flex-col">
                  <SampleRadarChart
                    sample={sample}
                    format={format ?? asSessionFormat(session.format)}
                    cupsPerSample={session.cupsPerSample}
                    showCommunity={showCommunity}
                    isOwner={isOwner}
                    onReveal={handleReveal}
                    referenceMyScore={referenceMyScore}
                    referenceBadge={translations.referenceBadge}
                    deltaVsReference={translations.deltaVsReference}
                    deltaVsReferenceAria={translations.deltaVsReferenceAria}
                    t={{
                      mine: translations.radarMine,
                      community: translations.radarCommunity,
                      deltaAttribute: translations.deltaAttribute,
                      breakdown: translations.breakdown,
                    }}
                  />
                  {Object.keys(sample.descriptive).length > 0 && (
                    <div className="rounded-b-card border border-t-0 border-outline-variant bg-surface-container-lowest px-4 pb-4 pt-3">
                      <FlavorCloud descriptive={sample.descriptive} locale={locale === "en" ? "en" : "es"} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Owner-only: per-catador analysis, integrated into Resultados */}
          {canViewIndividual && (
            <section className="flex flex-col gap-3">
              <h2 className="inline-flex items-center gap-1.5 font-display text-xl text-primary-container">
                {translations.ownerSection}
                <InfoHint
                  title={translations.help.porCatador.title}
                  body={translations.help.porCatador.body}
                  closeLabel={translations.help.closeLabel}
                />
              </h2>
              <OwnerParticipantSection
                sessionId={session.id}
                participants={participants!}
                format={format ?? asSessionFormat(session.format)}
                cupsPerSample={session.cupsPerSample}
                readOnly={isAdminViewer}
                onOpenDetail={(sampleId, participantId) => setDetail({ sampleId, participantId })}
                referenceBadge={translations.referenceBadge}
                t={translations.matrix}
              />
            </section>
          )}
        </div>
      )}
      </div>

      {/* Print CTA — docked footer */}
      <div
        className="shrink-0 border-t border-outline-variant bg-surface px-4 pt-3"
        style={{ paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))" }}
      >
        <div className="flex gap-2">
          <Button
            size="md"
            variant="secondary"
            icon={<Printer size={16} aria-hidden />}
            className="flex-1"
            onClick={() => router.push(`/${locale}/app/sessions/${session.id}/print`)}
          >
            {translations.viewForm}
          </Button>
          {/* Server-generated CVA PDF — plain link so no @react-pdf ships to the client. */}
          <ButtonLink
            href={`/api/sessions/${session.id}/cva-pdf?locale=${locale}`}
            size="md"
            variant="primary"
            icon={<FileDown size={16} aria-hidden />}
            className="flex-1"
          >
            {translations.downloadPdf}
          </ButtonLink>
        </div>
      </div>

      {detailSample && (
        <SampleDetailDialog
          open
          onClose={() => setDetail(null)}
          sample={detailSample}
          isOwner={isOwner}
          participants={detailParticipants}
          initialParticipantId={detail?.participantId ?? null}
          format={format ?? asSessionFormat(session.format)}
          cupsPerSample={session.cupsPerSample}
          locale={locale}
          referenceBadge={translations.referenceBadge}
          onEdit={isAdminViewer ? undefined : () => handleEditSample(detailSample.id)}
          onEditMetadata={
            isOwner
              ? () => {
                  setDetail(null);
                  setEditingSampleId(detailSample.id);
                }
              : undefined
          }
          onEditExtrinsic={
            // Blind integrity: origin data is only ever editable once the
            // sample is revealed, and the admin god-mode view stays read-only.
            isOwner && detailSample.revealed && !isAdminViewer
              ? () => {
                  setDetail(null);
                  setEditingExtrinsicSampleId(detailSample.id);
                }
              : undefined
          }
          t={
            // Admin view: the "me" slot holds the OWNER's evaluation, so the
            // switcher pill is labeled with the owner's name instead.
            adminOwnerName
              ? { ...translations.detail, myEvaluation: adminOwnerName }
              : translations.detail
          }
        />
      )}

      {isOwner && editingSample && (
        <ResponsiveDialog
          open
          onOpenChange={() => setEditingSampleId(null)}
          title={`${translations.editSample}: ${editingSample.label}`}
          closeLabel={translations.cancel}
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

      {isOwner && editingExtrinsicSample && (
        <ExtrinsicEditDialog
          sampleId={editingExtrinsicSample.id}
          sampleLabel={editingExtrinsicSample.label}
          initialData={editingExtrinsicSample.extrinsic}
          onClose={() => setEditingExtrinsicSampleId(null)}
          t={{
            title: translations.detail.editExtrinsic,
            save: translations.save,
            saving: translations.saving,
            cancel: translations.cancel,
            error: translations.editSampleError,
          }}
        />
      )}
    </div>
  );
}

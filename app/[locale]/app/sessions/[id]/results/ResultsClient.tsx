"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RESULTS_TAB_PARAM, resultsTabFrom, resultsTabParam, withParams } from "@/lib/viewAddress";
import { tabIds } from "@/lib/rovingFocus";
import { createBrowserClient } from "@supabase/ssr";
import { subscribeWithSessionAuth } from "@/lib/supabase/realtimeAuth";
import { revealSample, refreshAggregateScores, resendCloseEmails, finishSoloSession, closeSession } from "@/app/actions/community";
import { planFinish, soloCloseAsIsOffer } from "@/lib/closeRules";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CupperAlignmentRow } from "@/components/results/CupperAlignment";
import { PanelView } from "@/components/results/PanelView";
import { pendingSentence, type PanelStrings } from "@/components/results/panelStrings";
import { panelPending } from "@/lib/reports/panel";
import { useSheetAddress } from "./useSheetAddress";
import type { ParticipantResult } from "@/components/results/OwnerParticipantSection";
import {
  SampleDetailDialog,
  type SampleDetailDialogTranslations,
  type SampleDetailParticipant,
} from "@/components/results/SampleDetailDialog";
import { GuestSaveCta, type GuestSaveCtaTranslations } from "@/components/results/GuestSaveCta";
import {
  SessionSyncStatus,
  type SessionSyncStatusTranslations,
} from "@/components/offline/SessionSyncStatus";
import { canShowMyScore } from "@/lib/evaluationState";
import {
  referencesOf,
  resolveCompareReference,
} from "@/lib/referenceRules";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ExtrinsicEditDialog } from "@/components/results/ExtrinsicEditDialog";
import {
  LateEvaluationsPanel,
  type LateEvaluationsTranslations,
} from "@/components/results/LateEvaluationsPanel";
import {
  PostCloseNoteEditor,
  PostCloseNoteReadOnly,
  type PostCloseNoteTranslations,
} from "@/components/results/PostCloseNote";
import type { OwnerLateRow, PostCloseNotesPayload } from "@/lib/lateContributions";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  PillTabs,
  SegmentedControl,
  InfoHint,
  Button,
  Notice,
  useActionFeedback,
} from "@/components/ui";
import { ResultsExportSheet } from "@/components/results/ResultsExportSheet";
import { resultsExportActions } from "@/lib/resultsExports";
import { useForegroundResume } from "@/hooks/useForegroundResume";
import { assignSampleCoffee, updateSampleMetadata } from "@/app/actions/sessions";
import { CoffeePicker, type UsableCoffee } from "@/components/coffees/CoffeePicker";
import { asSessionFormat, type SessionFormat } from "@/lib/constants";
import { calcIndividualScore, hasIndividualScore } from "@/lib/scoring";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SessionOverview } from "@/components/results/SessionOverview";
import { CoffeeCards } from "@/components/results/CoffeeCards";
import { Learnings, Reflection } from "@/components/results/Learnings";
import type { LearningsStrings } from "@/components/results/learningsStrings";
import type { LearningsPayload } from "@/lib/reports/learningsInput";
import type { CardsStrings } from "@/components/results/cardsStrings";
import type { SheetStrings } from "@/components/results/sheetStrings";
import type { SheetData } from "@/lib/reports/coffeeSheet";
import { wheelNodeLabels } from "@/lib/flavorWheelLabels";
import { coffeeCards, compareOptions } from "@/lib/reports/coffeeCards";
import type { OverviewData } from "@/lib/reports/overview";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import type { WheelFamilyId } from "@/lib/flavorWheel";
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
  partialLabel?: string;
  sdHeader: string;
  includedCount: string;
  excludeDialogTitle: string;
  excludeDialogBody: string;
  oldRuleNote: string | null;
  excludeReasonLabel: string;
  excludeOtherLabel: string;
  closedNote: string | null;
  excludeConfirm: string;
  dialogCancel: string;
  dialogClose: string;
  excludedTrail: string;
  excludedToast: string;
  restoredToast: string;
  reasons: Record<string, string>;
};

// The first view is the results themselves (the overview, then a card per
// coffee, each opening its sheet). "panel" is the organizer's working view: the
// per-cupper matrix and the alignment table, until package R5 gives it its own
// page. A participant has ONE view and no tab bar.
type Tab = "resumen" | "panel";

// What lies under the territories of "Comparar" (FlavorCompare's `ground`):
// "rings" is the recommendation, "families" the alternative. One line, the
// owner's to confirm.
const COMPARE_GROUND: "rings" | "families" = "rings";

// "Comparar con" pick (S6 multi-reference): which reference the Δ chips use.
// Same external-store pattern; "" = nothing chosen → the active reference.
const COMPARE_REF_KEY = "cata_results_ref";
const COMPARE_REF_EVENT = "cata:results-ref";
function subscribeCompareRef(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(COMPARE_REF_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(COMPARE_REF_EVENT, cb);
  };
}
function getCompareRefSnapshot(): string {
  try {
    return localStorage.getItem(COMPARE_REF_KEY) ?? "";
  } catch {
    return "";
  }
}
function getCompareRefServerSnapshot(): string {
  return "";
}

export function ResultsClient({
  locale,
  usableCoffees = [],
  session,
  isOwner,
  isAdminViewer = false,
  adminViewNotice = null,
  adminOwnerName = null,
  isGroup,
  canViewGroup,
  cuppingOpen,
  sessionClosed,
  closedOnLabel = null,
  updatedAfterCloseLabel = null,
  exclusionNotice = null,
  closeEmails = null,
  currentUserId,
  lastUpdatedLabel,
  participants,
  blockLabels,
  cupperAlignment,
  partialSyncNotice,
  knownEvalIds,
  overview,
  format,
  myAlignment,
  guestSave = null,
  myDraftNotice = null,
  closedNotice = null,
  lateRows = null,
  myLateNotices = [],
  postCloseNotes = null,
  lateTranslations,
  noteTranslations,
  finish = null,
  closeNow = null,
  closeAsIs = null,
  revealConfirm = null,
  sync = null,
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
  // False once the session is closed OR its closesAt passed (server clock):
  // gates "Volver a catar", since /cup redirects back here from that instant.
  cuppingOpen: boolean;
  // True only once the session is actually CLOSED (status), not merely past
  // closesAt: "Asignar café" is the post-close coffee naming that
  // updateSampleMetadata allows on a closed session (S8-10 T10).
  sessionClosed: boolean;
  // Pre-formatted "Cata cerrada el {date}" — null unless this is a closed
  // group session (see CLAUDE.md's product-law on closedAt).
  closedOnLabel?: string | null;
  // "Resultados actualizados el <fecha>" — set only when group results changed
  // after the close (S8-12).
  updatedAfterCloseLabel?: string | null;
  // The signed-in cupper's OWN exclusion notice (S10 WP5a, D2); never anyone else's.
  exclusionNotice?: string | null;
  // Owner-only, closed group sessions: pre-formatted close-email summary line
  // + whether the resend action should show (failed or pending recipients).
  closeEmails?: { line: string; showResend: boolean } | null;
  currentUserId: string;
  lastUpdatedLabel?: string | null;
  participants?: ParticipantResult[] | null;
  blockLabels?: Record<string, string>;
  cupperAlignment?: CupperAlignmentRow[] | null;
  partialSyncNotice?: string | null;
  knownEvalIds?: string[];
  /** R2: the overview's counted data (built on the server) and its words. */
  overview: {
    data: OverviewData;
    preliminary: boolean;
    referencePinned: boolean;
    familyLabels: Record<WheelFamilyId, string>;
    parts: ResultsPartsStrings;
    t: OverviewStrings;
    /** R2, step 2: the words of the coffee cards and of "Comparar". */
    cards: CardsStrings;
    /** R5: the words the organizer's Panel added. */
    panelT: PanelStrings;
    /** R3: per coffee, the panel's descriptors stage by stage (null where this
     *  viewer may not read them), and the words of the sheet. */
    sheets: Record<string, SheetData | null>;
    sheet: SheetStrings;
    /** R4b: the learnings of a CLOSED session (null before the close) and their words. */
    learnings: LearningsPayload | null;
    learningsT: LearningsStrings;
  };
  // Narrowed session format (mirrors session.format, typed) — feeds the
  // Resumen dashboard's score derivation and ranking gates.
  format?: SessionFormat;
  // Every viewer's own alignment triple (never another cupper's row/name/id).
  myAlignment?: { alignment: number; matches: number; opportunities: number } | null;
  // Group-session submission progress, shown in the Resumen dashboard.
  // Non-null only when the viewer is an anonymous guest: the "save your
  // results" banner that sends them through the normal login flow with a
  // claim token (see lib/guestClaim.ts).
  guestSave?: GuestSaveCtaTranslations | null;
  // Pre-formatted "your evaluation is still in progress · X of Y complete"
  // line — non-null only while the viewer's own evaluation is unsubmitted on
  // an open session (see page.tsx). Pairs with translations.myDraftCta.
  myDraftNotice?: string | null;
  // Closed-session line for the viewer: did their unsent notes count? (S8-05)
  closedNotice?: string | null;
  // S10 WP4b (Kim C1 / C2): owner-only late evaluations to accept (null = none / not the
  // owner), the viewer's own "left out / included" lines, and the post-close notes the
  // viewer may read (own; the owner also gets everyone's). All gated on the server.
  lateRows?: OwnerLateRow[] | null;
  myLateNotices?: string[];
  postCloseNotes?: PostCloseNotesPayload | null;
  lateTranslations?: LateEvaluationsTranslations;
  noteTranslations?: PostCloseNoteTranslations;
  // Solo owner of an open session with unscored samples: "Terminar cata"
  // (F-express-1 / F-solo-3). Null for everyone else.
  finish?: {
    button: string;
    title: string;
    body: string;
    // RAW templates with "{n}", filled here from the sample states.
    submitLine: string;
    removeLine: string;
    keepLine: string;
    confirm: string;
    cancel: string;
    close: string;
    errors: Record<string, string>;
  } | null;
  // Owner of an expired, not closed GROUP session: "Cerrar ahora" (S10 WP4a
  // review M2; rule `canCloseNow`). Null for everyone else.
  // Owner of an OPEN session: asks before revealing a sample, because a revealed
  // sample can no longer be evaluated (S10 WP3a, X3). Null once the session is over
  // (closing reveals everything, no dialog).
  revealConfirm?: { title: string; body: string; confirm: string; cancel: string } | null;
  // S10 WP6 C1: solo owner whose "Terminar cata" cannot finish because of revealed,
  // unfinished samples: "Cerrar la cata" closes it as it is (owner `closeSession`).
  closeAsIs?: {
    line: string;
    button: string;
    title: string;
    body: string;
    confirm: string;
    cancel: string;
    error: string;
    notFinalized: string;
  } | null;
  closeNow?: {
    line: string;
    button: string;
    title: string;
    body: string;
    rule: string;
    cancel: string;
    error: string;
    notFinalized: string;
  } | null;
  // Strings for the device-pending sync pill + conflict modal. Null in the
  // admin read-only view (nothing of the admin's is ever pending here).
  sync?: SessionSyncStatusTranslations | null;
  /** Coffees the owner may link in "Asignar café" (empty unless needed). */
  usableCoffees?: UsableCoffee[];
  translations: {
    title: string;
    backToCupping: string;
    downloadPdf: string;
    downloadCsvNoNames: string;
    needsConnection: string;
    /** S1: the one "Exportar" button and its sheet. */
    exportOpen: string;
    exportTitle: string;
    exportClose: string;
    refresh: string;
    refreshing: string;
    refreshNew: string;
    refreshNewGeneric: string;
    referenceBadge: string;
    /** "Referencia {n}" — raw ICU string, `{n}` replaced here. */
    referenceN: string;
    compareWith: string;
    tabResultados: string;
    ownerSection: string;
    liveUpdatesDown: string;
    myDraftCta: string;
    closeEmailsResend: string;
    closeEmailsResending: string;
    closeEmailsResent: string;
    closeEmailsResendError: string;
    closeEmailsInProgress: string;
    filterSampleAll: string;
    alignTitle: string;
    alignSubtitle: string;
    alignExcluded: string;
    alignNoData: string;
    editSample: string;
    editSampleError: string;
    assignPick: string;
    assignedToast: string;
    coffeePicker: {
      title: string;
      searchPlaceholder: string;
      mine: string;
      shared: string;
      public: string;
      empty: string;
      close: string;
    };
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
    detail: SampleDetailDialogTranslations;
    matrix: MatrixTranslations;
    help: ResultsHelp;
  };
}) {
  const router = useRouter();
  // The tab lives in the address (`?tab=panel`, audit D-01, P5a) beside R3's
  // `?sample=`: a reload, "back" and a language switch keep it.
  const rawTab = useSearchParams().get(RESULTS_TAB_PARAM);
  const [tab, setTabState] = useState<Tab>(() => resultsTabFrom(rawTab));
  const setTab = (next: Tab) => {
    setTabState(next);
    const search = withParams(window.location.search, { [RESULTS_TAB_PARAM]: resultsTabParam(next) });
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  };
  const compareChoice = useSyncExternalStore(
    subscribeCompareRef,
    getCompareRefSnapshot,
    getCompareRefServerSnapshot,
  );
  const changeCompareRef = (id: string) => {
    try {
      window.localStorage.setItem(COMPARE_REF_KEY, id);
    } catch {
      // Storage denied — the pick just won't persist.
    }
    window.dispatchEvent(new Event(COMPARE_REF_EVENT));
  };
  const [refreshing, setRefreshing] = useState(false);
  const [newSubmissions, setNewSubmissions] = useState(0);
  // Non-owners no longer receive peers' evaluation rows over Realtime (RLS,
  // S8-01): they only learn that the session row changed, so the chip is generic.
  const [hasGenericUpdates, setHasGenericUpdates] = useState(false);
  // Realtime channel is not SUBSCRIBED — "no new submissions" may just mean
  // "we stopped listening", so point the viewer at the refresh button (F10).
  const [liveUpdatesDown, setLiveUpdatesDown] = useState(false);
  const [, startTransition] = useTransition();
  const feedback = useActionFeedback();
  const [finishOpen, setFinishOpen] = useState(false);
  const [closeNowOpen, setCloseNowOpen] = useState(false);
  const [revealTarget, setRevealTarget] = useState<string | null>(null);
  // What "Terminar cata" would do, from the per-sample states the server sent.
  const finishPlan = finish
    ? planFinish(
        session.samples.map((s) => ({
          id: s.id,
          isReference: s.isReference,
          hasOtherData: Object.keys(s.physical ?? {}).length > 0,
          evaluation:
            !s.myEvaluation || s.myEvaluation.status === "none"
              ? null
              : { isDraft: s.myEvaluation.status === "draft", complete: s.myEvaluation.complete },
        })),
      )
    : null;
  const [closeAsIsOpen, setCloseAsIsOpen] = useState(false);
  const showCloseAsIs =
    closeAsIs !== null &&
    !isAdminViewer &&
    cuppingOpen &&
    finishPlan !== null &&
    soloCloseAsIsOffer({
      canFinish: finishPlan.canFinish,
      samples: session.samples.map((s) => ({
        revealed: s.revealed,
        submitted: s.myEvaluation?.status === "submitted",
        isReference: s.isReference,
      })),
    });
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [pickingCoffee, setPickingCoffee] = useState(false);
  const [editingExtrinsicSampleId, setEditingExtrinsicSampleId] = useState<string | null>(null);
  // Set after a metadata save when the linked coffee belongs to someone else
  // — the label still saved, but the coffee record itself was skipped.
  const [coffeeNotOwnedNotice, setCoffeeNotOwnedNotice] = useState(false);
  // The coffee's sheet. WHICH coffee is open lives in the address (reload and
  // "back" keep it: `useSheetAddress`); which cupper the organizer reads is
  // local, non-null only when the sheet was opened from a cell of the matrix.
  const sheetAddress = useSheetAddress(session.samples.map((sm) => sm.id));
  const [detailParticipantId, setDetailParticipantId] = useState<string | null>(null);
  const openSheet = (sampleId: string, participantId: string | null = null) => {
    setDetailParticipantId(participantId);
    sheetAddress.open(sampleId);
  };
  const closeSheet = sheetAddress.close;
  // Evaluation ids already counted toward the badge — SEEDED with the ids that
  // were visible at page load, and never cleared (only the counter resets on
  // refresh), so the no-op UPDATE storms from exclusion toggles / owner
  // recomputes don't re-badge evaluations the viewer has already seen.
  const seenEvalIds = useRef(new Set<string>(knownEvalIds));
  // Bumped on foreground resume so the realtime effect below re-runs (S8-15).
  const [resumeKey, setResumeKey] = useState(0);
  // S9-01 C-07: a stable key so the realtime effect below is not torn down on
  // every router.refresh() (which hands down a new session.samples array).
  const sampleIdsKey = session.samples.map((s) => s.id).join(",");
  // A phone that slept has a dead socket and stale numbers: recreate the channel
  // and re-fetch the server render once. Pending badges are now moot.
  useForegroundResume(() => {
    if (isAdminViewer) return;
    setResumeKey((k) => k + 1);
    setNewSubmissions(0);
    setHasGenericUpdates(false);
    router.refresh();
  });

  // ─── Realtime: badge the refresh button when something new is available ───
  // Manual-refresh design is intentional (no auto re-render); this only tells
  // the viewer that pressing "Actualizar" will show something new. The owner
  // reads submitted evaluation rows (evals_select_owner) and counts them;
  // everyone else listens to the session row, which changes when the session
  // closes (S10 WP4a: that is the moment group results become visible; nothing
  // touches the row when the last cupper submits any more). Mounted for
  // non-owners BEFORE results are visible so the hidden -> visible flip is
  // announced.
  useEffect(() => {
    if (!isGroup) return;
    // The owner always sees group data, so canViewGroup only gates the owner
    // listener if it were ever false; non-owners listen from the start.
    if (isOwner && !canViewGroup) return;
    // Admin god-mode runs under the admin's own JWT, and the evaluations RLS
    // policy only exposes own/participant rows — the subscription would be a
    // dead socket. Server renders run as postgres, so manual refresh works.
    if (isAdminViewer) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const sampleIds = new Set(sampleIdsKey ? sampleIdsKey.split(",") : []);

    // JWT before join — see lib/supabase/realtimeAuth.ts (S6 CP-C4).
    const stop = subscribeWithSessionAuth(
      supabase,
      () =>
    isOwner
      ? supabase
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
      : supabase
          .channel(`results:${session.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "cupping_sessions",
              filter: `id=eq.${session.id}`,
            },
            () => setHasGenericUpdates(true),
          ),
      // A dropped channel otherwise looks exactly like "no new submissions".
      // Flag it so the viewer knows to use Actualizar instead of waiting (F10).
      (status) => {
        setLiveUpdatesDown(status !== "SUBSCRIBED");
      },
    );

    return stop;
  }, [isGroup, canViewGroup, isOwner, isAdminViewer, session.id, sampleIdsKey, currentUserId, resumeKey]);

  const handleEditSample = (sampleId: string) => {
    router.push(`/${locale}/app/sessions/${session.id}/cup?sample=${sampleId}`);
  };

  const editingSample = session.samples.find((s) => s.id === editingSampleId) ?? null;
  const editingExtrinsicSample =
    session.samples.find((s) => s.id === editingExtrinsicSampleId) ?? null;

  const detailSample = sheetAddress.sampleId
    ? (session.samples.find((sm) => sm.id === sheetAddress.sampleId) ?? null)
    : null;
  // The sheet's dialog stays MOUNTED while closed (on the last coffee opened, or
  // the first one), so that it sees itself open: that is when it notes where
  // focus was, to give it back to that card when it closes.
  const [lastSheetId, setLastSheetId] = useState<string | null>(null);
  if (detailSample && detailSample.id !== lastSheetId) setLastSheetId(detailSample.id);
  const sheetSample =
    detailSample ?? session.samples.find((sm) => sm.id === lastSheetId) ?? session.samples[0] ?? null;
  const detailParticipants: SampleDetailParticipant[] | null =
    (isOwner || isAdminViewer) && participants && participants.length > 0 ? participants : null;

  // "Asignar café" (closed session, coffee-less sample): goes through
  // assignSampleCoffee so failures toast the localized code instead of
  // crashing, and success says what happened (S8-10 T10, F-express-3).
  const isAssigning = sessionClosed && !!editingSample && !editingSample.hasCoffee;

  const assignPendingRef = useRef(false);

  const finishAssign = () => {
    setEditingSampleId(null);
    setPickingCoffee(false);
    feedback.notifySuccess(translations.assignedToast);
    router.refresh();
  };

  const handlePickCoffee = async (picked: UsableCoffee) => {
    if (!editingSampleId || assignPendingRef.current) return;
    assignPendingRef.current = true;
    setPickingCoffee(false);
    try {
      await feedback.run(assignSampleCoffee(editingSampleId, { coffeeId: picked.id }), finishAssign);
    } finally {
      assignPendingRef.current = false;
    }
  };

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    if (!editingSampleId) return;
    if (isAssigning) {
      const res = await feedback.run(
        assignSampleCoffee(editingSampleId, { fields: data }),
        finishAssign,
      );
      // Keep the dialog (and the typed values) open on failure.
      if (!res.ok) throw new Error(res.error);
      return;
    }
    const result = await updateSampleMetadata(editingSampleId, data);
    if (!result.ok) {
      // S10 WP6b: localized copy for the refusal (a busy session says "try again");
      // nothing was saved. Rethrow so the dialog stays open with the typed values.
      feedback.notifyError(result.error);
      throw new Error(result.error);
    }
    setEditingSampleId(null);
    setCoffeeNotOwnedNotice(!result.coffeeUpdated);
    router.refresh();
  };

  const handleReveal = (sampleId: string) => {
    // Open session: confirm first (the sample stops accepting evaluations).
    if (revealConfirm && cuppingOpen) {
      setRevealTarget(sampleId);
      return;
    }
    doReveal(sampleId);
  };

  const doReveal = (sampleId: string) => {
    startTransition(async () => {
      await feedback.run(revealSample(sampleId), () => router.refresh());
    });
  };

  const handleRefreshScores = async () => {
    setRefreshing(true);
    setNewSubmissions(0);
    setHasGenericUpdates(false);
    try {
      // The button is available to everyone; only the owner additionally fires
      // the self-healing trigger recompute (a no-op on the server once the
      // session is closed or expired, so a past score is never rewritten).
      // Non-owners just re-render: the page
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
        if (r.ok && r.nothingToSend) {
          // Rows still held by a run in progress: non-blocking notice, no budget spent.
          setResendState("idle");
          feedback.notifyWarning(translations.closeEmailsInProgress);
          return;
        }
        setResendState(r.ok ? "sent" : "error");
        if (!r.ok) feedback.notifyError(r.error === "rate_limited" ? "rate_limited" : "unknown");
      } catch {
        setResendState("error");
        feedback.notifyError("unknown");
      }
    });
  };

  const canViewIndividual = (isOwner || isAdminViewer) && isGroup && !!participants?.length;

  // ─── Reference (control) sample — display-only Δ basis for the ranking,
  // table, radar, matrix, and drill-down surfaces. Scoring is untouched;
  // this only decides what a Δ chip compares against. ───────────────────────
  const resolvedFormat = format ?? asSessionFormat(session.format);
  // Multi-reference (S6): every reference is an anchor; `referenceId` is the one
  // the Δ chips compare against — the viewer's pick, the ACTIVE one by default.
  const references = referencesOf(session.samples);
  const referenceId = resolveCompareReference(session.samples, compareChoice);
  const referenceSample = referenceId
    ? (session.samples.find((s) => s.id === referenceId) ?? null)
    : null;
  // The viewer's own score of the reference they compare against: pick the
  // format's affective dataset, guard on hasAffectiveData, then calcIndividualScore.
  const referenceMyScore = ((): number | null => {
    if (!referenceSample) return null;
    const affData =
      resolvedFormat === "affective"
        ? referenceSample.affective
        : resolvedFormat === "combined"
          ? referenceSample.combined
          : null;
    if (!affData || !hasIndividualScore(affData) || !canShowMyScore(referenceSample.myEvaluation)) {
      return null;
    }
    const score = calcIndividualScore(affData, session.cupsPerSample, {
      rule: referenceSample.scoreRule,
    });
    return typeof score === "number" ? score : null;
  })();
  // Never mix my score with the reference's community score in one difference:
  // a card compares the score it shows (`overviewView`), and the drill-down's
  // group block adds the viewer's own score against their own score of the reference.

  // One card per coffee: built once, for the row and for the drill-down.
  const rankCtx = {
    format: resolvedFormat,
    isGroup,
    canViewGroup,
    cupsPerSample: session.cupsPerSample,
  };
  const cards = coffeeCards({ samples: session.samples, referenceId, ctx: rankCtx, data: overview.data });
  // The organizer's Panel (R5): the score each card shows for the GROUP, by sample
  // (the matrix's "Grupo" line), and what waits for them there.
  const panelWaiting = canViewIndividual
    ? panelPending({ lateRows: isAdminViewer ? null : lateRows, notesByCupper: postCloseNotes?.byCupper ?? null })
    : null;
  const openPanel = () => {
    setTab("panel");
    // the tile that was pressed leaves with the overview: put the reader at the Panel's start
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-panel-view]")?.focus());
  };
  const panelGroupScores = Object.fromEntries(
    cards.map((c) => [c.sample.id, c.context && c.context.basis === "community" ? c.context.score : null]),
  );

  // The alignment table's own filter: one coffee, or all of them.

  // Defensive: fall back to the results if the Panel is selected without access.
  const effectiveTab: Tab = tab === "panel" && !canViewIndividual ? "resumen" : tab;
  // A `tab` the viewer cannot have (unknown, or the Panel without access) leaves the address.
  useEffect(() => {
    if (rawTab === null || rawTab === resultsTabParam(effectiveTab)) return;
    const search = withParams(window.location.search, { [RESULTS_TAB_PARAM]: resultsTabParam(effectiveTab) });
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [rawTab, effectiveTab]);

  // "Comparar con: Referencia 1 · Referencia 2" — only when there are several.
  const compareSelector =
    references.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium text-on-surface-variant">
          {translations.compareWith}
        </span>
        <SegmentedControl
          items={references.map((r) => ({
            id: r.id,
            label: translations.referenceN.replace("{n}", String(r.referenceRank ?? "")),
          }))}
          value={referenceId ?? references[references.length - 1].id}
          onChange={changeCompareRef}
          ariaLabel={translations.compareWith}
        />
      </div>
    ) : null;

  // A participant has ONE view: no tab bar then.
  const tabItems = [
    { id: "resumen", label: translations.tabResultados },
    ...(canViewIndividual ? [{ id: "panel", label: overview.cards.tabPanel }] : []),
  ];

  // S1: the exports this viewer gets (the CVA sheet for everyone, the CSV without names for the organizer).
  const exportActions = resultsExportActions({ isOwner, isAdminViewer });

  // "Exportar": the one sheet with every export (S1). Beside the title on a session
  // that is over; in the row of work buttons while the cupping is open, so an open
  // session's header is one row shorter.
  const exportSheet = (
    <ResultsExportSheet
      sessionId={session.id}
      locale={locale}
      actions={exportActions}
      t={{
        open: translations.exportOpen,
        title: translations.exportTitle,
        close: translations.exportClose,
        downloadPdf: translations.downloadPdf,
        downloadCsvNoNames: translations.downloadCsvNoNames,
        needsConnection: translations.needsConnection,
      }}
    />
  );

  return (
    // S1 (F-01): the page is in normal flow, so the app shell's <main> is the ONE
    // scroll container. The header (title, actions, notices) scrolls away; only
    // the tabs stay (sticky). The negative margins cancel <main>'s padding, as the
    // absolutely positioned box before this did.
    <div className="-mx-4 -mt-4 lg:-mx-6 lg:-mt-6 bg-surface text-on-surface">
      {/* Header — scrolls with the page */}
      <div className="bg-surface">
        {/* R2: the page's title is the session (one h1, set by PageHeader), with
            its facts in one line under it and "Exportar" (the one sheet with every
            export, S1) beside it. What used to be three rows of pills is that line. */}
        <div className="px-4 pt-3 pb-2">
          <PageHeader
            title={session.name}
            action={cuppingOpen ? undefined : exportSheet}
          />
          <p className="mt-1 text-caption text-on-surface-variant tabular-nums">
            {[
              `${overview.t.pageKind} · ${session.date}`,
              closedOnLabel,
              canViewGroup ? lastUpdatedLabel : null,
            ]
              .filter((part): part is string => typeof part === "string" && part.length > 0)
              .join(" · ")}
          </p>
        </div>

        {/* The work buttons, only while the cupping is open. Admin view: /cup would
            just bounce back here, so "Volver a catar" hides. A closed or expired
            session never changes its scores (refreshAggregateScores is a no-op
            there), so "Actualizar" is only offered while cupping is open:
            `cuppingOpen` is the server's `!isSessionExpired(session)`. */}
        {cuppingOpen && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
            {!isAdminViewer && (
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowLeft size={14} aria-hidden />}
                onClick={() => router.push(`/${locale}/app/sessions/${session.id}/cup`)}
              >
                {translations.backToCupping}
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant={(newSubmissions > 0 || hasGenericUpdates) && !refreshing ? "accent" : "accentOutline"}
                icon={<RefreshCw size={14} aria-hidden className={refreshing ? "animate-spin" : ""} />}
                onClick={handleRefreshScores}
                disabled={refreshing}
              >
                {refreshing
                  ? translations.refreshing
                  : newSubmissions > 0
                    ? translations.refreshNew.replace("{count}", String(newSubmissions))
                    : hasGenericUpdates
                      ? translations.refreshNewGeneric
                      : translations.refresh}
              </Button>
              {exportSheet}
            </div>
          </div>
        )}

        {liveUpdatesDown && (
          <p role="status" className="px-4 pb-2 text-caption text-secondary">
            {translations.liveUpdatesDown}
          </p>
        )}

        {closeEmails && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 text-caption text-on-surface-variant">
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

        {updatedAfterCloseLabel && (
          <div className="px-4 pb-2">
            <span
              role="status"
              className="inline-flex rounded-card border border-secondary/40 bg-secondary-fixed/40 px-3 py-1 text-caption text-on-surface"
            >
              {updatedAfterCloseLabel}
            </span>
          </div>
        )}

        {exclusionNotice && (
          <div className="px-4 pb-2">
            <Notice tone="info">{exclusionNotice}</Notice>
          </div>
        )}

      </div>

      {/* Tabs — the one part that stays while the page scrolls (S1). The negative
          top equals <main>'s padding (p-4 / lg:p-6): sticky offsets are measured
          inside that padding, so top-0 would leave a strip of content above. */}
      {tabItems.length > 1 ? (
        <div data-results-tabs className="sticky -top-4 lg:-top-6 z-[2] border-b border-outline-variant bg-surface px-4 py-2">
          <PillTabs
            items={tabItems}
            value={effectiveTab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={translations.title}
            idBase="results"
          />
        </div>
      ) : (
        <div className="border-b border-outline-variant" />
      )}

      {/* Content — scrolls with the page (no inner scroller, S1); the tab's panel when there are tabs */}
      <div
        {...(tabItems.length > 1
          ? { role: "tabpanel", id: tabIds("results", effectiveTab).panel, "aria-labelledby": tabIds("results", effectiveTab).tab }
          : {})}
      >
      {adminViewNotice && (
        <Notice tone="info" className="mx-4 mt-4 lg:mx-6">
          {adminViewNotice}
        </Notice>
      )}
      {/* Device-pending sync pill + conflict modal (renders nothing when idle). */}
      {sync && !isAdminViewer && (
        <SessionSyncStatus sessionId={session.id} userId={currentUserId} translations={sync} />
      )}
      {/* The viewer's own evaluation is still a draft: "—" cells are unrated
          attributes, not lost data. Offer the way back into the tasting. */}
      {closedNotice && (
        <Notice tone="info" className="mx-4 mt-4 lg:mx-6">
          {closedNotice}
        </Notice>
      )}
      {closeAsIs && showCloseAsIs && (
        <Notice
          tone="info"
          className="mx-4 mt-4 lg:mx-6"
          action={
            <Button size="sm" variant="secondary" onClick={() => setCloseAsIsOpen(true)}>
              {closeAsIs.button}
            </Button>
          }
        >
          {closeAsIs.line}
        </Notice>
      )}
      {closeAsIs && showCloseAsIs && (
        <ConfirmDialog
          open={closeAsIsOpen}
          onOpenChange={setCloseAsIsOpen}
          title={closeAsIs.title}
          body={<p>{closeAsIs.body}</p>}
          confirmLabel={closeAsIs.confirm}
          cancelLabel={closeAsIs.cancel}
          closeLabel={closeAsIs.cancel}
          error={closeAsIs.error}
          onConfirm={async () => {
            // The existing owner close (closeSessionInternal): closeSession throws on
            // failure and ConfirmDialog shows `error`.
            const r = await closeSession(session.id);
            if (!r.finalized) feedback.notifySuccess(closeAsIs.notFinalized);
            router.refresh();
          }}
        />
      )}
      {myLateNotices.map((line) => (
        <Notice key={line} tone="info" className="mx-4 mt-4 lg:mx-6">
          {line}
        </Notice>
      ))}
      {/* The late evaluations live in the Panel (R5), announced by the overview's
          "Pendiente" tile. Kept here only for a page that holds them and has no
          Panel to show them in, so they can never become unreachable. */}
      {lateRows && lateRows.length > 0 && lateTranslations && !isAdminViewer && !canViewIndividual && (
        <LateEvaluationsPanel rows={lateRows} locale={locale} translations={lateTranslations} />
      )}
      {closeNow && (
        <Notice
          tone="warning"
          className="mx-4 mt-4 lg:mx-6"
          action={
            <Button size="sm" variant="secondary" onClick={() => setCloseNowOpen(true)}>
              {closeNow.button}
            </Button>
          }
        >
          {closeNow.line}
        </Notice>
      )}
      {revealConfirm && (
        <ConfirmDialog
          open={revealTarget !== null}
          onOpenChange={(o) => {
            if (!o) setRevealTarget(null);
          }}
          title={revealConfirm.title}
          body={<p>{revealConfirm.body}</p>}
          confirmLabel={revealConfirm.confirm}
          cancelLabel={revealConfirm.cancel}
          closeLabel={revealConfirm.cancel}
          onConfirm={() => {
            const id = revealTarget;
            setRevealTarget(null);
            if (id) doReveal(id);
          }}
        />
      )}
      {closeNow && (
        <ConfirmDialog
          open={closeNowOpen}
          onOpenChange={setCloseNowOpen}
          title={closeNow.title}
          body={
            <div className="space-y-2">
              <p>{closeNow.body}</p>
              <p>{closeNow.rule}</p>
            </div>
          }
          confirmLabel={closeNow.title}
          cancelLabel={closeNow.cancel}
          closeLabel={closeNow.cancel}
          error={closeNow.error}
          onConfirm={async () => {
            // closeSession throws on failure: ConfirmDialog shows `error`.
            const r = await closeSession(session.id);
            // Non-blocking: the toast outlives the refresh below.
            if (!r.finalized) feedback.notifySuccess(closeNow.notFinalized);
            router.refresh();
          }}
        />
      )}
      {myDraftNotice && (
        <Notice
          tone="warning"
          className="mx-4 mt-4 lg:mx-6"
          action={
            !isAdminViewer && cuppingOpen ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/app/sessions/${session.id}/cup`)}
                >
                  {translations.myDraftCta}
                </Button>
                {finishPlan?.canFinish && finish && (
                  <Button size="sm" variant="secondary" onClick={() => setFinishOpen(true)}>
                    {finish.button}
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {myDraftNotice}
        </Notice>
      )}
      {finish && finishPlan && (
        <ConfirmDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          title={finish.title}
          body={
            <div className="space-y-2">
              <p>{finish.body}</p>
              {finishPlan.submitIds.length > 0 && (
                <p>{finish.submitLine.replace("{n}", String(finishPlan.submitIds.length))}</p>
              )}
              {finishPlan.removeIds.length > 0 && (
                <p>{finish.removeLine.replace("{n}", String(finishPlan.removeIds.length))}</p>
              )}
              {finishPlan.keptPartialIds.length > 0 && (
                <p>{finish.keepLine.replace("{n}", String(finishPlan.keptPartialIds.length))}</p>
              )}
            </div>
          }
          confirmLabel={finish.confirm}
          cancelLabel={finish.cancel}
          closeLabel={finish.close}
          destructive
          errorMessages={finish.errors}
          onConfirm={async () => {
            const r = await finishSoloSession(session.id);
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {partialSyncNotice && !(effectiveTab === "resumen" && overview.data.who) && (
        <Notice tone="info" className="mx-4 mt-4 lg:mx-6">
          {partialSyncNotice}
        </Notice>
      )}
      {coffeeNotOwnedNotice && (
        <Notice
          tone="info"
          className="mx-4 mt-4 lg:mx-6"
          onDismiss={() => setCoffeeNotOwnedNotice(false)}
          dismissLabel={translations.detail.close}
        >
          {translations.editSampleNotOwner}
        </Notice>
      )}
      {guestSave && !isAdminViewer && (
        <GuestSaveCta sessionId={session.id} locale={locale} translations={guestSave} />
      )}
      {effectiveTab === "resumen" ? (
        <div className="p-4 lg:p-6 flex flex-col gap-6">
          <SessionOverview
            samples={session.samples}
            ctx={rankCtx}
            referenceId={referenceId}
            data={overview.data}
            myAlignment={myAlignment ?? null}
            preliminary={overview.preliminary}
            referencePinned={overview.referencePinned}
            compareSelector={compareSelector}
            familyLabels={overview.familyLabels}
            parts={overview.parts}
            t={overview.t}
            compare={{ closed: sessionClosed, ground: COMPARE_GROUND, t: overview.cards }}
            pending={
              panelWaiting
                ? {
                    title: overview.panelT.pendingTitle,
                    text: pendingSentence(panelWaiting, overview.panelT),
                    action: overview.panelT.pendingOpen,
                    onOpen: openPanel,
                  }
                : null
            }
            onOpenSample={(id) => openSheet(id)}
          />
          <CoffeeCards
            cards={cards}
            format={resolvedFormat}
            referencePinned={overview.referencePinned}
            // "Revelar" is refused once the cupping is over (closing reveals every
            // coffee), and the admin's lens is read-only (`isOwner` is false there).
            canReveal={isOwner && cuppingOpen}
            onReveal={handleReveal}
            onOpenSample={(id) => openSheet(id)}
            familyLabels={overview.familyLabels}
            nodeLabels={wheelNodeLabels(locale === "en" ? "en" : "es")}
            parts={overview.parts}
            t={overview.cards}
          />
          {/* What the cupping taught: only once it is closed (the server sends null before). */}
          {overview.learnings ? (
            <Learnings
              learnings={overview.learnings}
              samples={session.samples}
              isGroup={isGroup}
              showMine={!isAdminViewer}
              viewerSent={cards.some((c) => c.state === "submitted")}
              locale={locale}
              attributes={overview.cards.attributes}
              defectTypes={overview.t.defectTypes}
              t={overview.learningsT}
            />
          ) : null}
          {/* The reflection: the existing note after the close, one per coffee the
              reader sent an evaluation of. The same note is on each coffee's sheet. */}
          {sessionClosed && !isAdminViewer && postCloseNotes && noteTranslations ? (
            <Reflection
              notes={postCloseNotes.mine}
              samples={cards.map((c) => c.sample)}
              // the organizer's own note has no other reader
              onlyReader={!isGroup || isOwner}
              locale={locale}
              userId={currentUserId}
              noteT={noteTranslations}
              t={overview.learningsT}
            />
          ) : null}
        </div>
      ) : (
        // The organizer's working view (R5): what waits for a decision, every
        // cupper's total beside the group's, who counts, the notes after the close
        // and the alignment. The page holds these rows only in the organizer's lens.
        canViewIndividual && participants ? (
          <PanelView
            sessionId={session.id}
            participants={participants}
            format={format ?? asSessionFormat(session.format)}
            cupsPerSample={session.cupsPerSample}
            readOnly={isAdminViewer}
            onOpenDetail={(sampleId, participantId) => openSheet(sampleId, participantId)}
            referenceBadge={translations.referenceBadge}
            groupScores={panelGroupScores}
            matrixTitle={translations.ownerSection}
            matrixHelp={
              <InfoHint
                title={translations.help.porCatador.title}
                body={translations.help.porCatador.body}
                closeLabel={translations.help.closeLabel}
              />
            }
            matrixT={translations.matrix}
            late={lateRows && lateTranslations ? { rows: lateRows, t: lateTranslations } : null}
            notes={
              postCloseNotes?.byCupper && noteTranslations
                ? {
                    byCupper: postCloseNotes.byCupper,
                    sampleLabels: Object.fromEntries(session.samples.map((sm) => [sm.id, sm.label])),
                    t: noteTranslations,
                  }
                : null
            }
            alignment={
              cupperAlignment && cupperAlignment.length > 0
                ? {
                    rows: cupperAlignment,
                    samples: session.samples.map((sm) => ({ id: sm.id, label: sm.label })),
                    t: {
                      title: translations.alignTitle,
                      subtitle: translations.alignSubtitle,
                      excluded: translations.alignExcluded,
                      noData: translations.alignNoData,
                      all: translations.filterSampleAll,
                    },
                    help: (
                      <InfoHint
                        title={translations.help.alineacion.title}
                        body={translations.help.alineacion.body}
                        closeLabel={translations.help.closeLabel}
                      />
                    ),
                  }
                : null
            }
            locale={locale}
            t={overview.panelT}
          />
        ) : null
      )}
      </div>

      {sheetSample && (
        <SampleDetailDialog
          open={detailSample !== null}
          onClose={closeSheet}
          sample={sheetSample}
          isOwner={isOwner}
          participants={detailParticipants}
          initialParticipantId={detailParticipantId}
          format={format ?? asSessionFormat(session.format)}
          cupsPerSample={session.cupsPerSample}
          locale={locale}
          referenceBadge={translations.referenceBadge}
          referenceCount={references.length}
          // Everything of the GROUP the sheet shows, already gated: the card's own
          // context and quality rows, the group's stored numbers only where this
          // viewer may read the group's results, the server-built wheel, defects
          // and descriptor lists, and "Comparar con" only on a closed session.
          group={(() => {
            const card = cards.find((c) => c.sample.id === sheetSample.id) ?? null;
            const agg = sheetSample.aggregateScore;
            const aggregate = isGroup && canViewGroup && agg && agg.communityScore != null ? agg : null;
            const mine = card?.context?.mine ?? null;
            const options = compareOptions({
              closed: sessionClosed,
              samples: session.samples,
              order: cards.filter((c) => !c.isReference).map((c) => c.sample.id),
              data: overview.data,
            });
            const self = options?.find((o) => o.id === sheetSample.id) ?? null;
            return {
              card,
              aggregate,
              referencePinned: overview.referencePinned,
              ownDelta:
                aggregate && mine !== null && referenceMyScore !== null && sheetSample.id !== referenceId
                  ? mine - referenceMyScore
                  : null,
              wheel: overview.data.samples[sheetSample.id]?.wheel ?? null,
              defects: overview.data.samples[sheetSample.id]?.defects ?? null,
              blocks: overview.sheets[sheetSample.id] ?? null,
              compare:
                options && self
                  ? {
                      self,
                      others: options.filter((o) => o.id !== sheetSample.id),
                      names: Object.fromEntries(
                        session.samples.map((sm) => [
                          sm.id,
                          sm.revealed && sm.coffee ? `${sm.label} ${sm.coffee.name}` : sm.label,
                        ]),
                      ),
                      short: Object.fromEntries(
                        session.samples.map((sm) => [sm.id, sm.revealed && sm.coffee ? sm.coffee.name : sm.label]),
                      ),
                    }
                  : null,
              compareGround: COMPARE_GROUND,
            };
          })()}
          familyLabels={overview.familyLabels}
          blockLabels={blockLabels ?? {}}
          parts={overview.parts}
          cards={overview.cards}
          overview={overview.t}
          s={overview.sheet}
          // S10 WP4b (Kim C2): the cupper's own post-close note (editable) under their notes;
          // the owner reads another cupper's note here, read-only. Never in the score area.
          extra={(viewerId) => {
            if (!sessionClosed || !noteTranslations || !postCloseNotes) return null;
            if (viewerId === "me") {
              const mine = postCloseNotes.mine[sheetSample.id];
              return mine && !isAdminViewer ? (
                <PostCloseNoteEditor
                  key={`${sheetSample.id}|${mine.text ?? ""}|${mine.at ?? ""}`}
                  note={mine}
                  locale={locale}
                  userId={currentUserId}
                  translations={noteTranslations}
                />
              ) : null;
            }
            const theirs = postCloseNotes.byCupper?.[viewerId]?.[sheetSample.id];
            return theirs ? (
              <PostCloseNoteReadOnly text={theirs.text} at={theirs.at} locale={locale} translations={noteTranslations} />
            ) : null;
          }}
          // Closed = read-only: /cup redirects a closed session to results, so
          // "Editar" would be a dead button (F-resultados-10).
          onEdit={
            isAdminViewer || !cuppingOpen
              ? undefined
              : () => handleEditSample(sheetSample.id)
          }
          onEditMetadata={
            // Closed = read-only: the metadata dialog's save throws
            // session_closed once the session closed, so the button goes away.
            isOwner && cuppingOpen
              ? () => {
                  closeSheet();
                  setEditingSampleId(sheetSample.id);
                }
              : undefined
          }
          onAssignCoffee={
            // Post-close coffee naming (WP-B): a coffee-less sample (express
            // sessions) may get its coffee AFTER the close — the one write
            // updateSampleMetadata allows on a closed session, owner only.
            isOwner && !isAdminViewer && sessionClosed && !sheetSample.hasCoffee
              ? () => {
                  closeSheet();
                  setEditingSampleId(sheetSample.id);
                }
              : undefined
          }
          onEditExtrinsic={
            // Blind integrity: origin data is only ever editable once the
            // sample is revealed, and the admin god-mode view stays read-only.
            isOwner && sheetSample.revealed && !isAdminViewer
              ? () => {
                  closeSheet();
                  setEditingExtrinsicSampleId(sheetSample.id);
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
          title={`${
            sessionClosed && !editingSample.hasCoffee
              ? translations.detail.assignCoffee
              : translations.editSample
          }: ${editingSample.label}`}
          closeLabel={translations.cancel}
        >
          {isAssigning && usableCoffees.length > 0 && (
            <Button
              variant="secondary"
              className="w-full mb-4"
              onClick={() => setPickingCoffee(true)}
            >
              {translations.assignPick}
            </Button>
          )}
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

      {isOwner && isAssigning && (
        <CoffeePicker
          open={pickingCoffee}
          onOpenChange={setPickingCoffee}
          coffees={usableCoffees}
          onSelect={handlePickCoffee}
          translations={translations.coffeePicker}
        />
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
          }}
        />
      )}
    </div>
  );
}

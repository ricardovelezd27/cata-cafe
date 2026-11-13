"use client";

import {
  applySubmitEvent,
  computeSubmitProgress,
  seedSubmitMap,
  type SubmitMap,
  type SubmittedRow,
} from "@/lib/submitProgress";
import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { blocksSubmit, hydratesForm, isTerminal } from "@/lib/offline/status";
import { warmupForCache } from "@/lib/warmup/offlineCache";
import { WarmupMoment } from "@/components/session-moments/WarmupMoment";
import { WarmupEntry } from "@/components/session-moments/WarmupEntry";
import { SessionMomentOverlay } from "@/components/session-moments/SessionMomentOverlay";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { lw, warmupById } from "@/lib/warmup/exercises";
import { shouldShowWarmupOverlay } from "@/lib/warmup/overlayGate";
import { formatTimeLeft, isRunning as isWarmupRunning, parseDbTimestamp, resyncPositionMs, runLengthMs, seekFor, skewMs, timeLeftMs } from "@/lib/warmup/syncedRun";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Coffee, Scale, FileText, BarChart3 } from "lucide-react";
import { DescriptiveForm } from "@/components/cupping/DescriptiveForm";
import { AffectiveForm } from "@/components/cupping/AffectiveForm";
import { CombinedForm } from "@/components/cupping/CombinedForm";
import { ExtrinsicForm } from "@/components/cupping/ExtrinsicForm";
import { PhysicalEvalForm } from "@/components/cupping/PhysicalEvalForm";
import {
  upsertEvaluation,
  upsertExtrinsic,
  upsertPhysical,
  updateSampleMetadata,
  setReferenceSample,
  assignSampleCoffee,
} from "@/app/actions/sessions";
import { listUsableCoffeesForPicker } from "@/app/actions/coffees";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { SampleKey, type SampleKeyTranslations } from "@/components/cupping/SampleKey";
import type { SamplePrepTranslations } from "@/components/cupping/SamplePrepFields";
import { prepFromForm, prepToForm, type SamplePrep } from "@/lib/samplePrep";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CoffeePicker, type UsableCoffee } from "@/components/coffees/CoffeePicker";
import { canPickExistingCoffee } from "@/lib/cupCoffeePick";
import { resumeCallbackRefreshes } from "@/lib/cupResume";
import { isEvaluationComplete as isEvaluationCompleteForScore } from "@/lib/evaluationState";
import { DeadlineBanner, type DeadlineBannerTranslations } from "@/components/session/DeadlineBanner";
import {
  submitAllEvaluations,
  closeSession,
  finishSoloSession,
  getCloseImpact,
  createInviteToken,
  setEntriesLocked,
  startSession,
  startWarmup,
  stopWarmup,
} from "@/app/actions/community";
import { buildInviteUrl } from "@/lib/inviteUrl";
import {
  CUPPING_STEPS,
  DESCRIPTIVE_STEPS,
  STEP_ATTRIBUTES,
  type CuppingStep,
} from "@/lib/constants";
import {
  stepMissing,
  sessionMissing,
  type CuppingFormat,
} from "@/lib/completeness";
import {
  EvaluationGuardModal,
  type GuardItem,
} from "@/components/cupping/EvaluationGuardModal";
import { PhaseStepper } from "@/components/cupping/PhaseStepper";
import { ExpressNotesStep } from "@/components/cupping/ExpressNotesStep";
import { EXPRESS_NOTE_KEY, EXPRESS_NOTE_MAX } from "@/lib/expressSession";
import { moduleKeyForFormat } from "@/lib/evaluation";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import { indexAfterReconcile, reconcileSamples } from "@/lib/sampleReconcile";
import { subscribeWithSessionAuth } from "@/lib/supabase/realtimeAuth";
import { DevRoleBadge } from "@/components/dev/DevRoleBadge";
import {
  SessionShell,
  SampleTabs,
  ModuleSwitcher,
  MasterControls,
  CanvasFooter,
  BetaBadge,
  Badge,
  Select,
  useActionFeedback,
  type ModuleItem,
} from "@/components/ui";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useForegroundResume } from "@/hooks/useForegroundResume";
import {
  shouldPinReference,
  nextReferenceOrder,
  orderByReferenceIds,
  pinReferenceAffective,
  referencesOf,
} from "@/lib/referenceRules";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { StaleBundleNotice } from "@/components/offline/StaleBundleNotice";
import { noteIfStaleBundle } from "@/lib/staleBundle";
import { IDENTITY_CHANGED } from "@/lib/expectedUser";
import { isIdentityChanged, onIdentityChanged, registerBeforeIdentityReload } from "@/lib/identityChange";
import { onServerIdentityChanged } from "@/lib/identityResolve";
import { awaitClaimRekey } from "@/lib/offline/claimRekey";
import { shouldKickReplayAfterRekey } from "@/lib/offline/claimMarker";
import { SyncConflictModal } from "@/components/offline/SyncConflictModal";
import {
  mergeModuleData,
  setModuleStatus,
  cacheProps,
  loadSession,
  isOfflineStorageUnavailable,
  onOfflineStorageUnavailable,
} from "@/lib/offline/store";
import type { ModuleKey } from "@/lib/offline/types";

type Data = Record<string, unknown>;

// The five Sample fields that map to persistable evaluation modules.
/** How long the online owner waits for the rebuilt channel's SUBSCRIBED re-seed after a resume before refreshing anyway. */
const OWNER_RESEED_FALLBACK_MS = 8000;

const MODULE_KEYS = new Set<ModuleKey>([
  "descriptive",
  "affective",
  "combined",
  "physical",
  "extrinsic",
]);
const isModuleKey = (key: PropertyKey): key is ModuleKey =>
  MODULE_KEYS.has(key as ModuleKey);

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

type Sample = {
  id: string;
  label: string;
  position: number;
  isDraft: boolean;
  evaluationId: string | null;
  descriptive: Data;
  affective: Data;
  combined: Data;
  physical: Data;
  extrinsic: Data;
  revealed: boolean;
  coffeeId: string | null;
  coffee: SampleCoffee | null;
  /** A9 prep data (roast date, notes, off-protocol); the server ships it to the
   *  owner or once revealed only. Optional for pre-upgrade offline blobs. */
  prep?: SamplePrep | null;
  /** 1, 2, … when the sample is a reference (S6 multi-reference). */
  referenceRank?: number | null;
};

type Session = {
  id: string;
  name: string;
  format: string;
  cupsPerSample: number;
  samples: Sample[];
  date: string;
  // The owner's "Referencia" sample (display-only). Optional so a pre-upgrade
  // offline blob rehydrated by cup/error.tsx still type-checks.
  referenceSampleId?: string | null;
  /** B1: "anchor" (pinned at 79.00) | "free". Fixed once the format is locked,
   *  so it cannot go stale during a cupping. Optional for old offline blobs
   *  (read as anchor). */
  referenceMode?: string;
  /** ISO closing date + the owner's IANA zone (deadline banner). */
  closesAt?: string | null;
  closesAtZone?: string | null;
};

type CuppingTab = "cupping" | "extrinsic" | "physical";

// Stable defaults: a fresh [] per render would re-trigger the re-seed effect.
const NO_ROWS: SubmittedRow[] = [];
const NO_IDS: string[] = [];
const NO_COUNTS: Record<string, number> = {};

export function CupClient({
  locale,
  initialSampleId,
  session,
  isOwner,
  isGroup,
  sessionStatus,
  sessionStartedAt,
  sessionIsAsync,
  sessionEntriesLocked = false,
  participantCount,
  submittedCount: initialSubmittedCount,
  submittedRows = NO_ROWS,
  eligibleCupperIds = NO_IDS,
  evalCountBySample = NO_COUNTS,
  translations,
  userEmail,
  userCountry,
  userId: renderedUserId,
  warmup,
}: {
  locale: string;
  initialSampleId?: string;
  session: Session;
  /** Optional pre-cupping warm-up (CuppingSession.warmupExerciseId) — shown
   *  once per (session, user, exercise) per device by the session-moment
   *  overlay; gate in lib/warmup/overlayGate.ts, frozen at mount. */
  warmup?: {
    exerciseId: string | null;
    hasOwnEvaluation: boolean;
    /** Synced run in progress at render (ISO) — master panel state. */
    warmupStartedAt: string | null;
    serverNow: string;
    strings: WarmupPlayerStrings;
    /** Raw `warmup.entry.label` for the discreet entry after the interstitial
     *  (S10 WP7, Kim F1); absent in older cached copies = no entry. */
    entryLabel?: string;
    /** Master-panel strings (group.warmup*). `{time}` placeholders are raw. */
    master: {
      startLabel: string;
      stopLabel: string;
      reopenLabel: string;
      runningLabel: string;
      timeLeft: string;
      confirmTitle: string;
      confirmBody: string;
      confirmYes: string;
      startError: string;
      minutes: string;
    };
  };
  isOwner: boolean;
  isGroup: boolean;
  sessionStatus: string;
  sessionStartedAt: string | null;
  sessionIsAsync: boolean;
  /** Owner closed new entries (S8-11 C4). Optional: offline prop blobs. */
  sessionEntriesLocked?: boolean;
  participantCount: number;
  submittedCount: number;
  /** Owner only: submitted evaluation rows + the cuppers who count (S8-11 T1). */
  submittedRows?: SubmittedRow[];
  eligibleCupperIds?: string[];
  /** Owner only: evaluations per sample, for the re-pin confirm (S8-21 #1). */
  evalCountBySample?: Record<string, number>;
  userId: string;
  translations: {
    sample: string;
    ofTotal: string;
    nextSample: string;
    nextPhase: string;
    viewResults: string;
    submitting: string;
    submitFailed: string;
    retrySubmit: string;
    savedLocally: string;
    prev: string;
    extrinsic: string;
    physical: string;
    results: string;
    process: string;
    editSample: string;
    editSampleError: string;
    /** Owner-only "Clave de muestras" (A4); optional for offline blobs. */
    sampleKey?: SampleKeyTranslations;
    /** A9 "Más datos de la muestra" section of the owner's sample editor. */
    samplePrep?: SamplePrepTranslations;
    /** "Usar café existente" picker strings (S9-05); optional for offline blobs. */
    coffeePicker?: {
      useExisting: string;
      title: string;
      searchPlaceholder: string;
      mine: string;
      shared: string;
      public: string;
      empty: string;
      close: string;
    };
    editSampleNotOwner: string;
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
    individual: string;
    masterControls: string;
    submittedOf: string;
    /** Raw "{count} de {total} enviaron todo" (optional: offline blobs). */
    submittedTemplate?: string;
    closeSession: string;
    confirmClose: string;
    liveCountDown: string;
    closeSessionError: string;
    deadline: DeadlineBannerTranslations;
    closeRule: string;
    closeUnsentOne: string;
    closeUnsentMany: string;
    closeUnsentNone: string;
    closeNotFinalized?: string;
    closeImpactLoading: string;
    startSession: string;
    starting: string;
    startSessionError: string;
    startGroupNoticeFailed: string;
    startGroupNoticePartial: string;
    masterRole: string;
    participantRole: string;
    // Shell (Phase 3)
    samplesHeader: string;
    /** aria-label of the phone chevron that reveals session details. */
    sessionDetails?: string;
    evaluationHeader: string;
    phaseTitle: string;
    cuppingModule: string;
    exitToSessions: string;
    invite: string;
    generating: string;
    copy: string;
    copied: string;
    copyImage: string;
    downloadQr: string;
    formatLabel: string;
    phaseLabels: Record<string, string>;
    attrLabels: Record<string, string>;
    guard: {
      nextTitle: string;
      nextBody: string;
      submitTitle: string;
      submitBody: string;
      review: string;
      continueAnyway: string;
      submitAnyway: string;
      // Optional: a pre-upgrade IndexedDB props cache may predate them.
      outcomeCloses?: string;
      outcomeStays?: string;
      finishWith?: string;
    };
    // Optional: props can be rehydrated from a pre-upgrade IndexedDB cache
    // (cup/error.tsx offline rebuild) that predates this key — CupClient
    // falls back to built-in copy when absent.
    leaveGuard?: {
      title: string;
      body: string;
      // Optional for the same rehydration-fallback reason as the rest of
      // `leaveGuard` — an offline-cached pre-upgrade prop blob won't have it.
      bodyPending?: string;
      stay: string;
      leave: string;
    };
    offline: {
      bannerOffline: string;
      bannerReconnecting: string;
      bannerSynced: string;
      bannerSyncFailed: string;
      retrySync: string;
      submitBlocked: string;
      // Online-but-device-only variant (2026-09). Optional: pre-upgrade
      // offline prop blobs lack them; the copy falls back to submitBlocked.
      submitBlockedPending?: string;
      retryBeforeSubmit?: string;
      conflictTitle: string;
      conflictBody: string;
      conflictKeep: string;
      conflictReplace: string;
      bannerStorageUnavailable: string;
      // S10 WP9b: the "new version, reload" notice, rendered in the shell
      // slot because the fixed SessionShell covers the app-layout copy.
      // Optional: pre-upgrade offline prop blobs lack them.
      bannerNewVersion?: string;
      reloadNow?: string;
      // S10 WP8 fourth review: the "device changed user" notice lives in the banner.
      bannerIdentityChanged?: string;
      // S8-09. Optional: pre-upgrade offline prop blobs lack them.
      bannerNextAttempt?: string;
      /** RAW template with "{count}". */
      terminalNotice?: string;
    };
    // Reference sample (2026-09). Optional: pre-upgrade offline blobs.
    referenceBadge?: string;
    compareHint?: string;
    referenceSelect?: string;
    referenceNone?: string;
    // Multi-reference (S6)
    referenceActive?: string;
    referenceAdd?: string;
    referenceRemoveActive?: string;
    referenceAddHint?: string;
    referenceAddTitle?: string;
    referenceAddConfirm?: string;
    referenceRepinTitle?: string;
    /** `{n}` placeholder, replaced client-side. */
    referenceRepinBody?: string;
    /** S8-27: removing the active reference re-pins the earlier one. `{label}` + `{n}`. */
    referenceRemoveRepinTitle?: string;
    referenceRemoveRepinBody?: string;
    referenceRemoveRepinConfirm?: string;
    // Invite control + late joiners (S8-11). Optional: offline prop blobs.
    inviteRegenerate?: string;
    inviteRegenerateTitle?: string;
    inviteRegenerateBody?: string;
    inviteRegenerateConfirm?: string;
    entriesClose?: string;
    entriesOpen?: string;
    entriesClosedNote?: string;
    // Reference lock (2026-09-25): quality pinned at 5, cups cleared.
    referenceLocked?: string;
    referenceLockedAffective?: string;
    referenceCupsLocked?: string;
    // "Notas rápidas" end step (2026-10, WP-B). Optional with inline
    // fallbacks: the cup error boundary rehydrates an older cached prop blob.
    expressNotes?: {
      title: string;
      body: string;
      placeholder: string;
      optional: string;
      open: string;
      back: string;
      submit: string;
    };
  };
  userEmail?: string;
  userCountry?: string;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  // S10 WP8 (shared device): the person this screen was RENDERED for, frozen at
  // mount. Local draft keys, the offline replay and every server write use it,
  // never a later prop: if another tab signs someone else in and this page is
  // refreshed, the form state here is still the first person's and must not be
  // saved as the new one. Server writes carry it as `expectedUserId`; on a
  // POSITIVE mismatch (a user is signed in and it is a different one) they write
  // nothing and answer `identity_changed`. Only that answer latches this tab
  // (lib/identityChange.ts, module-level: it lasts until a reload or until a
  // later check sees the same user signed in again). Nobody signed in, or an
  // unreachable auth service, is an ordinary pending save, as on main. The
  // notice shows in the OfflineBanner below (this shell covers the layout bar).
  const [userId] = useState(renderedUserId);
  const stepsForFormat: CuppingStep[] =
    session.format === "descriptive" ? DESCRIPTIVE_STEPS : CUPPING_STEPS;
  // Formats other than affective/descriptive render the CombinedForm, so they
  // score against combined-format completeness rules.
  const guardFormat: CuppingFormat =
    session.format === "affective"
      ? "affective"
      : session.format === "descriptive"
        ? "descriptive"
        : "combined";

  // The reference (control) sample is cupped FIRST — the room levels on the
  // anchor before comparing (lib/referenceRules.ts). Order is re-derived
  // whenever the owner changes the reference (see applyReferenceOrder).
  // Multi-reference (S6): references are cupped first, by rank (R1, R2…). A
  // pre-upgrade offline blob has no ranks — fall back to the single pointer.
  const initialRefIds = (() => {
    const ranked = referencesOf(session.samples).map((x) => x.id);
    if (ranked.length) return ranked;
    return session.referenceSampleId ? [session.referenceSampleId] : [];
  })();
  const initialOrdered = orderByReferenceIds(session.samples, initialRefIds);
  const initialSampleIdx = initialSampleId
    ? Math.max(0, initialOrdered.findIndex((s) => s.id === initialSampleId))
    : 0;
  const [sampleIdx, setSampleIdx] = useState(initialSampleIdx);
  const [currentStep, setCurrentStep] = useState<CuppingStep>(stepsForFormat[0]);
  const [samples, setSamples] = useState(initialOrdered);
  const [activeTab, setActiveTab] = useState<CuppingTab>("cupping");
  // "Notas rápidas": the free-text end step shown after the last sample of
  // the last phase and before every submit path. A boolean, NOT a
  // CuppingStep — STEP_ATTRIBUTES, PhaseStepper and completeness never see it.
  const [notesStage, setNotesStage] = useState(false);
  // The note lives inside the format's module JSON under EXPRESS_NOTE_KEY, so
  // it rides the existing auto-save / offline / submit plumbing untouched.
  const notesModuleKey = moduleKeyForFormat(session.format);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "pending"
  >("idle");
  // Whether ANY module save is currently sitting only in local (IndexedDB)
  // storage — flips true on a "pending" flush result, false once a flush
  // reports "synced" or the reconnect replay (useOfflineSync) finishes.
  // Drives the leave-guard's alternate copy (see leaveGuardCopy below).
  const [hasPending, setHasPending] = useState(false);
  // Modules of this session parked for good (closed_unsent, orphaned, failed):
  // they never block the submit and are named in a persistent notice (S8-09).
  const [terminalCount, setTerminalCount] = useState(0);
  // Ground truth for the indicator: derive "anything still device-only?" from
  // the durable store after every flush instead of trusting one synced save
  // (F-solo-5: sample B synced must not clear sample A's amber state). Resolves
  // the number of modules still waiting to sync.
  const refreshLocalState = useCallback(async (): Promise<number> => {
    const blob = await loadSession(session.id, userId);
    let pending = 0;
    let terminal = 0;
    if (blob) {
      for (const s of Object.values(blob.samples)) {
        for (const mod of Object.values(s.modules)) {
          if (!mod) continue;
          if (blocksSubmit(mod.syncStatus)) pending += 1;
          else if (isTerminal(mod.syncStatus)) terminal += 1;
        }
      }
    }
    setHasPending(pending > 0);
    setTerminalCount(terminal);
    return pending;
  }, [session.id, userId]);
  // Realtime channel for the group submitted-count is not SUBSCRIBED — the
  // count shown in the master panel may be stale (F10).
  const [liveCountDown, setLiveCountDown] = useState(false);
  const [editingSample, setEditingSample] = useState(false);
  // Set after a metadata save when the linked coffee belongs to someone else
  // — the label still saved, but the coffee record itself was skipped.
  const [coffeeNotOwnedNotice, setCoffeeNotOwnedNotice] = useState(false);
  const [pickingCoffee, setPickingCoffee] = useState(false);
  const [pickPending, setPickPending] = useState(false);
  // Loaded when the picker opens (never shipped in the page props).
  const [pickerCoffees, setPickerCoffees] = useState<UsableCoffee[]>([]);
  const pickBusy = useRef(false);
  // Owner's counter: Map<cupperId, submitted sampleIds>, re-seeded from the
  // server rows on every refresh (30 s poll, SUBSCRIBED, visibility) — never
  // a `+1` per realtime event.
  const [submitMap, setSubmitMap] = useState<SubmitMap>(() => seedSubmitMap(submittedRows));
  const [seededFrom, setSeededFrom] = useState(submittedRows);
  if (seededFrom !== submittedRows) {
    // Adjust state during render when the server rows prop changed (refresh).
    setSeededFrom(submittedRows);
    setSubmitMap(seedSubmitMap(submittedRows));
  }
  const submitProgress = computeSubmitProgress(
    submitMap,
    samples.map((s) => s.id),
    eligibleCupperIds,
  );
  const submittedCount = isOwner ? submitProgress.done : initialSubmittedCount;
  const submittedTotal = isOwner ? submitProgress.total : participantCount;
  const [isGoingToResults, setIsGoingToResults] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [guard, setGuard] = useState<{
    kind: "next" | "submit";
    items: GuardItem[];
  } | null>(null);
  // Sample+step combos ("sampleId:step") that have already triggered a guard —
  // once flagged, the inline * / red indicator stays visible on that section
  // (even if the user reviews or continues anyway) until the field is filled.
  const [flaggedSteps, setFlaggedSteps] = useState<Set<string>>(new Set());
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [entriesLocked, setEntriesLockedState] = useState(sessionEntriesLocked);
  // B1: the reference mode is read from the realtime payload too, so a tab that
  // is already open follows an owner switch (anchor <-> free) and never pins
  // locally on a stale mode. The server stays the authority: upsertEvaluation
  // and the offline replay read the STORED mode and pin (or not) regardless.
  const [referenceMode, setReferenceModeState] = useState<string | undefined>(session.referenceMode);
  // A fresh server prop (router.refresh) wins: adjust state during render
  // (React's derived-state pattern) instead of an effect.
  const [seenReferenceMode, setSeenReferenceMode] = useState(session.referenceMode);
  if (seenReferenceMode !== session.referenceMode) {
    setSeenReferenceMode(session.referenceMode);
    setReferenceModeState(session.referenceMode);
  }
  const [entriesPending, setEntriesPending] = useState(false);
  // Follow the server value when router.refresh() delivers a fresh one.
  const [seenEntriesLocked, setSeenEntriesLocked] = useState(sessionEntriesLocked);
  if (seenEntriesLocked !== sessionEntriesLocked) {
    setSeenEntriesLocked(sessionEntriesLocked);
    setEntriesLockedState(sessionEntriesLocked);
  }
  const [startedAt, setStartedAt] = useState(sessionStartedAt);
  // Owner-chosen "Referencia" sample; updated live for participants through
  // the cupping_sessions realtime stream below.
  // Ordered ids of the references (R1 first); the LAST is the active one —
  // the only one pinned at 79.00 (earlier ones keep their data but unlock).
  const [refOrder, setRefOrder] = useState<string[]>(initialRefIds);
  const refOrderRef = useRef(refOrder);
  const referenceSampleId = refOrder.length ? refOrder[refOrder.length - 1] : null;
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  // Re-pin of a sample cuppers already rated: asks before their notes are
  // replaced by the 79.00 anchor, then sends confirmRepin (S8-21 #1).
  const [repinTarget, setRepinTarget] = useState<string | null>(null);
  const [removeRepin, setRemoveRepin] = useState<{ label: string; n: number } | null>(null);
  const referenceSeqRef = useRef(0);
  // Sample ids whose pinned "ensure" auto-save has already been queued.
  const ensuredReferenceRef = useRef<Set<string>>(new Set());
  // Latest committed samples / current sample id, for handlers that run
  // outside the render closure (realtime events, the reference-order swap).
  const samplesRef = useRef(samples);
  const sampleIdRef = useRef<string | null>(null);
  // Known sample ids for the realtime guards — from STATE, not the server
  // prop, so a sample added mid-session is known without re-subscribing.
  const sampleIdsRef = useRef<Set<string>>(new Set(samples.map((s) => s.id)));
  useEffect(() => {
    samplesRef.current = samples;
    sampleIdRef.current = samples[sampleIdx]?.id ?? null;
    sampleIdsRef.current = new Set(samples.map((s) => s.id));
  });

  // Reconcile with a refreshed server prop (S6 CP-C4): the owner adding,
  // renaming or removing a sample mid-session touches the session row, the
  // cupping_sessions subscription below calls router.refresh(), and this
  // merge applies the server's sample METADATA while keeping every local
  // evaluation draft (lib/sampleReconcile.ts). The server's referenceSampleId
  // is the truth after a refresh — it may point at a sample this client only
  // learns about now. Skipped on mount (state already equals the prop).
  const serverSamplesRef = useRef(session.samples);
  useEffect(() => {
    if (serverSamplesRef.current === session.samples) return;
    serverSamplesRef.current = session.samples;
    // Multi-reference: the server's ranks are the truth (R1, R2…); a row
    // without ranks falls back to the single pointer, like initialRefIds.
    const ranked = referencesOf(session.samples).map((x) => x.id);
    const refIds = ranked.length
      ? ranked
      : session.referenceSampleId
        ? [session.referenceSampleId]
        : [];
    const active = refIds.length ? refIds[refIds.length - 1] : null;
    const merged = reconcileSamples(samplesRef.current, session.samples, active);
    const next = orderByReferenceIds(merged, refIds);
    const idx = indexAfterReconcile(next, sampleIdRef.current, samplesRef.current.findIndex((s) => s.id === sampleIdRef.current));
    setSamples(next);
    setSampleIdx(idx);
    refOrderRef.current = refIds;
    setRefOrder(refIds);
  }, [session.samples, session.referenceSampleId]);
  // Moves the (new) reference to the front, restores position order for the
  // rest, and keeps the cupper on the sample they were looking at.
  const applyRefOrder = (order: string[]) => {
    const next = order.length ? order[order.length - 1] : null;
    refOrderRef.current = order;
    setRefOrder(order);
    // A reference chosen mid-session must get its pinned auto-save again on
    // the next visit (the server re-pinned every stored row in
    // setReferenceSample; this keeps this client's copy in step) — CP-C2.
    if (next) ensuredReferenceRef.current.delete(next);
    const byPosition = <T extends { position: number }>(list: T[]) =>
      [...list].sort((a, b) => a.position - b.position);
    const currentId = sampleIdRef.current;
    const ids = orderByReferenceIds(byPosition(samplesRef.current), order).map((s) => s.id);
    setSamples((prev) => orderByReferenceIds(byPosition(prev), order));
    setSampleIdx(Math.max(0, ids.indexOf(currentId ?? "")));
  };
  // The realtime stream only carries the ACTIVE pointer; the list of
  // references is derived from it (lib/referenceRules.nextReferenceOrder).
  const applyReferenceOrder = (next: string | null) =>
    applyRefOrder(nextReferenceOrder(refOrderRef.current, next));
  const applyReferenceOrderRef = useRef(applyReferenceOrder);
  useEffect(() => {
    applyReferenceOrderRef.current = applyReferenceOrder;
  });
  // Phone chrome collapses (header row + phase stepper hidden) while the
  // on-screen keyboard is up — see hooks/useKeyboardOpen.ts (CP-C1).
  const keyboardOpen = useKeyboardOpen();
  const [isStarting, setIsStarting] = useState(false);

  // ── Synced warm-up run (master side, S6 warm-up v3 PR3) ──────────────
  // The master's own device plays WITH sound; followers' waiting rooms open
  // the same run from the cupping_sessions UPDATE. `warmupRun` mirrors the
  // server timestamp (+ clock skew) so the panel can show time left and the
  // "Iniciar cata" button can ask before cutting the exercise short.
  const warmupExercise = warmupById(warmup?.exerciseId);
  // Starts from the server-knowable part of the interstitial's gate (the seen-set
  // is only readable on the client), so the discreet entry never renders for a
  // frame under an interstitial that is about to open; WarmupMoment corrects it
  // once settled. TODO(kim-validar:F1)
  const [warmupOverlayOpen, setWarmupOverlayOpen] = useState(
    () =>
      !!warmup &&
      sessionStatus !== "closed" &&
      shouldShowWarmupOverlay({
        exerciseId: warmup.exerciseId,
        seenValue: null,
        hasOwnEvaluation: warmup.hasOwnEvaluation,
        isOwner,
        isGroup,
        isAsync: sessionIsAsync,
        startedAt: !!startedAt,
      }),
  );
  const warmupRunMs = runLengthMs(warmup?.exerciseId);
  const [warmupStartedAtMs, setWarmupStartedAtMs] = useState<number | null>(() =>
    parseDbTimestamp(warmup?.warmupStartedAt),
  );
  // Clock skew (server − client) lives in a ref written from effects and
  // handlers only; `warmupServerNow` is the server-adjusted clock, ticked
  // once a second while a run exists (0 until the first tick).
  const warmupSkewRef = useRef(0);
  useEffect(() => {
    const serverNow = parseDbTimestamp(warmup?.serverNow);
    if (serverNow !== null) warmupSkewRef.current = skewMs(serverNow, Date.now());
  }, [warmup?.serverNow]);
  const warmupResyncMs = useCallback(
    () => (warmupStartedAtMs === null ? null : resyncPositionMs(warmupStartedAtMs, Date.now(), warmupSkewRef.current)),
    [warmupStartedAtMs],
  );
  const [warmupPending, setWarmupPending] = useState(false);
  const [masterPlayer, setMasterPlayer] = useState<{ seekMs: number } | null>(null);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [warmupServerNow, setWarmupServerNow] = useState(0);
  const warmupRunning = warmupServerNow > 0 && isWarmupRunning(warmupStartedAtMs, warmupServerNow, 0, warmupRunMs);
  useEffect(() => {
    if (warmupStartedAtMs === null) return;
    const tick = () => setWarmupServerNow(Date.now() + warmupSkewRef.current);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [warmupStartedAtMs]);
  const warmupTimeLeft =
    warmupRunning && warmupStartedAtMs !== null
      ? formatTimeLeft(timeLeftMs(warmupStartedAtMs, warmupServerNow, 0, warmupRunMs))
      : null;

  const handleWarmupStart = () => {
    if (warmupPending) return;
    setWarmupPending(true);
    feedback.run(
      startWarmup(session.id).finally(() => setWarmupPending(false)),
      (d) => {
        const startedAtMs = parseDbTimestamp(d.warmupStartedAt) ?? Date.now();
        const serverNow = parseDbTimestamp(d.serverNow);
        if (serverNow !== null) warmupSkewRef.current = skewMs(serverNow, Date.now());
        setWarmupStartedAtMs(startedAtMs);
        setMasterPlayer({ seekMs: seekFor(startedAtMs, Date.now(), warmupSkewRef.current, { live: true }) });
      },
    );
  };
  const handleWarmupStop = () => {
    if (warmupPending) return;
    setWarmupPending(true);
    feedback.run(
      stopWarmup(session.id).finally(() => setWarmupPending(false)),
      () => {
        setWarmupStartedAtMs(null);
        setMasterPlayer(null);
      },
    );
  };
  const handleWarmupReopen = () => {
    if (warmupStartedAtMs === null || warmupServerNow === 0) return;
    // warmupServerNow is already server-adjusted (ticked every second).
    setMasterPlayer({ seekMs: seekFor(warmupStartedAtMs, warmupServerNow, 0, { live: false }) });
  };
  const [startError, setStartError] = useState(false);
  const [groupNotice, setGroupNotice] = useState<"failed" | "partial" | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  // F-grupal-2: how many cuppers hold complete notes that were never sent.
  // undefined = loading, null = could not be read (the rule sentence still shows).
  const [closeImpact, setCloseImpact] = useState<{ unsentCuppers: number } | null | undefined>(
    undefined,
  );
  const [clockTime, setClockTime] = useState(() =>
    new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(id);
  }, [locale]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    sampleId: string;
    key: keyof Sample;
    data: Data;
  } | null>(null);

  // ─── Offline support ──────────────────────────────────────────
  const { online, recheck } = useConnectivity();
  // Bumped on foreground resume so the realtime effect re-runs and rebuilds the
  // channel through subscribeWithSessionAuth (S8-15). Never saves: the pagehide
  // flush stays the only writer.
  const [resumeKey, setResumeKey] = useState(0);
  // When the owner's channel last reached SUBSCRIBED (and re-seeded); the resume
  // fallback timer checks it so a channel that never subscribes still refreshes.
  const ownerSeededAtRef = useRef(0);
  // The resume fallback timer: one at a time, cleared on the next resume, on
  // unmount and when SUBSCRIBED arrives.
  const reseedFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReseedFallback = () => {
    if (reseedFallbackRef.current) {
      clearTimeout(reseedFallbackRef.current);
      reseedFallbackRef.current = null;
    }
  };
  useEffect(() => clearReseedFallback, []);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  const { syncPhase, conflicts, resolveConflict, retrySync, nextRetryAt } = useOfflineSync({
    userId,
    online,
  });
  // S10 leftovers C2: the latest retrySync and a once-per-page flag for the one
  // replay kicked after the claim re-key moved drafts (see the hydration effect).
  const retrySyncRef = useRef(retrySync);
  useEffect(() => {
    retrySyncRef.current = retrySync;
  }, [retrySync]);
  const rekeyReplayKickedRef = useRef(false);
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  // IndexedDB has proven unreliable (quota, Safari private mode, …) — the
  // OfflineBanner surfaces this so the cupper knows local drafts aren't safe.
  // S10 WP8b: the OfflineBanner notice sits at the top of the scroll area; toast
  // ONCE per latch (false -> true) so a cupper scrolled down the form sees it.
  const identityLatched = useSyncExternalStore(onIdentityChanged, isIdentityChanged, () => false);
  const toastedIdentityRef = useRef(false);
  useEffect(() => {
    if (!identityLatched) {
      toastedIdentityRef.current = false;
      return;
    }
    if (toastedIdentityRef.current) return;
    toastedIdentityRef.current = true;
    feedback.notifyError("identity_changed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityLatched]);
  const storageUnavailable = useSyncExternalStore(
    onOfflineStorageUnavailable,
    isOfflineStorageUnavailable,
    () => false
  );

  // A completed reconnect replay clears the "pending" save state even when no
  // further edit triggers a new flush (e.g. the cupper just waited it out).
  useEffect(() => {
    // A replay run ended (any phase but "syncing"): recount from the durable
    // store. The amber "saved on this device · pending" pill clears only when
    // NOTHING is waiting any more, not on the first synced module.
    if (syncPhase === "syncing" || syncPhase === "idle") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors durable storage into UI state
    void refreshLocalState().then((pending) => {
      if (pending === 0) setSaveStatus((s) => (s === "pending" ? "idle" : s));
    });
  }, [syncPhase, refreshLocalState]);

  // First paint after a (re)load: terminal notes from an earlier visit show
  // immediately, even offline.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors durable storage into UI state
    void refreshLocalState();
  }, [refreshLocalState]);

  // Independent 500ms debounce for durable local (IndexedDB) writes, separate
  // from the 800ms server debounce so neither blocks the other.
  const localDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPendingRef = useRef<{
    sampleId: string;
    label: string;
    key: ModuleKey;
    data: Data;
  } | null>(null);
  const seed = { format: session.format, cupsPerSample: session.cupsPerSample };

  const writeLocal = (
    sampleId: string,
    label: string,
    key: ModuleKey,
    data: Data,
  ) =>
    mergeModuleData(session.id, userId, sampleId, label, key, data, seed);

  // Synchronous localStorage mirror of the pending refs, written on pagehide.
  // IndexedDB writes are async and can be aborted when the page dies instantly
  // (hard reload, tab kill mid-debounce); localStorage.setItem is synchronous
  // and always lands. Consumed + cleared by the mount rehydration below.
  const flushBackupKey = `cata_flush_backup_${session.id}_${userId}`;
  type FlushBackupEntry = {
    sampleId: string;
    label: string;
    key: ModuleKey;
    data: Data;
    ts: number;
  };

  // Cache the full props payload on each online mount so an offline hard-refresh
  // can rebuild this screen from IndexedDB (see cup/error.tsx). Data durability
  // is independent of this — the evaluation blob is always persisted.
  useEffect(() => {
    if (!online) return;
    void cacheProps(session.id, userId, {
      locale,
      initialSampleId,
      session,
      isOwner,
      isGroup,
      sessionStatus,
      sessionStartedAt: startedAt,
      sessionIsAsync,
      participantCount,
      submittedCount: initialSubmittedCount,
      translations,
      userEmail,
      userCountry,
      userId,
      // Static warm-up only (exercise id + copy): the offline rebuild runs the
      // same seen-set logic as online. The synced-run clock is never cached.
      warmup: warmupForCache(warmup),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Rehydrate locally-persisted pending edits (IndexedDB) over the
  // server-rendered snapshot. When the user leaves mid-debounce (back swipe,
  // tab kill), the pagehide flush stored the edit locally but the server may
  // never have received it — so a fresh server render shows stale/empty
  // fields even though the data survived. Pending modules are "local wins" by
  // the offline-replay contract, so merging them over the props is safe.
  // Runs once per mount, before the reconnect replay can flip statuses
  // (IndexedDB read resolves in ms; the replay needs network round-trips).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Sync localStorage backup first — it holds edits from a page that died
      // before its async IndexedDB flush completed, so it's newest-or-equal.
      let backup: FlushBackupEntry[] = [];
      try {
        const raw = localStorage.getItem(flushBackupKey);
        if (raw) backup = JSON.parse(raw) as FlushBackupEntry[];
      } catch {
        backup = [];
      }

      // S10 WP8b: if this page was reloaded after the guest it showed was
      // claimed in another tab, the latched edits still sit under the anonymous
      // id. Move them to the account BEFORE the first read, so the form hydrates
      // from them and the next save cannot replace the module with a stale copy.
      // (The provider's own re-key runs after this effect: effects run child
      // first. Doing it here makes the order explicit, not lucky.)
      const movedByRekey = await awaitClaimRekey(userId);
      if (cancelled) return;
      const blob = await loadSession(session.id, userId);
      if (cancelled) return;

      if (blob || backup.length > 0) {
        setSamples((prev) =>
          prev.map((s) => {
            let next = s;
            const local = blob?.samples[s.id];
            if (local) {
              for (const [mk, mod] of Object.entries(local.modules)) {
                // Conflicts are the SyncConflictModal's job — don't pre-apply them.
                if (!mod || !hydratesForm(mod.syncStatus) || !isModuleKey(mk))
                  continue;
                next = { ...next, [mk]: mod.data };
              }
            }
            for (const entry of backup) {
              if (entry.sampleId !== s.id || !isModuleKey(entry.key)) continue;
              // A crash can leave a backup behind without pagehide clearing
              // it — never let it regress a newer IndexedDB write.
              const mod = blob?.samples[s.id]?.modules[entry.key];
              if (mod && mod.updatedAt > entry.ts) continue;
              next = { ...next, [entry.key]: entry.data };
            }
            return next;
          }),
        );
      }

      // Promote backup entries into the durable pending store (so the replay
      // pushes them to the server), then clear the one-shot backup.
      for (const entry of backup) {
        if (!isModuleKey(entry.key)) continue;
        const mod = blob?.samples[entry.sampleId]?.modules[entry.key];
        if (mod && mod.updatedAt > entry.ts) continue;
        await writeLocal(entry.sampleId, entry.label, entry.key, entry.data);
      }
      if (backup.length > 0) {
        try {
          localStorage.removeItem(flushBackupKey);
        } catch {
          /* ignore */
        }
      }

      // S10 leftovers C2: the re-key above moved drafts to the account; the
      // hook's mount replay may have read the store before that, and the
      // provider's re-key finds nothing left to move. ONE replay now (offline
      // it is a no-op; the guard is a pure rule, once per page).
      if (!cancelled && shouldKickReplayAfterRekey(movedByRekey, rekeyReplayKickedRef.current)) {
        rekeyReplayKickedRef.current = true;
        void retrySyncRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, userId]);

  // Best-effort flush of in-flight edits before the tab unloads or is hidden.
  // IndexedDB writes can't be awaited here; the debounces keep the unsaved
  // window tiny. Covers BOTH pending refs: the local 500ms one and the server
  // 800ms one — writing the server-pending payload locally marks it "pending",
  // so the offline replay pushes it to the server on the next visit instead of
  // losing it when the tab dies inside the debounce window. pagehide and
  // visibilitychange are included because beforeunload is unreliable on mobile;
  // extra writes on tab switches are idempotent (last-write-wins merge).
  useEffect(() => {
    const flushToLocal = () => {
      const entries: FlushBackupEntry[] = [];
      const now = Date.now();
      const lp = localPendingRef.current;
      if (lp) {
        void writeLocal(lp.sampleId, lp.label, lp.key, lp.data);
        entries.push({ ...lp, ts: now });
      }
      const sp = pendingSaveRef.current;
      if (sp && isModuleKey(sp.key)) {
        const label =
          session.samples.find((s) => s.id === sp.sampleId)?.label ?? "";
        void writeLocal(sp.sampleId, label, sp.key, sp.data);
        entries.push({ sampleId: sp.sampleId, label, key: sp.key, data: sp.data, ts: now });
      }
      // Sync mirror: survives even if the async IndexedDB writes above are
      // aborted by an instant page kill. Always rewritten (or cleared) so it
      // reflects exactly what was pending at the last departure — never stale.
      try {
        if (entries.length > 0) {
          localStorage.setItem(flushBackupKey, JSON.stringify(entries));
        } else {
          localStorage.removeItem(flushBackupKey);
        }
      } catch {
        /* quota/private-mode — IndexedDB path still applies */
      }
    };
    const onVisibility = () => {
      if (document.hidden) flushToLocal();
    };
    window.addEventListener("beforeunload", flushToLocal);
    window.addEventListener("pagehide", flushToLocal);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushToLocal);
      window.removeEventListener("pagehide", flushToLocal);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, userId]);

  // S10 WP8 fourth review: a guest who finished the account claim in another tab
  // makes lib/identityResolve.ts re-key this tab's drafts and RELOAD it. Before
  // that, AWAIT the two pending edits into the durable store (under the id this
  // tab was rendered for), so re-keying carries them to the account and
  // nothing being typed is lost. (The pagehide flush also runs on the reload,
  // but IndexedDB writes there are not awaited; this one is.)
  useEffect(() => {
    return registerBeforeIdentityReload(async () => {
      const lp = localPendingRef.current;
      if (lp) await writeLocal(lp.sampleId, lp.label, lp.key, lp.data);
      const sp = pendingSaveRef.current;
      if (sp && isModuleKey(sp.key)) {
        const label = session.samples.find((s) => s.id === sp.sampleId)?.label ?? "";
        await writeLocal(sp.sampleId, label, sp.key, sp.data);
      }
      // S10 WP8b: both edits are durable now. Drop the refs and the timers so
      // the reload's own pagehide flush does not write a SECOND copy under the
      // old id (the re-key has just removed that key) and no debounce fires a
      // late save from a page that is about to go.
      localPendingRef.current = null;
      pendingSaveRef.current = null;
      if (localDebounceRef.current) clearTimeout(localDebounceRef.current);
      localDebounceRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, userId]);

  // Foreground resume: re-probe connectivity, rebuild the group channel and
  // refetch the server page (the reconcile effect merges fresh samples without
  // touching local drafts).
  useForegroundResume(() => {
    void recheck();
    if (!isGroup) return;
    setResumeKey((k) => k + 1);
    clearReseedFallback();
    // One refetch per resume: the online owner gets it from the rebuilt channel's
    // SUBSCRIBED re-seed (it also covers events missed while the socket was down).
    if (resumeCallbackRefreshes({ isGroup, isOwner, online })) {
      router.refresh();
    } else {
      // Safety net: if the channel never reaches SUBSCRIBED, refresh anyway.
      // Known limit: a resume that follows the `online` event (the channel
      // effect re-runs and SUBSCRIBED refreshes) can still refresh twice.
      const resumedAt = Date.now();
      reseedFallbackRef.current = setTimeout(() => {
        reseedFallbackRef.current = null;
        if (ownerSeededAtRef.current < resumedAt) router.refresh();
      }, OWNER_RESEED_FALLBACK_MS);
    }
  });

  // ─── Realtime subscription for group sessions ─────────────────
  useEffect(() => {
    if (!isGroup || !online) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Trailing 2 s debounce for the server re-fetch: a burst of session-row
    // touches (sample edits, start, reference) becomes ONE router.refresh().
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 2000);
    };

    // JWT before join — see lib/supabase/realtimeAuth.ts (S6 CP-C4).
    const stopSubscription = subscribeWithSessionAuth(
      supabase,
      () => {
        const channel = supabase.channel(`session:${session.id}`);
        // The submitted counter is rendered only in the owner's master panel
        // and RLS (S8-01) exposes peers' evaluation rows to the owner alone,
        // so a participant's binding would be a dead socket.
        if (isOwner) {
          channel.on(
            "postgres_changes",
            // Server-side sessionId filter narrows the stream; sampleIds/isDraft guards stay client-side.
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
              if (
                typeof isDraft === "boolean" &&
                cupperId &&
                sampleId &&
                sampleIdsRef.current.has(sampleId)
              ) {
                setSubmitMap((prev) => applySubmitEvent(prev, { cupperId, sampleId, isDraft }));
              }
            },
          );
        }
        return channel
      // The reference sample lives on the session row, which is already in
      // the supabase_realtime publication (Phase 7) — no extra SQL needed.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cupping_sessions",
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if ("referenceSampleId" in row || "reference_sample_id" in row) {
            const next = (row.referenceSampleId ?? row.reference_sample_id ?? null) as
              | string
              | null;
            applyReferenceOrderRef.current(
              next && sampleIdsRef.current.has(next) ? next : null,
            );
          }
          if (typeof row.referenceMode === "string" || typeof row.reference_mode === "string") {
            setReferenceModeState((row.referenceMode ?? row.reference_mode) as string);
          }
          if (typeof row.entriesLocked === "boolean") {
            setEntriesLockedState(row.entriesLocked);
          }
          // Any session-row change (sample add/rename/remove touch updatedAt;
          // start/close/reference) → re-fetch the server page; the reconcile
          // effect above merges the fresh samples without losing drafts.
          scheduleRefresh();
        }
      );
      },
      // Without a status callback a dropped channel is indistinguishable from
      // "nobody has submitted yet" — the count just stops moving. Surface it
      // so the maestro knows the number is stale rather than flat (F10).
      (status) => {
        setLiveCountDown(status !== "SUBSCRIBED");
        // Events missed while the socket was down: re-seed from the server.
        if (status === "SUBSCRIBED" && isOwner) {
          ownerSeededAtRef.current = Date.now();
          clearReseedFallback();
          router.refresh();
        }
      },
    );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stopSubscription();
    };
  }, [isGroup, isOwner, online, session.id, router, resumeKey]);

  // (S9-01 C-07: the owner's own visibilitychange -> router.refresh() effect was
  // removed; useForegroundResume bumps `resumeKey`, which rebuilds the channel
  // above, and its SUBSCRIBED callback re-seeds the owner's counter.)

  // Safety net for the realtime path above (S6 CP-C4): a group cupper whose
  // channel is silently dead (see lib/supabase/realtimeAuth.ts) still picks up
  // sample add/rename/remove and the reference within 30s. One RSC fetch per
  // cupper per 30s; the reconcile effect keeps every local draft. Skipped
  // while the tab is hidden.
  useEffect(() => {
    if (!isGroup || !online) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isGroup, online, router]);

  // ─── Save plumbing ────────────────────────────────────────────
  const labelFor = (sampleId: string) =>
    samples.find((s) => s.id === sampleId)?.label ?? "";

  // Returns "synced" when the server actually accepted the write, "pending"
  // when the edit only landed in local (IndexedDB) storage — either because
  // we were offline, or because the server call itself failed. Callers must
  // not report "saved" to the user on a "pending" result: the data is safe
  // (durable locally, replayed on reconnect) but NOT yet on the server.
  const flushSave = async (
    sampleId: string,
    key: keyof Sample,
    data: Data
  ): Promise<"synced" | "pending"> => {
    if (!isModuleKey(key)) return "synced";
    const mk = key as ModuleKey;

    // Offline → persist locally as pending and stop. Sync-on-reconnect replays.
    if (!onlineRef.current) {
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
      return "pending";
    }

    // A DIFFERENT user is signed in under this tab (another tab, S10 WP8): do
    // not send to the server while the latch holds (until a reload or until the
    // same user is seen again). The draft stays on the device under the rendered
    // user's key, exactly as when offline; nothing is deleted and the banner
    // asks for a reload.
    if (isIdentityChanged()) {
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
      return "pending";
    }

    try {
      if (key === "descriptive" || key === "affective" || key === "combined") {
        const saved = await upsertEvaluation({
          expectedUserId: userId,
          sessionSampleId: sampleId,
          sessionId: session.id,
          moduleKey: key,
          data,
          cupsPerSample: session.cupsPerSample,
          // S8-18: edit time, so the server drops this write if a newer one landed first.
          clientTs: Date.now(),
        });
        if (!saved.ok) throw new Error(saved.error);
      } else if (key === "extrinsic") {
        const saved = await upsertExtrinsic({ sessionSampleId: sampleId, data, expectedUserId: userId });
        // ActionResult: a refused write must fall to the local-pending path below.
        if (!saved.ok) throw new Error(saved.error);
      } else if (key === "physical") {
        const saved = await upsertPhysical({ sessionSampleId: sampleId, data, expectedUserId: userId });
        if (!saved.ok) throw new Error(saved.error);
      }
      // Server write landed — clear any local pending flag for this module.
      // Only when the stored draft is still exactly what was sent: a newer
      // local edit (the 500 ms local debounce is independent) stays pending.
      await setModuleStatus(session.id, userId, sampleId, mk, "synced", { ifData: data });
      return "synced";
    } catch (err) {
      // Network/server failure → fall back to a durable local pending write so
      // the edit survives and is replayed on the next reconnect.
      // C-06: a tab open across a deploy hits "Server Action not found" on every
      // save; flag it so the banner asks for a reload (the draft stays pending).
      noteIfStaleBundle(err);
      if (err instanceof Error && err.message === IDENTITY_CHANGED) void onServerIdentityChanged(userId);
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
      return "pending";
    }
  };

  // Returns "pending" when the flushed edit only landed locally (see flushSave)
  // so the submit path can refuse to mark a device-only edit as sent.
  const flushPending = async (): Promise<"synced" | "pending"> => {
    // Flush the local debounce first so navigation never leaves a stale blob.
    if (localDebounceRef.current) {
      clearTimeout(localDebounceRef.current);
      localDebounceRef.current = null;
    }
    if (localPendingRef.current) {
      const p = localPendingRef.current;
      localPendingRef.current = null;
      await writeLocal(p.sampleId, p.label, p.key, p.data);
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingSaveRef.current) {
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      return flushSave(pending.sampleId, pending.key, pending.data);
    }
    return "synced";
  };

  // Ground truth for "is anything of mine still device-only?" — reads the
  // durable store instead of trusting React state, since a pagehide flush or
  // a failed background save can mark modules pending without a re-render.
  const countLocalPending = async (): Promise<number> => {
    const blob = await loadSession(session.id, userId);
    if (!blob) return 0;
    let n = 0;
    for (const s of Object.values(blob.samples)) {
      for (const mod of Object.values(s.modules)) {
        if (mod && blocksSubmit(mod.syncStatus)) n += 1;
      }
    }
    return n;
  };

  // ─── Back-navigation trap ─────────────────────────────────────
  // The #1 reported data-loss trigger in live tastings: a stray horizontal
  // swipe (or a tap on the browser's back arrow, which sits right next to the
  // footer buttons on phones) navigates away mid-evaluation. A same-URL
  // history sentinel absorbs the back action — the URL doesn't change, so the
  // router stays put — then we flush pending saves and ask before leaving.
  // Chrome/Android swipe-nav is additionally blocked by overscroll-behavior-x
  // in globals.css; iOS edge swipes can't be blocked, so this trap is the
  // safety net there.
  const flushPendingRef = useRef<() => Promise<"synced" | "pending">>(async () => "synced");
  useEffect(() => {
    flushPendingRef.current = flushPending;
  });
  useEffect(() => {
    window.history.pushState({ cataCupSentinel: true }, "");
    const onPopState = () => {
      // Re-arm so the next back action is absorbed too, then confirm.
      window.history.pushState({ cataCupSentinel: true }, "");
      void flushPendingRef.current();
      setLeaveGuardOpen(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Fallback mirrors messages.*.cupping.leaveGuard for props rehydrated from a
  // pre-upgrade offline cache (see the prop's comment).
  const leaveGuardFallback =
    locale === "en"
      ? {
          title: "Leave the tasting?",
          body: "Looks like you navigated back. Your progress is saved, but leaving now will interrupt the evaluation.",
          bodyPending:
            "Some of your progress is saved only on this device and hasn't synced yet. If you leave now, it will sync the next time you open this tasting with a connection.",
          stay: "Keep tasting",
          leave: "Leave",
        }
      : {
          title: "¿Salir de la cata?",
          body: "Parece que retrocediste en el navegador. Tu avance está guardado, pero si sales ahora dejarás la evaluación a medias.",
          bodyPending:
            "Parte de tu avance está guardado solo en este dispositivo y aún no se ha sincronizado. Si sales ahora, se sincronizará la próxima vez que abras esta cata con conexión.",
          stay: "Seguir catando",
          leave: "Salir",
        };
  const leaveGuardBase = translations.leaveGuard ?? leaveGuardFallback;
  const leaveGuardCopy = {
    ...leaveGuardBase,
    // Some modules are still local-only — swap in the "not synced yet" body
    // so the cupper understands leaving won't lose data but won't push it
    // to the server either. Falls back to the built-in copy when a
    // pre-upgrade rehydrated prop blob lacks the key.
    body: hasPending
      ? (leaveGuardBase.bodyPending ?? leaveGuardFallback.bodyPending)
      : leaveGuardBase.body,
  };

  const handleLeaveConfirm = async () => {
    setLeaveGuardOpen(false);
    await flushPendingRef.current();
    router.push(`/${locale}/app/sessions`);
  };

  const scheduleLocalSave = (
    sampleId: string,
    label: string,
    key: keyof Sample,
    data: Data
  ) => {
    if (!isModuleKey(key)) return;
    if (localDebounceRef.current) clearTimeout(localDebounceRef.current);
    // ONE pending slot: an edit to a different sample (the notes stage edits
    // several on one screen) must not silently drop the previous sample's
    // unflushed write — mirror it to the store now, then take the slot.
    const prev = localPendingRef.current;
    if (prev && (prev.sampleId !== sampleId || prev.key !== key)) {
      localPendingRef.current = null;
      void writeLocal(prev.sampleId, prev.label, prev.key, prev.data);
    }
    localPendingRef.current = { sampleId, label, key: key as ModuleKey, data };
    localDebounceRef.current = setTimeout(() => {
      const p = localPendingRef.current;
      if (p) void writeLocal(p.sampleId, p.label, p.key, p.data);
      localPendingRef.current = null;
    }, 500);
  };

  const persist = (sampleId: string, key: keyof Sample, data: Data) => {
    setSaveStatus("saving");
    startTransition(async () => {
      try {
        const result = await flushSave(sampleId, key, data);
        // Derived from the store, not from this one save (F-solo-5).
        const stillPending = await refreshLocalState();
        if (result === "pending" || stillPending > 0) {
          // Stays "pending" until every waiting module syncs (a later flush or
          // the reconnect replay) -- never auto-cleared on a timer the way
          // "saved" is, since the data has NOT reached the server yet.
          setHasPending(true);
          setSaveStatus("pending");
        } else {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
        }
      } catch {
        setSaveStatus("idle");
      }
    });
  };

  const scheduleAutoSave = (
    sampleId: string,
    key: keyof Sample,
    data: Data
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Same single-slot rule as scheduleLocalSave: a save queued for sample A
    // is flushed right away when sample B takes the slot, so typing notes on
    // two samples within 800 ms never loses A's edit. Batching per sample
    // stays at 800 ms.
    const prev = pendingSaveRef.current;
    if (prev && (prev.sampleId !== sampleId || prev.key !== key)) {
      pendingSaveRef.current = null;
      persist(prev.sampleId, prev.key, prev.data);
    }
    pendingSaveRef.current = { sampleId, key, data };
    debounceRef.current = setTimeout(() => {
      persist(sampleId, key, data);
      pendingSaveRef.current = null;
    }, 800);
  };

  // Writes one module of ANY sample (by index into `samples`) and queues the
  // server + local saves for it. The forms edit the current sample through
  // setCurrentData; the notes stage edits every sample on one screen.
  const setSampleData = (idx: number, key: keyof Sample, data: Data) => {
    const sample = samples[idx];
    if (!sample) return;
    setSamples((prev) =>
      prev.map((s) => (s.id === sample.id ? { ...s, [key]: data } : s))
    );
    scheduleAutoSave(sample.id, key, data);
    scheduleLocalSave(sample.id, sample.label, key, data);
  };

  const setCurrentData = (key: keyof Sample, data: Data) =>
    setSampleData(sampleIdx, key, data);

  // Notes stage: merge the free text into the format's module JSON so the
  // scores already in that object are preserved (and vice versa).
  const setSampleNote = (sampleId: string, text: string) => {
    const idx = samples.findIndex((s) => s.id === sampleId);
    if (idx < 0) return;
    const existing = samples[idx][notesModuleKey];
    setSampleData(idx, notesModuleKey, { ...existing, [EXPRESS_NOTE_KEY]: text });
  };

  // ─── Navigation ───────────────────────────────────────────────
  const scrollCanvasToTop = () => {
    // Scroll the canvas (SessionShell's overflow container)
    const canvas = document.querySelector<HTMLElement>(
      "[data-session-canvas]"
    );
    canvas?.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleStepChange = async (step: CuppingStep, resetSample = false) => {
    if (step === currentStep && !notesStage) return;
    await flushPending();
    setNotesStage(false);
    setCurrentStep(step);
    if (resetSample) setSampleIdx(0);
    scrollCanvasToTop();
  };

  const handleSampleSelect = async (i: number) => {
    if (i === sampleIdx && !notesStage) return;
    await flushPending();
    setNotesStage(false);
    setSampleIdx(i);
    scrollCanvasToTop();
  };

  // "Notas rápidas": every path to submit passes through here first (footer on
  // the last sample, the Results module tap). Skippable — the stage's own
  // next button is the real submit (handleGoToResults, guard untouched).
  const openNotesStage = async () => {
    await flushPending();
    setNotesStage(true);
    scrollCanvasToTop();
  };

  const closeNotesStage = async () => {
    await flushPending();
    setNotesStage(false);
    scrollCanvasToTop();
  };

  // Resolve completeness affectiveIds → readable section labels.
  const sectionLabels = (ids: string[]) =>
    ids.map((id) => translations.attrLabels[id] ?? id);

  const doNextSample = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      await flushPending();
      if (sampleIdx < samples.length - 1) {
        setSampleIdx((i) => i + 1);
      } else {
        const stepIdx = stepsForFormat.indexOf(currentStep);
        if (stepIdx < stepsForFormat.length - 1) {
          await handleStepChange(stepsForFormat[stepIdx + 1], true);
        }
      }
      scrollCanvasToTop();
    } finally {
      setIsNavigating(false);
    }
  };

  // Guard: warn if the current sample's current phase has empty required fields
  // before advancing. The user can review (stay) or continue anyway.
  const handleNextSample = async () => {
    if (isNavigating || guard) return;
    // Only guard the cupping module — the beta Physical/Extrinsic tabs are out
    // of scope, so navigating samples there must not nag about cupping fields.
    const missing =
      activeTab === "cupping"
        ? stepMissing(viewSamples[sampleIdx], currentStep, guardFormat)
        : [];
    if (missing.length > 0) {
      setFlaggedSteps((prev) => {
        const next = new Set(prev);
        next.add(`${samples[sampleIdx].id}:${currentStep}`);
        return next;
      });
      setGuard({
        kind: "next",
        items: [{ sections: sectionLabels(missing) }],
      });
      return;
    }
    await doNextSample();
  };

  const handlePrev = async () => {
    await flushPending();
    if (sampleIdx > 0) {
      setSampleIdx((i) => i - 1);
    } else {
      const stepIdx = stepsForFormat.indexOf(currentStep);
      if (stepIdx > 0) {
        setCurrentStep(stepsForFormat[stepIdx - 1]);
        setSampleIdx(samples.length - 1);
      }
    }
    scrollCanvasToTop();
  };

  const doGoToResults = async (mode: "submit" | "finish" = "submit") => {
    // Final submit + results require connectivity. Offline, we keep the drafts
    // saved locally (they sync on reconnect) and surface a notice instead of
    // queuing an irreversible submit the user can't verify.
    if (!onlineRef.current) {
      await flushPending();
      setSubmitBlocked(true);
      return;
    }
    // A different user is signed in under this tab: never submit for them. The
    // banner notice (reload) is already showing; say so here too, so "Enviar"
    // never does nothing.
    if (isIdentityChanged()) {
      feedback.notifyError("identity_changed");
      return;
    }
    setIsGoingToResults(true);
    setSubmitError(false);
    try {
      // Submit flips isDraft=false on whatever the SERVER holds. If any edit is
      // still device-only (a save that failed under load, a pagehide flush),
      // submitting now would strand it: the later replay sees "already
      // submitted" and turns into a conflict the cupper may never resolve.
      // So: flush, replay the pending queue once, and refuse to submit while
      // anything is still local — the amber notice offers a retry.
      const flushed = await flushPending();
      if (flushed === "pending" || hasPending || (await countLocalPending()) > 0) {
        await retrySync();
        if ((await countLocalPending()) > 0) {
          setHasPending(true);
          setSubmitBlocked(true);
          setIsGoingToResults(false);
          return;
        }
        setHasPending(false);
      }
      setSubmitBlocked(false);
      if (mode === "finish") {
        // Solo "Terminar cata": submit the complete ones, drop the unopened,
        // close (lib/closeRules.ts planFinish; community.ts finishSoloSession).
        const r = await finishSoloSession(session.id, userId);
        if (!r.ok) {
          if (r.error === IDENTITY_CHANGED) {
            // Either latches (then say so) or is the claim case (page reloads).
            await onServerIdentityChanged(userId);
            if (isIdentityChanged()) feedback.notifyError(r.error);
          } else {
            feedback.notifyError(r.error);
          }
          setIsGoingToResults(false);
          return;
        }
      } else {
        const submitted = await submitAllEvaluations(session.id, userId);
        if (!submitted.ok) {
          if (submitted.error === IDENTITY_CHANGED) {
            await onServerIdentityChanged(userId);
            if (isIdentityChanged()) feedback.notifyError("identity_changed");
            setIsGoingToResults(false);
            return;
          }
          // Returned (not thrown) since S8-10: same failure path as before.
          setSubmitError(true);
          setIsGoingToResults(false);
          return;
        }
      }
      // Navigate only on success — a failed submit must not strand the user on
      // the results page believing their drafts were sent. isGoingToResults
      // stays true so the button remains disabled during navigation.
      router.push(`/${locale}/app/sessions/${session.id}/results`);
    } catch {
      setSubmitError(true);
      setIsGoingToResults(false);
    }
  };

  // Guard: submit is effectively irreversible, so scan every sample across every
  // phase and list the gaps before finalizing.
  const handleGoToResults = async () => {
    if (guard) return;
    const gaps = sessionMissing(viewSamples, stepsForFormat, guardFormat);
    if (gaps.length > 0) {
      // Flag every sample+step combo that has a gap so revisiting any of them
      // shows the inline indicator, not just the current one.
      setFlaggedSteps((prev) => {
        const next = new Set(prev);
        for (const sample of viewSamples) {
          for (const step of stepsForFormat) {
            if (stepMissing(sample, step, guardFormat).length > 0) {
              next.add(`${sample.id}:${step}`);
            }
          }
        }
        return next;
      });
      setGuard({
        kind: "submit",
        items: gaps.map((g) => ({
          sample: g.sampleLabel,
          sections: sectionLabels(g.sections),
        })),
      });
      return;
    }
    await doGoToResults();
  };

  const handleGuardConfirm = async () => {
    const kind = guard?.kind;
    setGuard(null);
    if (kind === "next") await doNextSample();
    else if (kind === "submit") await doGoToResults();
  };

  // ─── Invite link / close session ──────────────────────────────
  // Idempotent on the server: a second "Invitar" returns the SAME link.
  const handleGenerateInvite = async () => {
    setIsGeneratingInvite(true);
    try {
      await feedback.run(createInviteToken(session.id), ({ token }) => {
        setInviteLink(buildInviteUrl(window.location.origin, locale, token));
      });
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  // Revokes the current link and QR (they read as expired on /join).
  const handleRegenerateInvite = async () => {
    await feedback.run(createInviteToken(session.id, undefined, undefined, true), ({ token }) => {
      setInviteLink(buildInviteUrl(window.location.origin, locale, token));
      setIsCopied(false);
    });
  };

  const handleToggleEntries = async () => {
    setEntriesPending(true);
    try {
      await feedback.run(setEntriesLocked(session.id, !entriesLocked), (d) =>
        setEntriesLockedState(d.entriesLocked),
      );
    } finally {
      setEntriesPending(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCloseSession = () => {
    setCloseImpact(undefined);
    setCloseDialogOpen(true);
    getCloseImpact(session.id)
      .then((r) => setCloseImpact({ unsentCuppers: r.unsentCuppers }))
      .catch(() => setCloseImpact(null));
  };

  const handleConfirmClose = async () => {
    const r = await closeSession(session.id);
    // Non-blocking: the toast outlives the navigation below.
    if (!r.finalized && translations.closeNotFinalized) feedback.notifySuccess(translations.closeNotFinalized);
    router.push(`/${locale}/app/sessions/${session.id}/results`);
  };

  const startNow = () => {
    setMasterPlayer(null);
    setIsStarting(true);
    setStartError(false);
    startTransition(async () => {
      try {
        const r = await startSession(session.id);
        if (r.ok) setStartedAt(new Date().toISOString());
        if (r.groupNotice === "rate_limited" || r.groupNotice === "failed") setGroupNotice("failed");
        else if (r.groupNotice === "partial") setGroupNotice("partial");
      } catch {
        setStartError(true);
      } finally {
        setIsStarting(false);
      }
    });
  };
  const handleStart = () => {
    if (warmupRunning) {
      setConfirmStartOpen(true);
      return;
    }
    startNow();
  };

  // Optimistic: the select reflects the choice at once; a failed save toasts
  // the localized error (useActionFeedback) and rolls the value back.
  // A sequence counter guarantees a failed EARLIER request never rolls back a
  // later choice (pick B, pick C, B's save fails → C must stay).
  // References ACCUMULATE: picking a sample adds it as the next rank (and the
  // active one); the previous reference keeps its 79.00. Once one exists the
  // select is an action menu (value stays ""): a sample id adds, REMOVE_ACTIVE
  // drops only the active one. Adding on top of an existing reference asks
  // for confirmation first (the old one unlocks, the new one is pinned).
  const REMOVE_ACTIVE = "__remove_active__";
  // B1: the pin (and so every re-pin confirmation) exists only in anchor mode.
  const referencePins = shouldPinReference({
    mode: referenceMode,
    moduleKey: session.format === "descriptive" ? "descriptive" : session.format === "affective" ? "affective" : "combined",
    isActiveReference: true,
  });
  const commitReference = (next: string | null, confirmRepin = false) => {
    if (next && refOrderRef.current.includes(next)) return; // already one: server no-op
    if (!next && refOrderRef.current.length === 0) return;
    // A new reference that already has evaluations asks first (the server
    // refuses without confirmRepin anyway). Anchor mode only.
    if (referencePins && next && !confirmRepin && (evalCountBySample[next] ?? 0) > 0) {
      setRepinTarget(next);
      return;
    }
    // S8-27: dropping the active reference re-pins the earlier one; when
    // cuppers already rated it, ask first (the server refuses otherwise).
    // Anchor mode only.
    if (referencePins && !next && !confirmRepin) {
      const order = refOrderRef.current;
      const prevId = order.length > 1 ? order[order.length - 2] : null;
      const n = prevId ? (evalCountBySample[prevId] ?? 0) : 0;
      if (prevId && n > 0) {
        setRemoveRepin({ label: samplesRef.current.find((s) => s.id === prevId)?.label ?? "", n });
        return;
      }
    }
    const prevOrder = refOrderRef.current;
    const seq = ++referenceSeqRef.current;
    applyReferenceOrder(next);
    startTransition(async () => {
      const r = await feedback.run(setReferenceSample(session.id, next, confirmRepin));
      if (!r.ok && seq === referenceSeqRef.current) applyRefOrder(prevOrder);
    });
  };
  const handleReferenceChange = (value: string) => {
    if (value === "") return;
    if (value === REMOVE_ACTIVE) return commitReference(null);
    if (refOrderRef.current.length > 0 && !refOrderRef.current.includes(value)) {
      setPendingReference(value);
      return;
    }
    commitReference(value);
  };

  // ─── Derived state ────────────────────────────────────────────
  // The reference sample's quality is pinned at 5 and its cups cleared
  // (lib/referenceRules.ts). `viewSamples` is what the forms, the tabs and
  // the completeness guards see; the same pin is enforced server-side on
  // every save, so a stale client cannot move the anchor.
  const affectiveModuleKey: "affective" | "combined" | null =
    session.format === "affective" ? "affective" : session.format === "descriptive" ? null : "combined";
  // B1: pinned only for the active reference of an ANCHOR session; a "free"
  // reference is a normal, editable sample for the forms, the tabs and the guards.
  const isPinnedReference = (sampleId: string): boolean =>
    shouldPinReference({
      mode: referenceMode,
      moduleKey: affectiveModuleKey ?? "descriptive",
      isActiveReference: sampleId === referenceSampleId,
    });
  const pinForReference = (s: Sample): Sample =>
    isPinnedReference(s.id) && affectiveModuleKey
      ? {
          ...s,
          affective: pinReferenceAffective(s.affective, session.cupsPerSample),
          combined: pinReferenceAffective(s.combined, session.cupsPerSample),
        }
      : s;
  const viewSamples = samples.map(pinForReference);
  const current = viewSamples[sampleIdx];
  const isCurrentLocked = isPinnedReference(current.id);
  const referenceSample = referenceSampleId
    ? viewSamples.find((s) => s.id === referenceSampleId) ?? null
    : null;
  // The anchor must exist for everyone even when a cupper never touches the
  // reference (nothing to score in an affective session): the first visit
  // queues one pinned save so their 79.00 lands and Δ/community work. Only
  // refs and timers here (no state), and never on a closed session. Runs
  // even when an evaluation already exists (reference re-chosen mid-session,
  // CP-C2): the save is idempotent and the server pins it anyway.
  useEffect(() => {
    if (!referenceSampleId || !affectiveModuleKey) return;
    if (sessionStatus === "closed") return;
    const sample = samplesRef.current[sampleIdx];
    if (!sample || sample.id !== referenceSampleId) return;
    // B1: a "free" reference is scored like any sample: no pinned first-visit save.
    if (!isPinnedReference(sample.id)) return;
    if (ensuredReferenceRef.current.has(sample.id)) return;
    ensuredReferenceRef.current.add(sample.id);
    scheduleAutoSave(
      sample.id,
      affectiveModuleKey,
      pinReferenceAffective(sample[affectiveModuleKey], session.cupsPerSample),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceSampleId, sampleIdx, affectiveModuleKey, sessionStatus, referenceMode]);
  const currentRefIdx = refOrder.indexOf(current.id);
  const isCurrentReference = currentRefIdx !== -1;
  const referenceBadgeLabel = translations.referenceBadge ?? "Referencia";
  const multiRef = refOrder.length > 1;
  // "R1: A · R2: D (activa)" — only worth showing once there is something to tell apart.
  const labelOf = (id: string) => samples.find((s) => s.id === id)?.label ?? "";
  const referenceSummary = refOrder.length
    ? refOrder
        .map(
          (id, i) =>
            `R${i + 1}: ${labelOf(id)}${multiRef && i === refOrder.length - 1 ? ` (${translations.referenceActive ?? "activa"})` : ""}`,
        )
        .join(" · ")
    : undefined;
  const referenceOptions = refOrder.length
    ? [
        { value: "", label: translations.referenceAdd ?? "Añadir referencia…" },
        ...samples
          .filter((s) => !refOrder.includes(s.id))
          .map((s) => ({ value: s.id, label: s.label })),
        {
          value: REMOVE_ACTIVE,
          label: `${translations.referenceRemoveActive ?? "Quitar la referencia activa"} (R${refOrder.length})`,
        },
      ]
    : [
        { value: "", label: translations.referenceNone ?? "Sin referencia" },
        ...samples.map((s) => ({ value: s.id, label: s.label })),
      ];
  // Header line under the sample name: "· Referencia" on the reference itself,
  // "Compara con la referencia (C)" on every other sample (participants too).
  const referenceContext = isCurrentReference ? (
    <Badge tone="accent" size="xs">
      {multiRef ? `${referenceBadgeLabel} ${currentRefIdx + 1}` : referenceBadgeLabel}
    </Badge>
  ) : referenceSample && translations.compareHint ? (
    <span
      className="min-w-0 truncate font-sans text-[11px] text-brown-mid"
      title={translations.compareHint.replace("{label}", referenceSample.label)}
    >
      {translations.compareHint.replace("{label}", referenceSample.label)}
    </span>
  ) : null;

  // Live-recomputed on every render so a flag clears the instant the field is
  // filled in; only shown once flaggedSteps has "seen" this sample+step combo.
  const currentMissingIds = flaggedSteps.has(`${current.id}:${currentStep}`)
    ? stepMissing(current, currentStep, guardFormat)
    : [];

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    const result = await updateSampleMetadata(current.id, data);
    setSamples((prev) =>
      prev.map((s) =>
        s.id === current.id
          ? {
              ...s,
              label: data.label,
              // Only reflect the coffee edit locally when the server actually
              // applied it — a non-owned coffee's data was silently skipped.
              coffee: result.coffeeUpdated ? { ...data } : s.coffee,
              // A9: the prep fields saved with the same call.
              prep: prepFromForm(data),
            }
          : s
      )
    );
    setEditingSample(false);
    setCoffeeNotOwnedNotice(!result.coffeeUpdated);
  };

  // "Usar café existente" (S9-05): link a coffee the owner already has to a
  // coffee-less sample. assignSampleCoffee re-validates the id
  // (usableCoffeeWhere), refuses a sample that already has a coffee and
  // returns an ActionResult, so every refusal gets its own localized toast.
  const canPickCoffee =
    canPickExistingCoffee({
      isOwner,
      writable: sessionStatus !== "closed",
      sampleCoffeeId: current.coffeeId ?? null,
    }) && !!translations.coffeePicker;
  const openCoffeePicker = async () => {
    if (pickBusy.current) return;
    pickBusy.current = true;
    setPickPending(true);
    try {
      await feedback.run(listUsableCoffeesForPicker(), (list) => {
        setPickerCoffees(list);
        setPickingCoffee(true);
      });
    } finally {
      pickBusy.current = false;
      setPickPending(false);
    }
  };
  const handlePickCoffee = async (picked: UsableCoffee) => {
    if (pickBusy.current) return;
    pickBusy.current = true;
    setPickPending(true);
    setPickingCoffee(false);
    const sampleId = current.id;
    try {
      await feedback.run(assignSampleCoffee(sampleId, { coffeeId: picked.id }), () => {
        // Only the link is set locally. The coffee's fields arrive with the
        // server render: a hand-built copy here lacks fields the picker list
        // does not carry, and a later save of the editor would then blank
        // them on the owner's real coffee.
        setSamples((prev) => prev.map((s) => (s.id === sampleId ? { ...s, coffeeId: picked.id } : s)));
        setEditingSample(false);
        router.refresh();
      });
    } finally {
      pickBusy.current = false;
      setPickPending(false);
    }
  };

  const editSampleButton = isOwner ? (
    <button
      type="button"
      onClick={() => setEditingSample(true)}
      className="shrink-0 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-brown-mid hover:text-green-dark"
    >
      ✎ {translations.editSample}
    </button>
  ) : null;

  const isLastSampleInStep = sampleIdx >= samples.length - 1;
  const isLastStep =
    stepsForFormat.indexOf(currentStep) >= stepsForFormat.length - 1;
  const isLastSampleOverall = isLastSampleInStep && isLastStep;
  const prevDisabled = sampleIdx === 0 && currentStep === stepsForFormat[0];
  const sessionClosed = sessionStatus === "closed";
  const showStart = isOwner && isGroup && !sessionIsAsync && !startedAt;

  const hasStepFill = (sample: Sample, step: CuppingStep): boolean => {
    return STEP_ATTRIBUTES[step].some((attr) => {
      if (session.format === "affective") {
        const v = sample.affective[`${attr.affectiveId}_final`];
        return v !== null && v !== undefined;
      }
      if (session.format === "descriptive") {
        if (!attr.descriptiveId) return false;
        const v = sample.descriptive[`${attr.descriptiveId}_int`];
        return v !== null && v !== undefined;
      }
      const aff = sample.combined[`${attr.affectiveId}_final`];
      const desc = attr.descriptiveId
        ? sample.combined[`${attr.descriptiveId}_int`]
        : undefined;
      return (
        (aff !== null && aff !== undefined) ||
        (desc !== null && desc !== undefined)
      );
    });
  };

  // Solo only (F-express-1 / F-solo-3): what "send anyway" will do, stated
  // before the click, and a way to finish with the samples actually cupped.
  const isSoloOwner = !isGroup && isOwner;
  const unopenedCount = viewSamples.filter(
    (s) => !CUPPING_STEPS.some((st) => hasStepFill(s, st)),
  ).length;
  const scoredCount = viewSamples.filter((s) => {
    if (!s.isDraft && s.evaluationId) return true;
    const data =
      guardFormat === "combined" ? s.combined : guardFormat === "affective" ? s.affective : s.descriptive;
    return isEvaluationCompleteForScore(guardFormat, data);
  }).length;
  const guardOutcome =
    isSoloOwner && guard?.kind === "submit"
      ? unopenedCount === 0
        ? (translations.guard.outcomeCloses ?? null)
        : (translations.guard.outcomeStays?.replace("{n}", String(unopenedCount)) ?? null)
      : null;
  const guardSecondary =
    isSoloOwner && guard?.kind === "submit" && scoredCount > 0 && translations.guard.finishWith
      ? {
          label: translations.guard.finishWith.replace("{n}", String(scoredCount)),
          onClick: () => {
            setGuard(null);
            void doGoToResults("finish");
          },
        }
      : null;

  const getStepStatus = (
    step: CuppingStep
  ): "empty" | "partial" | "complete" => {
    const filled = samples.filter((s) => hasStepFill(s, step)).length;
    if (filled === 0) return "empty";
    if (filled === samples.length) return "complete";
    return "partial";
  };

  const stepStatuses = Object.fromEntries(
    stepsForFormat.map((s) => [s, getStepStatus(s)])
  ) as Record<string, "empty" | "partial" | "complete">;

  // ─── Module list ──────────────────────────────────────────────
  // Physical (green bean) and extrinsic (reveal) data are one row per SAMPLE,
  // authored by the session owner — the server actions are owner-gated, so
  // participants never get these tabs (they would only see a form whose saves
  // are rejected). Solo sessions: owner === user, nothing changes.
  const modules: ModuleItem[] = [
    {
      key: "cupping",
      label: translations.cuppingModule,
      icon: <Coffee size={16} />,
    },
    ...(isOwner
      ? ([
          {
            key: "physical",
            label: translations.physical,
            icon: <Scale size={16} />,
            badge: <BetaBadge />,
          },
          {
            key: "extrinsic",
            label: translations.extrinsic,
            icon: <FileText size={16} />,
            badge: <BetaBadge />,
          },
        ] as ModuleItem[])
      : []),
    {
      key: "results",
      label: translations.results,
      icon: <BarChart3 size={16} />,
      isAction: true,
      disabled: isGoingToResults,
    },
  ];

  const handleModuleSelect = async (key: string) => {
    if (key === "results") {
      // Submit always goes through the notes stage; from inside it, the tap
      // is the submit itself.
      if (notesStage) await handleGoToResults();
      else await openNotesStage();
      return;
    }
    if (key !== "cupping" && key !== "extrinsic" && key !== "physical") return;
    if (notesStage) await closeNotesStage();
    setActiveTab(key);
    scrollCanvasToTop();
  };

  // ─── Footer next-button labelling ─────────────────────────────
  const nextStep =
    isLastSampleInStep && !isLastStep
      ? stepsForFormat[stepsForFormat.indexOf(currentStep) + 1]
      : null;
  // Inline fallbacks for the notes-stage copy (pre-upgrade cached prop blobs).
  const expressNotesCopy = translations.expressNotes ?? (locale === "en"
    ? {
        title: "Quick notes",
        body: "One free-text impression per sample. Optional — you can submit without writing anything.",
        placeholder: "What did this cup leave you? Aromas, flavors, sensations…",
        optional: "Optional",
        open: "Quick notes →",
        back: "Back to cupping",
        submit: "Submit and see results",
      }
    : {
        title: "Notas rápidas",
        body: "Una impresión libre por muestra. Opcional: puedes enviar sin escribir nada.",
        placeholder: "¿Qué te dejó esta taza? Aromas, sabores, sensaciones…",
        optional: "Opcional",
        open: "Notas rápidas →",
        back: "Volver a la cata",
        submit: "Enviar y ver resultados",
      });

  const nextLabel = notesStage
    ? expressNotesCopy.submit
    : isLastSampleOverall
    ? expressNotesCopy.open
    : nextStep
    ? `${translations.nextPhase} → ${translations.phaseLabels[nextStep]}`
    : translations.nextSample;

  const nextVariant: "next-sample" | "next-phase" | "view-results" =
    notesStage
      ? "view-results"
      : isLastSampleOverall
      ? "next-phase"
      : isLastSampleInStep && !isLastStep
      ? "next-phase"
      : "next-sample";

  // ─── Sidebar slot content ─────────────────────────────────────
  // Owner only (S10 WP4a, Kim C5): "3 de 5 enviados" is group information. The
  // page sends participants an empty line and a zero count; this also refuses
  // to render anything for them, so the line can never reach a participant.
  const ownerSubmittedText = !isOwner
    ? ""
    : translations.submittedTemplate
    ? translations.submittedTemplate
        .replace("{count}", String(submittedCount))
        .replace("{total}", String(submittedTotal))
    : translations.submittedOf;
  const identity = (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
        {translations.formatLabel}
        {isGroup ? ` · ${isOwner ? translations.masterRole : translations.participantRole}` : ""}
      </div>
      <div className="font-display text-xl leading-tight text-green-dark truncate">
        {session.name}
      </div>
      {isGroup && isOwner && (
        <div className="font-mono text-[11px] text-brown-mid mt-0.5">
          {ownerSubmittedText}
        </div>
      )}
      {referenceSample && (
        <div className="font-mono text-[11px] text-brown-mid mt-0.5 truncate">
          {multiRef ? referenceSummary : `${referenceBadgeLabel}: ${referenceSample.label}`}
        </div>
      )}
    </>
  );

  const sampleTabsBar = (
    <SampleTabs
      orientation="horizontal"
      header={translations.samplesHeader}
      samples={viewSamples.map((s) => ({
        id: s.id,
        label: s.label,
        filled: hasStepFill(s, currentStep),
        reference: refOrder.includes(s.id),
        referenceTag: multiRef ? `R${refOrder.indexOf(s.id) + 1}` : undefined,
      }))}
      referenceLabel={referenceBadgeLabel}
      activeIndex={sampleIdx}
      onSelect={handleSampleSelect}
    />
  );

  // Tablet (sm..lg): horizontal sample bar + position counter, under the
  // phases. On phones (<sm) the same tabs live in the hamburger row instead
  // (`phoneBar` below) so the chrome above the form stays ≤110px (CP-C1).
  const mobileSampleBar = (
    <div className="hidden sm:block lg:hidden border-t border-brown-light bg-bg">
      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="min-w-0 flex-1">{sampleTabsBar}</div>
        <span className="shrink-0 font-mono text-[10px] text-brown-mid tabular-nums">
          {sampleIdx + 1}/{samples.length}
        </span>
        {editSampleButton}
      </div>
      {referenceContext && (
        <div className="flex items-center px-4 pb-1.5">{referenceContext}</div>
      )}
    </div>
  );

  // Phone (<sm): sample tabs + counter share the hamburger row. Everything
  // that used to need its own line (session name, role, reference context,
  // edit button) sits behind the chevron (`phoneDetails`).
  const phoneBar = (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <SampleTabs
          orientation="horizontal"
          header={translations.samplesHeader}
          hideHeader
          samples={viewSamples.map((s) => ({
            id: s.id,
            label: s.label,
            filled: hasStepFill(s, currentStep),
            reference: refOrder.includes(s.id),
            referenceTag: multiRef ? `R${refOrder.indexOf(s.id) + 1}` : undefined,
          }))}
          referenceLabel={referenceBadgeLabel}
          activeIndex={sampleIdx}
          onSelect={handleSampleSelect}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] text-brown-mid tabular-nums">
        {sampleIdx + 1}/{samples.length}
      </span>
    </div>
  );
  const phoneDetails = (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
        {translations.formatLabel}
        {isGroup ? ` · ${isOwner ? translations.masterRole : translations.participantRole}` : ""}
      </div>
      <div className="font-display text-lg leading-tight text-green-dark truncate">
        {session.name}
      </div>
      {activeTab !== "cupping" && (
        <div className="font-sans text-sm text-brown-dark">
          {activeTab === "physical" ? translations.physical : translations.extrinsic}
          {" · "}
          {translations.sample} {current.label}
        </div>
      )}
      {isGroup && isOwner && (
        <div className="font-mono text-[11px] text-brown-mid">{ownerSubmittedText}</div>
      )}
      {referenceContext && <div className="flex items-center">{referenceContext}</div>}
      {editSampleButton && <div className="flex items-center pt-1">{editSampleButton}</div>}
    </>
  );

  const secondaryNav = (
    <ModuleSwitcher
      header={translations.evaluationHeader}
      modules={modules}
      activeKey={activeTab}
      onSelect={handleModuleSelect}
    />
  );

  const ownerControls =
    isOwner && isGroup ? (
      <MasterControls
        title={translations.masterControls}
        submittedLabel={
          translations.submittedTemplate
            ? translations.submittedTemplate
                .replace("{count}", String(submittedCount))
                .replace("{total}", String(submittedTotal))
            : `${submittedCount} / ${submittedTotal}`
        }
        liveDownLabel={liveCountDown ? translations.liveCountDown : undefined}
        closeLabel={translations.closeSession}
        inviteLabel={translations.invite}
        generatingLabel={translations.generating}
        copyLabel={translations.copy}
        copiedLabel={translations.copied}
        qrCopyImageLabel={translations.copyImage}
        qrDownloadLabel={translations.downloadQr}
        sessionClosed={sessionClosed}
        inviteLink={inviteLink}
        isGenerating={isGeneratingInvite}
        isCopied={isCopied}
        onClose={handleCloseSession}
        onGenerate={handleGenerateInvite}
        onCopy={handleCopyInvite}
        onResetInvite={() => setInviteLink(null)}
        regenerateLabel={translations.inviteRegenerate}
        onRegenerate={translations.inviteRegenerate ? () => setRegenerateOpen(true) : undefined}
        entries={
          translations.entriesClose && translations.entriesOpen && translations.entriesClosedNote
            ? {
                locked: entriesLocked,
                closeLabel: translations.entriesClose,
                openLabel: translations.entriesOpen,
                note: translations.entriesClosedNote,
                pending: entriesPending,
                onToggle: handleToggleEntries,
              }
            : undefined
        }
        startLabel={translations.startSession}
        startingLabel={translations.starting}
        showStart={showStart}
        isStarting={isStarting}
        onStart={handleStart}
        referenceLabel={translations.referenceSelect ?? "Muestra de referencia"}
        referenceOptions={referenceOptions}
        referenceValue=""
        onReferenceChange={handleReferenceChange}
        referenceSummary={referenceSummary}
        referenceHint={refOrder.length ? translations.referenceAddHint : undefined}
        warmup={
          warmup && warmupExercise
            ? {
                exerciseLabel: `${lw(warmupExercise.name, locale)} · ${warmup.master.minutes.replace("{min}", String(warmupExercise.durationMin))}`,
                startLabel: warmup.master.startLabel,
                stopLabel: warmup.master.stopLabel,
                reopenLabel: warmup.master.reopenLabel,
                runningLabel: warmup.master.runningLabel,
                timeLeft: warmupTimeLeft ? warmup.master.timeLeft.replace("{time}", warmupTimeLeft) : null,
                running: warmupRunning,
                pending: warmupPending,
                onStart: handleWarmupStart,
                onStop: handleWarmupStop,
                onReopen: handleWarmupReopen,
              }
            : undefined
        }
      />
    ) : undefined;

  const exitLink = (
    <button
      type="button"
      onClick={() => router.push(`/${locale}/app/sessions`)}
      className="inline-flex items-center gap-2 font-sans text-sm text-brown-mid hover:text-green-dark transition-colors focus-visible:outline-2 focus-visible:outline-green-dark focus-visible:outline-offset-2 rounded-sm"
    >
      <span aria-hidden>←</span> {translations.exitToSessions}
    </button>
  );

  // S10 WP7 (Kim F1): the discreet warm-up entry lives under the exit link.
  const exitSlot = warmup ? (
    <div className="flex flex-col items-start">
      {exitLink}
      <WarmupEntry
        exerciseId={warmup.exerciseId}
        closed={sessionStatus === "closed"}
        overlayOpen={warmupOverlayOpen}
        isOwner={isOwner}
        isGroup={isGroup}
        isAsync={sessionIsAsync}
        startedAt={!!startedAt}
        locale={locale}
        label={warmup.entryLabel}
        strings={warmup.strings}
      />
    </div>
  ) : (
    exitLink
  );

  // ─── Top bar content ──────────────────────────────────────────
  const phaseStepper = (
    <PhaseStepper
      phases={stepsForFormat}
      currentPhase={currentStep}
      phaseStatuses={stepStatuses}
      labels={translations.phaseLabels}
      onSelect={handleStepChange}
      variant="light"
      compact
    />
  );

  // Notes stage: no stepper, no sample tabs — one compact title line (the
  // samples are all on screen). Desktop keeps the clock column for continuity.
  const notesTopBar = (
    <div className="flex items-center gap-3 px-4 py-2 sm:px-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
        {expressNotesCopy.title}
      </span>
      <span className="text-brown-light">·</span>
      <span className="font-display text-base text-brown-dark truncate">
        {session.name}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-brown-mid tabular-nums">
        {samples.length} {translations.samplesHeader.toLowerCase()}
      </span>
    </div>
  );

  const topBar = notesStage ? (
    notesTopBar
  ) : activeTab === "cupping" ? (
      <>
        {/* Desktop: phases + samples (left) / session info (right) */}
        <div className="hidden lg:grid grid-cols-[1fr_auto] items-start gap-x-8 px-6 py-2">
          <div className="min-w-0 space-y-1.5">
            <PhaseStepper
              phases={stepsForFormat}
              currentPhase={currentStep}
              phaseStatuses={stepStatuses}
              labels={translations.phaseLabels}
              onSelect={handleStepChange}
              variant="light"
              align="start"
            />
            <div className="border-t border-brown-light pt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">{sampleTabsBar}</div>
              {referenceContext}
              {editSampleButton}
            </div>
          </div>
          <div className="flex flex-col items-end justify-center gap-0.5 text-right shrink-0 pt-0.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-brown-mid">
              {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(session.date))}
            </span>
            <span className="font-mono text-xl font-semibold tabular-nums text-green-dark leading-none">
              {clockTime}
            </span>
            {isGroup && (
              <span className="font-mono text-[11px] text-brown-mid mt-0.5">
                {participantCount} {participantCount === 1 ? "participante" : "participantes"}
              </span>
            )}
            {userCountry && (
              <span className="font-mono text-[11px] text-brown-mid">
                {userCountry}
              </span>
            )}
          </div>
        </div>
        {/* Mobile/tablet: phase stepper + sample bar */}
        <div className="lg:hidden">{phaseStepper}</div>
        {mobileSampleBar}
      </>
    ) : (
      <>
        {/* Desktop: horizontal sample tabs */}
        <div className="hidden lg:block px-6 py-1.5 border-b border-brown-light">
          {sampleTabsBar}
        </div>
        {/* Tablet: horizontal sample bar (phones: hamburger row) */}
        {mobileSampleBar}
        <div className="hidden sm:flex items-center gap-3 px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
            {activeTab === "physical"
              ? translations.physical
              : translations.extrinsic}
          </span>
          <BetaBadge />
          <span className="text-brown-light">·</span>
          <span className="font-display text-base text-brown-dark">
            {translations.sample} {current.label}
          </span>
          {referenceContext}
          <div className="flex-1" />
          {editSampleButton}
        </div>
      </>
    );

  // ─── Footer ───────────────────────────────────────────────────
  const footer = (
    <CanvasFooter
      onPrev={notesStage ? closeNotesStage : handlePrev}
      onNext={
        notesStage
          ? handleGoToResults
          : isLastSampleOverall
          ? openNotesStage
          : handleNextSample
      }
      prevLabel={notesStage ? expressNotesCopy.back : translations.prev}
      nextLabel={
        isNavigating || isGoingToResults ? translations.submitting : nextLabel
      }
      prevDisabled={(!notesStage && prevDisabled) || isNavigating}
      nextDisabled={isNavigating || isGoingToResults}
      nextVariant={nextVariant}
    />
  );

  // ─── Render ───────────────────────────────────────────────────
  // The session-moment overlay is a SIBLING of SessionShell (never inside
  // its top bar): it stacks above the shell, is skippable, and renders
  // static content so it works offline.
  return (
    <>
    <SessionShell
      identity={identity}
      secondaryNav={secondaryNav}
      ownerControls={ownerControls}
      exitLink={exitSlot}
      topBar={topBar}
      footer={footer}
      mobileTitle={notesStage ? expressNotesCopy.title : session.name}
      mobileBar={notesStage ? undefined : phoneBar}
      mobileDetails={phoneDetails}
      mobileDetailsLabel={translations.sessionDetails}
      collapsed={keyboardOpen}
      saveStatus={saveStatus}
      savePendingLabel={translations.savedLocally}
    >
      <OfflineBanner
        online={online}
        syncPhase={syncPhase}
        onRetry={retrySync}
        translations={translations.offline}
        storageUnavailable={storageUnavailable}
        nextRetryAt={nextRetryAt}
        renderedUserId={userId}
      />
      {translations.offline.bannerNewVersion && translations.offline.reloadNow && (
        <StaleBundleNotice
          slot="cup"
          message={translations.offline.bannerNewVersion}
          reloadLabel={translations.offline.reloadNow}
        />
      )}
      {terminalCount > 0 && translations.offline.terminalNotice && (
        <div
          role="status"
          className="mx-4 mb-3 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6"
        >
          {translations.offline.terminalNotice.replace("{count}", String(terminalCount))}
        </div>
      )}
      {session.closesAt && !sessionClosed && (
        <div className="mx-4 mt-3 lg:mx-6">
          <DeadlineBanner
            closesAt={session.closesAt}
            zone={session.closesAtZone ?? null}
            locale={locale}
            translations={translations.deadline}
          />
        </div>
      )}
      {/* A4: the letters are drawn at random, so the owner (only) gets a
          collapsed letter -> coffee key. Participants never receive coffee
          names (cup/page.tsx ships `coffee` to the owner only). */}
      {isOwner && translations.sampleKey && !notesStage && (
        <div className="mx-4 mt-3 lg:mx-6">
          <SampleKey
            rows={viewSamples.map((s) => ({
              id: s.id,
              label: s.label,
              coffee: s.coffee?.name?.trim() || null,
            }))}
            translations={translations.sampleKey}
          />
        </div>
      )}
      {isOwner && editingSample && (
        <ResponsiveDialog
          open={editingSample}
          onOpenChange={setEditingSample}
          title={`${translations.editSample}: ${current.label}`}
          closeLabel={translations.cancel}
        >
          {/* Solo sessions have no master panel — the reference select lives
              here instead. Group owners use MasterControls. */}
          {!isGroup && !sessionClosed && (
            <label className="mb-4 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
                {translations.referenceSelect ?? "Muestra de referencia"}
              </span>
              {referenceSummary && (
                <span className="mb-1 block font-sans text-xs text-on-surface-variant">
                  {referenceSummary}
                </span>
              )}
              <Select
                value=""
                onChange={handleReferenceChange}
                options={referenceOptions}
                ariaLabel={translations.referenceSelect ?? "Muestra de referencia"}
              />
            </label>
          )}
          {canPickCoffee && translations.coffeePicker && (
            <div className="mb-4">
              <button
                type="button"
                disabled={pickPending}
                onClick={openCoffeePicker}
                className="inline-flex min-h-[44px] items-center rounded-pill border border-outline-variant px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {translations.coffeePicker.useExisting}
              </button>
            </div>
          )}
          <EditSampleMetadataForm
            initialData={{
              label: current.label,
              name: current.coffee?.name ?? "",
              country: current.coffee?.country ?? "",
              region: current.coffee?.region ?? "",
              farm: current.coffee?.farm ?? "",
              producer: current.coffee?.producer ?? "",
              variety: current.coffee?.variety ?? "",
              processType: current.coffee?.processType ?? "",
              altitude: current.coffee?.altitude ?? "",
              roastLevel: current.coffee?.roastLevel ?? "",
              ...prepToForm(current.prep),
            }}
            onSubmit={handleSaveSampleMetadata}
            onCancel={() => setEditingSample(false)}
            translations={{
              prep: translations.samplePrep,
              label: translations.sample,
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
      {canPickCoffee && translations.coffeePicker && (
        <CoffeePicker
          open={pickingCoffee}
          onOpenChange={setPickingCoffee}
          coffees={pickerCoffees}
          onSelect={handlePickCoffee}
          translations={translations.coffeePicker}
        />
      )}
      {coffeeNotOwnedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-card border border-secondary/30 bg-secondary-container/20 font-sans text-sm text-on-surface"
        >
          <span className="flex-1">{translations.editSampleNotOwner}</span>
          <button
            type="button"
            onClick={() => setCoffeeNotOwnedNotice(false)}
            aria-label={translations.cancel}
            className="shrink-0 font-semibold hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      )}
      {submitBlocked && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-md border border-amber-warm/40 bg-amber-warm/10 font-sans text-sm text-amber-warm"
        >
          <span className="flex-1">
            {online
              ? (translations.offline.submitBlockedPending ??
                translations.offline.submitBlocked)
              : translations.offline.submitBlocked}
          </span>
          {online && (
            <button
              type="button"
              onClick={() => {
                setSubmitBlocked(false);
                void handleGoToResults();
              }}
              className="shrink-0 font-semibold underline hover:opacity-80"
            >
              {translations.offline.retryBeforeSubmit ?? translations.retrySubmit}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubmitBlocked(false)}
            aria-label="×"
            className="shrink-0 font-semibold hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-md border border-red-defect/40 bg-red-defect/10 font-sans text-sm text-red-defect"
        >
          <span className="flex-1">{translations.submitFailed}</span>
          <button
            type="button"
            onClick={() => void handleGoToResults()}
            className="shrink-0 font-semibold underline hover:opacity-80"
          >
            {translations.retrySubmit}
          </button>
          <button
            type="button"
            onClick={() => setSubmitError(false)}
            aria-label="×"
            className="shrink-0 font-semibold hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
      {groupNotice && (
        <div
          role="status"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-card bg-secondary-container text-on-secondary-container font-sans text-sm"
        >
          <span className="flex-1">
            {groupNotice === "partial"
              ? translations.startGroupNoticePartial
              : translations.startGroupNoticeFailed}
          </span>
          <button
            type="button"
            onClick={() => setGroupNotice(null)}
            aria-label="×"
            className="shrink-0 font-semibold hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
      {startError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-md border border-red-defect/40 bg-red-defect/10 font-sans text-sm text-red-defect"
        >
          <span className="flex-1">{translations.startSessionError}</span>
          <button
            type="button"
            onClick={() => setStartError(false)}
            aria-label="×"
            className="shrink-0 font-semibold hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
      <ConfirmDialog
        open={pendingReference !== null}
        onOpenChange={(o) => {
          if (!o) setPendingReference(null);
        }}
        title={translations.referenceAddTitle ?? "Añadir referencia"}
        body={
          translations.referenceAddHint ??
          "La referencia anterior conserva sus 79.00; la nueva queda fijada."
        }
        confirmLabel={translations.referenceAddConfirm ?? "Añadir referencia"}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        destructive={false}
        onConfirm={() => {
          const id = pendingReference;
          setPendingReference(null);
          if (id) commitReference(id);
        }}
      />
      <ConfirmDialog
        open={repinTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRepinTarget(null);
        }}
        title={translations.referenceRepinTitle ?? "¿Fijar esta muestra como referencia?"}
        body={(
          translations.referenceRepinBody ??
          "{n} catadores ya evaluaron esta muestra. Al marcarla como referencia, sus notas de calidad se reemplazan por el ancla de 79.00. No se puede deshacer."
        ).replace("{n}", String(repinTarget ? (evalCountBySample[repinTarget] ?? 0) : 0))}
        confirmLabel={translations.referenceAddConfirm ?? "Añadir referencia"}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        onConfirm={() => {
          const id = repinTarget;
          setRepinTarget(null);
          if (id) commitReference(id, true);
        }}
      />
      <ConfirmDialog
        open={removeRepin !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveRepin(null);
        }}
        title={translations.referenceRemoveRepinTitle ?? "¿Quitar la referencia activa?"}
        body={(
          translations.referenceRemoveRepinBody ??
          "Al quitarla, {label} vuelve a ser la referencia y {n} catadores verán sus notas de calidad reemplazadas por el ancla de 79.00. No se puede deshacer."
        )
          .replace("{label}", removeRepin?.label ?? "")
          .replace("{n}", String(removeRepin?.n ?? 0))}
        confirmLabel={translations.referenceRemoveRepinConfirm ?? "Quitar referencia"}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        onConfirm={() => {
          setRemoveRepin(null);
          commitReference(null, true);
        }}
      />
      <ConfirmDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title={translations.inviteRegenerateTitle ?? "¿Regenerar el enlace?"}
        body={
          translations.inviteRegenerateBody ??
          "El enlace y el QR actuales dejarán de funcionar. Quienes ya entraron siguen dentro."
        }
        confirmLabel={translations.inviteRegenerateConfirm ?? "Regenerar"}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        destructive={false}
        onConfirm={handleRegenerateInvite}
      />
      <ConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title={translations.closeSession}
        body={
          <div className="space-y-2">
            <p>{translations.confirmClose}</p>
            <p>{translations.closeRule}</p>
            {closeImpact === undefined ? (
              <p className="text-on-surface-variant">{translations.closeImpactLoading}</p>
            ) : closeImpact === null ? null : closeImpact.unsentCuppers === 0 ? (
              <p className="text-on-surface-variant">{translations.closeUnsentNone}</p>
            ) : (
              <p className="font-medium text-secondary">
                {closeImpact.unsentCuppers === 1
                  ? translations.closeUnsentOne
                  : translations.closeUnsentMany.replace("{count}", String(closeImpact.unsentCuppers))}
              </p>
            )}
          </div>
        }
        confirmLabel={translations.closeSession}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        onConfirm={handleConfirmClose}
        error={translations.closeSessionError}
      />
      <SyncConflictModal
        conflicts={conflicts}
        onResolve={resolveConflict}
        translations={{
          conflictTitle: translations.offline.conflictTitle,
          conflictBody: translations.offline.conflictBody,
          conflictKeep: translations.offline.conflictKeep,
          conflictReplace: translations.offline.conflictReplace,
        }}
      />
      <EvaluationGuardModal
        open={leaveGuardOpen}
        title={leaveGuardCopy.title}
        body={leaveGuardCopy.body}
        items={[]}
        onCancel={() => setLeaveGuardOpen(false)}
        onConfirm={() => void handleLeaveConfirm()}
        translations={{
          review: leaveGuardCopy.stay,
          confirm: leaveGuardCopy.leave,
        }}
      />
      <EvaluationGuardModal
        open={guard !== null}
        title={
          guard?.kind === "submit"
            ? translations.guard.submitTitle
            : translations.guard.nextTitle
        }
        body={
          guard?.kind === "submit"
            ? translations.guard.submitBody
            : translations.guard.nextBody
        }
        items={guard?.items ?? []}
        outcome={guardOutcome}
        secondary={guardSecondary}
        onCancel={() => setGuard(null)}
        onConfirm={handleGuardConfirm}
        translations={{
          review: translations.guard.review,
          confirm:
            guard?.kind === "submit"
              ? translations.guard.submitAnyway
              : translations.guard.continueAnyway,
        }}
      />
      {notesStage && (
        <ExpressNotesStep
          samples={viewSamples.map((s) => ({
            id: s.id,
            label: s.label,
            isReference: s.id === referenceSampleId,
          }))}
          values={Object.fromEntries(
            samples.map((s) => {
              const v = s[notesModuleKey][EXPRESS_NOTE_KEY];
              return [s.id, typeof v === "string" ? v : ""];
            }),
          )}
          onChange={setSampleNote}
          maxLength={EXPRESS_NOTE_MAX}
          translations={{
            title: expressNotesCopy.title,
            body: expressNotesCopy.body,
            placeholder: expressNotesCopy.placeholder,
            optional: expressNotesCopy.optional,
            referenceBadge: referenceBadgeLabel,
          }}
        />
      )}
      {!notesStage && (
      <div key={`${activeTab}-${currentStep}-${current.id}`}>
        {activeTab === "cupping" && session.format === "descriptive" && (
          <DescriptiveForm
            sampleData={current.descriptive}
            onChange={(d) => setCurrentData("descriptive", d)}
            currentStep={currentStep}
            locale={locale === "en" ? "en" : "es"}
            missingIds={currentMissingIds}
          />
        )}
        {activeTab === "cupping" && session.format === "affective" && (
          <AffectiveForm
            sampleData={current.affective}
            onChange={(d) => setCurrentData("affective", d)}
            cupsPerSample={session.cupsPerSample}
            currentStep={currentStep}
            missingIds={currentMissingIds}
            lockedAffective={isCurrentLocked}
            lockedNote={translations.referenceLockedAffective}
            lockedCupsNote={translations.referenceCupsLocked}
            isGroup={isGroup}
          />
        )}
        {activeTab === "cupping" &&
          (session.format === "combined" ||
            !["descriptive", "affective"].includes(session.format)) && (
            <CombinedForm
              sampleData={current.combined}
              onChange={(d) => setCurrentData("combined", d)}
              cupsPerSample={session.cupsPerSample}
              currentStep={currentStep}
              locale={locale === "en" ? "en" : "es"}
              missingIds={currentMissingIds}
              lockedAffective={isCurrentLocked}
              lockedNote={translations.referenceLocked}
              lockedCupsNote={translations.referenceCupsLocked}
              isGroup={isGroup}
            />
          )}
        {activeTab === "extrinsic" && (
          <ExtrinsicForm
            sampleData={current.extrinsic}
            onChange={(d) => setCurrentData("extrinsic", d)}
          />
        )}
        {activeTab === "physical" && (
          <PhysicalEvalForm
            sampleData={current.physical}
            onChange={(d) => setCurrentData("physical", d)}
          />
        )}
      </div>
      )}

      <DevRoleBadge email={userEmail} />
    </SessionShell>
    {warmup && warmupExercise && masterPlayer && (
      <SessionMomentOverlay open label={lw(warmupExercise.name, locale)}>
        <WarmupPlayer
          exercise={warmupExercise}
          locale={locale}
          t={warmup.strings}
          mode="synced"
          seekToMs={masterPlayer.seekMs}
          soundDefault
          resyncPositionMs={warmupResyncMs}
          onFinish={() => setMasterPlayer(null)}
          onExit={() => setMasterPlayer(null)}
        />
      </SessionMomentOverlay>
    )}
    {warmup && (
      <ConfirmDialog
        open={confirmStartOpen}
        onOpenChange={setConfirmStartOpen}
        title={warmup.master.confirmTitle}
        body={warmup.master.confirmBody.replace("{time}", warmupTimeLeft ?? "0:00")}
        confirmLabel={warmup.master.confirmYes}
        cancelLabel={translations.cancel}
        closeLabel={translations.cancel}
        destructive={false}
        onConfirm={() => {
          setConfirmStartOpen(false);
          startNow();
        }}
      />
    )}
    {warmup && (
      <WarmupMoment
        sessionId={session.id}
        userId={userId}
        locale={locale}
        exerciseId={warmup.exerciseId}
        hasOwnEvaluation={warmup.hasOwnEvaluation}
        isOwner={isOwner}
        isGroup={isGroup}
        isAsync={sessionIsAsync}
        startedAt={!!startedAt}
        enabled={sessionStatus !== "closed"}
        strings={warmup.strings}
        onOpenChange={setWarmupOverlayOpen}
      />
    )}
    </>
  );
}

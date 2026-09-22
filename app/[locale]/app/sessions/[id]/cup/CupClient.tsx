"use client";

import {
  useState,
  useRef,
  useTransition,
  useEffect,
  useSyncExternalStore,
} from "react";
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
} from "@/app/actions/sessions";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  submitAllEvaluations,
  closeSession,
  createInviteToken,
  startSession,
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
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
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
};

type CuppingTab = "cupping" | "extrinsic" | "physical";

export function CupClient({
  locale,
  initialSampleId,
  session,
  isOwner,
  isGroup,
  sessionStatus,
  sessionStartedAt,
  sessionIsAsync,
  participantCount,
  submittedCount: initialSubmittedCount,
  translations,
  userEmail,
  userCountry,
  userId,
}: {
  locale: string;
  initialSampleId?: string;
  session: Session;
  isOwner: boolean;
  isGroup: boolean;
  sessionStatus: string;
  sessionStartedAt: string | null;
  sessionIsAsync: boolean;
  participantCount: number;
  submittedCount: number;
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
    closeSession: string;
    confirmClose: string;
    liveCountDown: string;
    closeSessionError: string;
    startSession: string;
    starting: string;
    startSessionError: string;
    masterRole: string;
    participantRole: string;
    // Shell (Phase 3)
    samplesHeader: string;
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
      conflictTitle: string;
      conflictBody: string;
      conflictKeep: string;
      conflictReplace: string;
      bannerStorageUnavailable: string;
    };
    // Reference sample (2026-09). Optional: pre-upgrade offline blobs.
    referenceBadge?: string;
    compareHint?: string;
    referenceSelect?: string;
    referenceNone?: string;
  };
  userEmail?: string;
  userCountry?: string;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
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

  const initialSampleIdx = initialSampleId
    ? Math.max(0, session.samples.findIndex((s) => s.id === initialSampleId))
    : 0;
  const [sampleIdx, setSampleIdx] = useState(initialSampleIdx);
  const [currentStep, setCurrentStep] = useState<CuppingStep>(stepsForFormat[0]);
  const [samples, setSamples] = useState(session.samples);
  const [activeTab, setActiveTab] = useState<CuppingTab>("cupping");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "pending"
  >("idle");
  // Whether ANY module save is currently sitting only in local (IndexedDB)
  // storage — flips true on a "pending" flush result, false once a flush
  // reports "synced" or the reconnect replay (useOfflineSync) finishes.
  // Drives the leave-guard's alternate copy (see leaveGuardCopy below).
  const [hasPending, setHasPending] = useState(false);
  // Realtime channel for the group submitted-count is not SUBSCRIBED — the
  // count shown in the master panel may be stale (F10).
  const [liveCountDown, setLiveCountDown] = useState(false);
  const [editingSample, setEditingSample] = useState(false);
  // Set after a metadata save when the linked coffee belongs to someone else
  // — the label still saved, but the coffee record itself was skipped.
  const [coffeeNotOwnedNotice, setCoffeeNotOwnedNotice] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
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
  const [startedAt, setStartedAt] = useState(sessionStartedAt);
  // Owner-chosen "Referencia" sample; updated live for participants through
  // the cupping_sessions realtime stream below.
  const [referenceSampleId, setReferenceSampleId] = useState<string | null>(
    session.referenceSampleId ?? null,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
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
  const { online } = useConnectivity();
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  const { syncPhase, conflicts, resolveConflict, retrySync } = useOfflineSync({
    userId,
    online,
  });
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  // IndexedDB has proven unreliable (quota, Safari private mode, …) — the
  // OfflineBanner surfaces this so the cupper knows local drafts aren't safe.
  const storageUnavailable = useSyncExternalStore(
    onOfflineStorageUnavailable,
    isOfflineStorageUnavailable,
    () => false
  );

  // A completed reconnect replay clears the "pending" save state even when no
  // further edit triggers a new flush (e.g. the cupper just waited it out).
  useEffect(() => {
    // Mirrors an external hook state (useOfflineSync) into local UI state —
    // same sanctioned pattern as cup/error.tsx; a single flip, no cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (syncPhase === "synced") setHasPending(false);
  }, [syncPhase]);

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
                if (!mod || mod.syncStatus !== "pending" || !isModuleKey(mk))
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

  // ─── Realtime subscription for group sessions ─────────────────
  useEffect(() => {
    if (!isGroup || !online) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const sampleIds = new Set(session.samples.map((s) => s.id));

    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
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
          if (isDraft === false && sampleId && sampleIds.has(sampleId)) {
            setSubmittedCount((prev) => prev + 1);
          }
        }
      )
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
            setReferenceSampleId(next && sampleIds.has(next) ? next : null);
          }
        }
      )
      // Without a status callback a dropped channel is indistinguishable from
      // "nobody has submitted yet" — the count just stops moving. Surface it
      // so the maestro knows the number is stale rather than flat (F10).
      .subscribe((status) => {
        setLiveCountDown(status !== "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGroup, online, session.id, session.samples]);

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

    try {
      if (key === "descriptive" || key === "affective" || key === "combined") {
        await upsertEvaluation({
          sessionSampleId: sampleId,
          sessionId: session.id,
          moduleKey: key,
          data,
          cupsPerSample: session.cupsPerSample,
        });
      } else if (key === "extrinsic") {
        await upsertExtrinsic({ sessionSampleId: sampleId, data });
      } else if (key === "physical") {
        await upsertPhysical({ sessionSampleId: sampleId, data });
      }
      // Server write landed — clear any local pending flag for this module.
      await setModuleStatus(session.id, userId, sampleId, mk, "synced");
      return "synced";
    } catch {
      // Network/server failure → fall back to a durable local pending write so
      // the edit survives and is replayed on the next reconnect.
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
      return "pending";
    }
  };

  const flushPending = async () => {
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
      await flushSave(pending.sampleId, pending.key, pending.data);
    }
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
  const flushPendingRef = useRef<() => Promise<void>>(async () => {});
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
        if (result === "pending") {
          setHasPending(true);
          // Stays "pending" until a later flush syncs, or the reconnect
          // replay (useOfflineSync) reports syncPhase === "synced" — never
          // auto-cleared on a timer the way "saved" is, since the data has
          // NOT reached the server yet.
          setSaveStatus("pending");
        } else {
          setHasPending(false);
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
    pendingSaveRef.current = { sampleId, key, data };
    debounceRef.current = setTimeout(() => {
      persist(sampleId, key, data);
      pendingSaveRef.current = null;
    }, 800);
  };

  const setCurrentData = (key: keyof Sample, data: Data) => {
    const sample = samples[sampleIdx];
    setSamples((prev) =>
      prev.map((s, i) => (i === sampleIdx ? { ...s, [key]: data } : s))
    );
    scheduleAutoSave(sample.id, key, data);
    scheduleLocalSave(sample.id, sample.label, key, data);
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
    if (step === currentStep) return;
    await flushPending();
    setCurrentStep(step);
    if (resetSample) setSampleIdx(0);
    scrollCanvasToTop();
  };

  const handleSampleSelect = async (i: number) => {
    if (i === sampleIdx) return;
    await flushPending();
    setSampleIdx(i);
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
        ? stepMissing(samples[sampleIdx], currentStep, guardFormat)
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

  const doGoToResults = async () => {
    // Final submit + results require connectivity. Offline, we keep the drafts
    // saved locally (they sync on reconnect) and surface a notice instead of
    // queuing an irreversible submit the user can't verify.
    if (!onlineRef.current) {
      await flushPending();
      setSubmitBlocked(true);
      return;
    }
    setIsGoingToResults(true);
    setSubmitError(false);
    try {
      await flushPending();
      await submitAllEvaluations(session.id);
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
    const gaps = sessionMissing(samples, stepsForFormat, guardFormat);
    if (gaps.length > 0) {
      // Flag every sample+step combo that has a gap so revisiting any of them
      // shows the inline indicator, not just the current one.
      setFlaggedSteps((prev) => {
        const next = new Set(prev);
        for (const sample of samples) {
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
  const handleGenerateInvite = async () => {
    setIsGeneratingInvite(true);
    try {
      const { token } = await createInviteToken(session.id);
      const link = buildInviteUrl(window.location.origin, locale, token);
      setInviteLink(link);
    } catch {
      feedback.notifyError("unknown");
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCloseSession = () => {
    setCloseDialogOpen(true);
  };

  const handleConfirmClose = async () => {
    await closeSession(session.id);
    router.push(`/${locale}/app/sessions/${session.id}/results`);
  };

  const handleStart = () => {
    setIsStarting(true);
    setStartError(false);
    startTransition(async () => {
      try {
        const r = await startSession(session.id);
        if (r.ok) setStartedAt(new Date().toISOString());
      } catch {
        setStartError(true);
      } finally {
        setIsStarting(false);
      }
    });
  };

  // Optimistic: the select reflects the choice at once; a failed save toasts
  // the localized error (useActionFeedback) and rolls the value back.
  const handleReferenceChange = (value: string) => {
    const next = value === "" ? null : value;
    const prev = referenceSampleId;
    setReferenceSampleId(next);
    startTransition(async () => {
      const r = await feedback.run(setReferenceSample(session.id, next));
      if (!r.ok) setReferenceSampleId(prev);
    });
  };

  // ─── Derived state ────────────────────────────────────────────
  const current = samples[sampleIdx];
  const referenceSample = referenceSampleId
    ? samples.find((s) => s.id === referenceSampleId) ?? null
    : null;
  const isCurrentReference = referenceSample?.id === current.id;
  const referenceBadgeLabel = translations.referenceBadge ?? "Referencia";
  const referenceOptions = [
    { value: "", label: translations.referenceNone ?? "Sin referencia" },
    ...samples.map((s) => ({ value: s.id, label: s.label })),
  ];
  // Header line under the sample name: "· Referencia" on the reference itself,
  // "Compara con la referencia (C)" on every other sample (participants too).
  const referenceContext = isCurrentReference ? (
    <Badge tone="accent" size="xs">{referenceBadgeLabel}</Badge>
  ) : referenceSample && translations.compareHint ? (
    <span className="font-sans text-[11px] text-brown-mid">
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
            }
          : s
      )
    );
    setEditingSample(false);
    setCoffeeNotOwnedNotice(!result.coffeeUpdated);
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
      await handleGoToResults();
      return;
    }
    if (key !== "cupping" && key !== "extrinsic" && key !== "physical") return;
    setActiveTab(key);
    scrollCanvasToTop();
  };

  // ─── Footer next-button labelling ─────────────────────────────
  const nextStep =
    isLastSampleInStep && !isLastStep
      ? stepsForFormat[stepsForFormat.indexOf(currentStep) + 1]
      : null;
  const nextLabel = isLastSampleOverall
    ? translations.viewResults
    : nextStep
    ? `${translations.nextPhase} → ${translations.phaseLabels[nextStep]}`
    : translations.nextSample;

  const nextVariant: "next-sample" | "next-phase" | "view-results" =
    isLastSampleOverall
      ? "view-results"
      : isLastSampleInStep && !isLastStep
      ? "next-phase"
      : "next-sample";

  // ─── Sidebar slot content ─────────────────────────────────────
  const identity = (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
        {translations.formatLabel}
        {isGroup ? ` · ${isOwner ? translations.masterRole : translations.participantRole}` : ""}
      </div>
      <div className="font-display text-xl leading-tight text-green-dark truncate">
        {session.name}
      </div>
      {isGroup && (
        <div className="font-mono text-[11px] text-brown-mid mt-0.5">
          {translations.submittedOf}
        </div>
      )}
      {referenceSample && (
        <div className="font-mono text-[11px] text-brown-mid mt-0.5 truncate">
          {referenceBadgeLabel}: {referenceSample.label}
        </div>
      )}
    </>
  );

  const sampleTabsBar = (
    <SampleTabs
      orientation="horizontal"
      header={translations.samplesHeader}
      samples={samples.map((s) => ({
        id: s.id,
        label: s.label,
        filled: hasStepFill(s, currentStep),
        reference: s.id === referenceSampleId,
      }))}
      referenceLabel={referenceBadgeLabel}
      activeIndex={sampleIdx}
      onSelect={handleSampleSelect}
    />
  );

  // Mobile/tablet (<lg): horizontal sample bar + position counter, under the phases.
  const mobileSampleBar = (
    <div className="lg:hidden flex items-center gap-3 px-4 py-1.5 border-t border-brown-light bg-bg">
      <div className="min-w-0 flex-1">{sampleTabsBar}</div>
      <span className="shrink-0 font-mono text-[10px] text-brown-mid tabular-nums">
        {sampleIdx + 1}/{samples.length}
      </span>
      {editSampleButton}
    </div>
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
        submittedLabel={`${submittedCount} / ${participantCount}`}
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
        startLabel={translations.startSession}
        startingLabel={translations.starting}
        showStart={showStart}
        isStarting={isStarting}
        onStart={handleStart}
        referenceLabel={translations.referenceSelect ?? "Muestra de referencia"}
        referenceOptions={referenceOptions}
        referenceValue={referenceSampleId ?? ""}
        onReferenceChange={handleReferenceChange}
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

  // ─── Top bar content ──────────────────────────────────────────
  const phaseStepper = (
    <PhaseStepper
      phases={stepsForFormat}
      currentPhase={currentStep}
      phaseStatuses={stepStatuses}
      labels={translations.phaseLabels}
      onSelect={handleStepChange}
      variant="light"
    />
  );

  const topBar =
    activeTab === "cupping" ? (
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
        {/* Mobile/tablet: horizontal sample bar */}
        {mobileSampleBar}
        <div className="flex items-center gap-3 px-6 py-3">
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
      onPrev={handlePrev}
      onNext={isLastSampleOverall ? handleGoToResults : handleNextSample}
      prevLabel={translations.prev}
      nextLabel={
        isNavigating || isGoingToResults ? translations.submitting : nextLabel
      }
      prevDisabled={prevDisabled || isNavigating}
      nextDisabled={isNavigating || isGoingToResults}
      nextVariant={nextVariant}
    />
  );

  // ─── Render ───────────────────────────────────────────────────
  return (
    <SessionShell
      identity={identity}
      secondaryNav={secondaryNav}
      ownerControls={ownerControls}
      exitLink={exitLink}
      topBar={topBar}
      footer={footer}
      mobileTitle={session.name}
      saveStatus={saveStatus}
      savePendingLabel={translations.savedLocally}
    >
      <OfflineBanner
        online={online}
        syncPhase={syncPhase}
        onRetry={retrySync}
        translations={translations.offline}
        storageUnavailable={storageUnavailable}
      />
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
              <Select
                value={referenceSampleId ?? ""}
                onChange={handleReferenceChange}
                options={referenceOptions}
                ariaLabel={translations.referenceSelect ?? "Muestra de referencia"}
              />
            </label>
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
            }}
            onSubmit={handleSaveSampleMetadata}
            onCancel={() => setEditingSample(false)}
            translations={{
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
      {submitBlocked && !online && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 px-4 py-2 mb-3 rounded-md border border-amber-warm/40 bg-amber-warm/10 font-sans text-sm text-amber-warm"
        >
          <span className="flex-1">{translations.offline.submitBlocked}</span>
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
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title={translations.closeSession}
        body={translations.confirmClose}
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

      <DevRoleBadge email={userEmail} />
    </SessionShell>
  );
}

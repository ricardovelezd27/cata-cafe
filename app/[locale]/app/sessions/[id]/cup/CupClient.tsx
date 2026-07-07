"use client";

import { useState, useRef, useTransition, useEffect } from "react";
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
} from "@/app/actions/sessions";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  submitAllEvaluations,
  closeSession,
  createInviteToken,
} from "@/app/actions/community";
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
};

type CuppingTab = "cupping" | "extrinsic" | "physical";

export function CupClient({
  locale,
  initialSampleId,
  session,
  isOwner,
  isGroup,
  sessionStatus,
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
    prev: string;
    extrinsic: string;
    physical: string;
    results: string;
    process: string;
    editSample: string;
    editSampleError: string;
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
    };
  };
  userEmail?: string;
  userCountry?: string;
}) {
  const router = useRouter();
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [editingSample, setEditingSample] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [isGoingToResults, setIsGoingToResults] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [guard, setGuard] = useState<{
    kind: "next" | "submit";
    items: GuardItem[];
  } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
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
      participantCount,
      submittedCount: initialSubmittedCount,
      translations,
      userEmail,
      userCountry,
      userId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Best-effort flush of the in-flight local edit before the tab unloads.
  // IndexedDB writes can't be awaited here; the 500ms debounce keeps the
  // unsaved window tiny.
  useEffect(() => {
    const handler = () => {
      const p = localPendingRef.current;
      if (p) void writeLocal(p.sampleId, p.label, p.key, p.data);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
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
        { event: "UPDATE", schema: "public", table: "evaluations" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (
            row.is_draft === false &&
            typeof row.session_sample_id === "string" &&
            sampleIds.has(row.session_sample_id)
          ) {
            setSubmittedCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGroup, online, session.id, session.samples]);

  // ─── Save plumbing ────────────────────────────────────────────
  const labelFor = (sampleId: string) =>
    samples.find((s) => s.id === sampleId)?.label ?? "";

  const flushSave = async (
    sampleId: string,
    key: keyof Sample,
    data: Data
  ) => {
    if (!isModuleKey(key)) return;
    const mk = key as ModuleKey;

    // Offline → persist locally as pending and stop. Sync-on-reconnect replays.
    if (!onlineRef.current) {
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
      return;
    }

    try {
      if (key === "descriptive" || key === "affective" || key === "combined") {
        await upsertEvaluation({
          sessionSampleId: sampleId,
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
    } catch {
      // Network/server failure → fall back to a durable local pending write so
      // the edit survives and is replayed on the next reconnect.
      await writeLocal(sampleId, labelFor(sampleId), mk, data);
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
        await flushSave(sampleId, key, data);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
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
    try {
      await flushPending();
      await submitAllEvaluations(session.id);
    } finally {
      router.push(`/${locale}/app/sessions/${session.id}/results`);
    }
  };

  // Guard: submit is effectively irreversible, so scan every sample across every
  // phase and list the gaps before finalizing.
  const handleGoToResults = async () => {
    if (guard) return;
    const gaps = sessionMissing(samples, stepsForFormat, guardFormat);
    if (gaps.length > 0) {
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
      const link = `${window.location.origin}/${locale}/join/${token}`;
      setInviteLink(link);
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
    if (!confirm(translations.confirmClose)) return;
    startTransition(async () => {
      await closeSession(session.id);
      router.push(`/${locale}/app/sessions/${session.id}/results`);
    });
  };

  // ─── Derived state ────────────────────────────────────────────
  const current = samples[sampleIdx];

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    await updateSampleMetadata(current.id, data);
    setSamples((prev) =>
      prev.map((s) =>
        s.id === current.id
          ? { ...s, label: data.label, coffee: { ...data } }
          : s
      )
    );
    setEditingSample(false);
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
  const modules: ModuleItem[] = [
    {
      key: "cupping",
      label: translations.cuppingModule,
      icon: <Coffee size={16} />,
    },
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
      }))}
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
        closeLabel={translations.closeSession}
        inviteLabel={translations.invite}
        generatingLabel={translations.generating}
        copyLabel={translations.copy}
        copiedLabel={translations.copied}
        sessionClosed={sessionClosed}
        inviteLink={inviteLink}
        isGenerating={isGeneratingInvite}
        isCopied={isCopied}
        onClose={handleCloseSession}
        onGenerate={handleGenerateInvite}
        onCopy={handleCopyInvite}
        onResetInvite={() => setInviteLink(null)}
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
    >
      <OfflineBanner
        online={online}
        syncPhase={syncPhase}
        onRetry={retrySync}
        translations={translations.offline}
      />
      {isOwner && editingSample && (
        <ResponsiveDialog
          open={editingSample}
          onOpenChange={setEditingSample}
          title={`${translations.editSample}: ${current.label}`}
        >
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
          />
        )}
        {activeTab === "cupping" && session.format === "affective" && (
          <AffectiveForm
            sampleData={current.affective}
            onChange={(d) => setCurrentData("affective", d)}
            cupsPerSample={session.cupsPerSample}
            currentStep={currentStep}
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

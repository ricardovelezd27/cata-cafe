"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { DescriptiveForm } from "@/components/cupping/DescriptiveForm";
import { AffectiveForm } from "@/components/cupping/AffectiveForm";
import { CombinedForm } from "@/components/cupping/CombinedForm";
import { ExtrinsicForm } from "@/components/cupping/ExtrinsicForm";
import { PhysicalEvalForm } from "@/components/cupping/PhysicalEvalForm";
import {
  upsertEvaluation,
  upsertExtrinsic,
  upsertPhysical,
} from "@/app/actions/sessions";
import { submitAllEvaluations, closeSession } from "@/app/actions/community";
import { CUPPING_PHASES, PHASE_LABELS, PHASE_ATTRIBUTES, type CuppingPhase } from "@/lib/constants";
import { PhaseStepper } from "@/components/cupping/PhaseStepper";
import { DevRoleBadge } from "@/components/dev/DevRoleBadge";

type Data = Record<string, unknown>;

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
};

type Session = {
  id: string;
  name: string;
  format: string;
  cupsPerSample: number;
  samples: Sample[];
};

type CuppingTab = "cupping" | "extrinsic" | "physical";

export function CupClient({
  locale,
  session,
  isOwner,
  isGroup,
  sessionStatus,
  participantCount,
  submittedCount: initialSubmittedCount,
  translations,
  userEmail,
}: {
  locale: string;
  session: Session;
  isOwner: boolean;
  isGroup: boolean;
  sessionStatus: string;
  participantCount: number;
  submittedCount: number;
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
    individual: string;
    masterControls: string;
    submittedOf: string;
    closeSession: string;
    confirmClose: string;
    masterRole: string;
    participantRole: string;
  };
  userEmail?: string;
}) {
  const router = useRouter();
  const [sampleIdx, setSampleIdx] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<CuppingPhase>("fragrance");
  const [samples, setSamples] = useState(session.samples);
  const [activeTab, setActiveTab] = useState<CuppingTab>("cupping");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [isGoingToResults, setIsGoingToResults] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ sampleId: string; key: keyof Sample; data: Data } | null>(null);

  // Realtime subscription for group sessions
  useEffect(() => {
    if (!isGroup) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGroup, session.id, session.samples]);

  const flushSave = async (sampleId: string, key: keyof Sample, data: Data) => {
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
    } catch {
      // best effort
    }
  };

  const flushPending = async () => {
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

  const scheduleAutoSave = (sampleId: string, key: keyof Sample, data: Data) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingSaveRef.current = { sampleId, key, data };
    debounceRef.current = setTimeout(() => {
      persist(sampleId, key, data);
      pendingSaveRef.current = null;
    }, 800);
  };

  const setCurrentData = (key: keyof Sample, data: Data) => {
    setSamples((prev) =>
      prev.map((s, i) => (i === sampleIdx ? { ...s, [key]: data } : s)),
    );
    scheduleAutoSave(samples[sampleIdx].id, key, data);
  };

  const handlePhaseChange = async (phase: CuppingPhase) => {
    if (phase === currentPhase) return;
    await flushPending();
    setCurrentPhase(phase);
    setSampleIdx(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleNextSample = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    try {
      await flushPending();
      if (sampleIdx < samples.length - 1) {
        setSampleIdx((i) => i + 1);
      } else {
        const phaseIdx = CUPPING_PHASES.indexOf(currentPhase);
        if (phaseIdx < CUPPING_PHASES.length - 1) {
          await handlePhaseChange(CUPPING_PHASES[phaseIdx + 1]);
        }
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    } finally {
      setIsNavigating(false);
    }
  };

  const handlePrev = async () => {
    await flushPending();
    if (sampleIdx > 0) {
      setSampleIdx((i) => i - 1);
    } else {
      const phaseIdx = CUPPING_PHASES.indexOf(currentPhase);
      if (phaseIdx > 0) {
        setCurrentPhase(CUPPING_PHASES[phaseIdx - 1]);
        setSampleIdx(samples.length - 1);
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const handleGoToResults = async () => {
    setIsGoingToResults(true);
    try {
      await flushPending();
      await submitAllEvaluations(session.id);
    } finally {
      router.push(`/${locale}/app/sessions/${session.id}/results`);
    }
  };

  const handleCloseSession = () => {
    if (!confirm(translations.confirmClose)) return;
    startTransition(async () => {
      await closeSession(session.id);
      router.push(`/${locale}/app/sessions/${session.id}/results`);
    });
  };

  const current = samples[sampleIdx];
  const isLastSampleInPhase = sampleIdx >= samples.length - 1;
  const isLastPhase = CUPPING_PHASES.indexOf(currentPhase) >= CUPPING_PHASES.length - 1;
  const isLastSampleOverall = isLastSampleInPhase && isLastPhase;
  const prevDisabled = sampleIdx === 0 && currentPhase === CUPPING_PHASES[0];

  const hasPhaseFill = (sample: Sample, phase: CuppingPhase): boolean => {
    return PHASE_ATTRIBUTES[phase].some((attr) => {
      if (session.format === "affective") {
        const v = sample.affective[attr.affectiveId];
        return v !== null && v !== undefined;
      }
      if (session.format === "descriptive") {
        if (!attr.descriptiveId) return false;
        const v = sample.descriptive[`${attr.descriptiveId}_int`];
        return v !== null && v !== undefined;
      }
      const aff = sample.combined[attr.affectiveId];
      const desc = attr.descriptiveId ? sample.combined[`${attr.descriptiveId}_int`] : undefined;
      return (aff !== null && aff !== undefined) || (desc !== null && desc !== undefined);
    });
  };

  const getPhaseStatus = (phase: CuppingPhase): "empty" | "partial" | "complete" => {
    const filled = samples.filter((s) => hasPhaseFill(s, phase)).length;
    if (filled === 0) return "empty";
    if (filled === samples.length) return "complete";
    return "partial";
  };

  const phaseStatuses = Object.fromEntries(
    CUPPING_PHASES.map((p) => [p, getPhaseStatus(p)])
  ) as Record<CuppingPhase, "empty" | "partial" | "complete">;

  const TABS = [
    { key: "cupping" as const, icon: "☕", label: "Cata" },
    { key: "extrinsic" as const, icon: "📋", label: translations.extrinsic },
    { key: "physical" as const, icon: "⚖", label: translations.physical },
    { key: "results" as const, icon: "📊", label: translations.results },
  ];

  const handleTabClick = async (key: typeof TABS[number]["key"]) => {
    if (key === "results") {
      await handleGoToResults();
    } else {
      setActiveTab(key);
    }
  };

  const nextButtonStyle = () => ({
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "none" as const,
    background: isNavigating
      ? "#C4B49A"
      : isLastSampleInPhase && !isLastPhase
      ? "linear-gradient(135deg, #C17817 0%, #A56A10 100%)"
      : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
    color: "#FFF",
    fontSize: 14,
    fontWeight: 700,
    cursor: isNavigating ? "default" as const : "pointer" as const,
    fontFamily: isLastSampleInPhase && !isLastPhase ? "'Cormorant Garamond', Georgia, serif" : "inherit",
    transition: "background 0.2s",
  });

  const resultsButtonStyle = () => ({
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "none" as const,
    background: isGoingToResults ? "#C4B49A" : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
    color: "#FFF",
    fontSize: 14,
    fontWeight: 700,
    cursor: isGoingToResults ? "default" as const : "pointer" as const,
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    letterSpacing: "0.3px",
  });

  const prevButtonStyle = () => ({
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "1px solid #D4C5A9",
    background: "transparent",
    color: prevDisabled ? "#C4B49A" : "#5C4A32",
    fontSize: 14,
    fontWeight: 600,
    cursor: prevDisabled ? "default" as const : "pointer" as const,
    fontFamily: "inherit",
  });

  return (
    <div
      className="-m-4 -mb-20 lg:-m-6 flex flex-col"
      style={{ minHeight: "100%", background: "#FDFBF7", color: "#5C4A32" }}
    >
      {/* ══ HORIZONTAL PROGRESS HEADER ══════════════════════════════════════ */}
      <div
        className="sticky top-0 z-50"
        style={{ background: "#FDFBF7", borderBottom: "1px solid #E8E0D0" }}
      >
        {/* Group role banner */}
        {isGroup && (
          <div
            style={{
              background: isOwner ? "#3D5A3E" : "#C17817",
              color: "#FFF",
              fontSize: 10,
              fontWeight: 700,
              textAlign: "center",
              padding: "4px 16px",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {isOwner ? translations.masterRole : translations.participantRole}
          </div>
        )}

        {/* Row 1: Back + Session name + save status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid #F0EBE0",
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              color: "#8B7355",
              background: "transparent",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
            }}
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 17,
                fontWeight: 700,
                color: "#3D5A3E",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.name}
            </div>
            {isGroup && (
              <div style={{ fontSize: 11, color: "#8B7355", fontFamily: "monospace" }}>
                {submittedCount}/{participantCount} {translations.submittedOf}
              </div>
            )}
          </div>
          {saveStatus === "saving" && (
            <span style={{ fontSize: 10, color: "#8B7355", flexShrink: 0 }}>Guardando…</span>
          )}
          {saveStatus === "saved" && (
            <span style={{ fontSize: 10, color: "#3D5A3E", flexShrink: 0 }}>✓ Guardado</span>
          )}
        </div>

        {/* Row 2: Sample tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            padding: "8px 16px",
            scrollbarWidth: "none",
            borderBottom: "1px solid #F0EBE0",
          }}
        >
          {samples.map((s, i) => {
            const filled = hasPhaseFill(s, currentPhase);
            const isActive = i === sampleIdx;
            return (
              <button
                key={s.id}
                onClick={async () => {
                  await flushPending();
                  setSampleIdx(i);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                style={{
                  padding: "5px 14px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? "#3D5A3E" : "transparent",
                  color: isActive ? "#FFF" : "#5C4A32",
                  border: isActive
                    ? "1px solid #3D5A3E"
                    : filled
                    ? "1px solid #B4C8A8"
                    : "1px solid #E8E0D0",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {s.label}
                {filled && !isActive && (
                  <span style={{ fontSize: 7, color: "#6B8F71" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3: Module tabs */}
        <div style={{ display: "flex" }}>
          {TABS.map((tab) => {
            const isActive = tab.key !== "results" && activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                disabled={isGoingToResults}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? "#3D5A3E" : "#8B7355",
                  background: isActive ? "#F0F5F0" : "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid #3D5A3E" : "2px solid transparent",
                  cursor: isGoingToResults ? "default" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 13 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Row 4: Phase stepper — only on Cata tab */}
        {activeTab === "cupping" && (
          <div style={{ background: "#F5F0E6", borderTop: "1px solid #F0EBE0" }}>
            <PhaseStepper
              phases={CUPPING_PHASES}
              currentPhase={currentPhase}
              phaseStatuses={phaseStatuses}
              onSelect={handlePhaseChange}
              variant="light"
            />
          </div>
        )}
      </div>

      {/* ══ MASTER CONTROLS (group owner only) ══════════════════════════════ */}
      {isOwner && isGroup && (
        <div
          style={{
            margin: "16px 16px 0",
            padding: "12px 14px",
            background: "#E8F0E8",
            borderRadius: 10,
            border: "1px solid #B4C8A8",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#3D5A3E",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 8,
            }}
          >
            {translations.masterControls}
          </div>
          <div style={{ fontSize: 12, color: "#5C4A32", marginBottom: 10 }}>
            {submittedCount} / {participantCount} {translations.submittedOf}
          </div>
          <button
            onClick={handleCloseSession}
            disabled={sessionStatus === "closed"}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: sessionStatus === "closed" ? "#C4B49A" : "#A83232",
              color: "#FFF",
              fontSize: 12,
              fontWeight: 700,
              cursor: sessionStatus === "closed" ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {translations.closeSession}
          </button>
        </div>
      )}

      {/* ══ FORM CONTENT ════════════════════════════════════════════════════ */}
      <div
        key={currentPhase}
        className="flex-1 p-4 lg:px-8 lg:py-6"
        style={{ animation: "phase-in 0.22s ease-out" }}
      >
        {activeTab === "cupping" && session.format === "descriptive" && (
          <DescriptiveForm
            sampleData={current.descriptive}
            onChange={(d) => setCurrentData("descriptive", d)}
            currentPhase={currentPhase}
          />
        )}
        {activeTab === "cupping" && session.format === "affective" && (
          <AffectiveForm
            sampleData={current.affective}
            onChange={(d) => setCurrentData("affective", d)}
            cupsPerSample={session.cupsPerSample}
            currentPhase={currentPhase}
          />
        )}
        {activeTab === "cupping" &&
          (session.format === "combined" ||
            !["descriptive", "affective"].includes(session.format)) && (
            <CombinedForm
              sampleData={current.combined}
              onChange={(d) => setCurrentData("combined", d)}
              cupsPerSample={session.cupsPerSample}
              currentPhase={currentPhase}
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

      {/* ══ STICKY FOOTER — single set of nav buttons ════════════════════════ */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 50,
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "12px 16px",
          paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))",
          display: "flex",
          gap: 10,
        }}
      >
        <button
          onClick={handlePrev}
          disabled={prevDisabled || isNavigating}
          style={prevButtonStyle()}
        >
          ← {translations.prev}
        </button>
        {isLastSampleOverall ? (
          <button
            onClick={handleGoToResults}
            disabled={isGoingToResults}
            style={resultsButtonStyle()}
          >
            {isGoingToResults ? translations.submitting : `${translations.viewResults} →`}
          </button>
        ) : (
          <button
            onClick={handleNextSample}
            disabled={isNavigating}
            style={nextButtonStyle()}
          >
            {isNavigating
              ? translations.submitting
              : isLastSampleInPhase && !isLastPhase
              ? `${translations.nextPhase} ⟶`
              : `${translations.nextSample} →`}
          </button>
        )}
      </div>
    </div>
  );
}

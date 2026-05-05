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

  const subtitle = activeTab === "cupping"
    ? `${PHASE_LABELS[currentPhase]} · ${translations.sample} ${sampleIdx + 1} ${translations.ofTotal}`
    : `${translations.sample} ${sampleIdx + 1} ${translations.ofTotal}`;

  const nextButtonStyle = (large: boolean) => ({
    flex: 1,
    padding: large ? "12px 0" : "10px 0",
    borderRadius: 10,
    border: "none" as const,
    background: isNavigating
      ? "#C4B49A"
      : isLastSampleInPhase && !isLastPhase
      ? "linear-gradient(135deg, #C17817 0%, #A56A10 100%)"
      : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
    color: "#FFF",
    fontSize: large ? 14 : 13,
    fontWeight: 700,
    cursor: isNavigating ? "default" as const : "pointer" as const,
    fontFamily: isLastSampleInPhase && !isLastPhase ? "'Cormorant Garamond', Georgia, serif" : "inherit",
    transition: "background 0.2s",
  });

  const resultsButtonStyle = (large: boolean) => ({
    flex: 1,
    padding: large ? "12px 0" : "10px 0",
    borderRadius: 10,
    border: "none" as const,
    background: isGoingToResults ? "#C4B49A" : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
    color: "#FFF",
    fontSize: large ? 14 : 13,
    fontWeight: 700,
    cursor: isGoingToResults ? "default" as const : "pointer" as const,
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    letterSpacing: "0.3px",
  });

  const prevButtonStyle = (large: boolean) => ({
    flex: 1,
    padding: large ? "12px 0" : "10px 0",
    borderRadius: 10,
    border: "1px solid #D4C5A9",
    background: "transparent",
    color: prevDisabled ? "#C4B49A" : "#5C4A32",
    fontSize: large ? 14 : 13,
    fontWeight: 600,
    cursor: prevDisabled ? "default" as const : "pointer" as const,
    fontFamily: "inherit",
  });

  const samplePills = (wrapped: boolean) => samples.map((s, i) => {
    const filled = hasPhaseFill(s, currentPhase);
    const isActive = i === sampleIdx;
    return (
      <button
        key={s.id}
        onClick={async () => { await flushPending(); setSampleIdx(i); window.scrollTo({ top: 0, behavior: "instant" }); }}
        style={{
          padding: "5px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: isActive ? 700 : 400,
          background: isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
          color: "#FFF",
          border: isActive
            ? "1px solid rgba(255,255,255,0.6)"
            : filled
            ? "1px solid rgba(180,200,168,0.6)"
            : "1px solid rgba(255,255,255,0.2)",
          whiteSpace: wrapped ? "normal" : "nowrap",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: wrapped ? undefined : 0,
          display: "flex",
          alignItems: "center",
          gap: 5,
          transition: "border-color 0.2s, background 0.15s",
          minHeight: 32,
        }}
      >
        {s.label}
        {filled && !isActive && <span style={{ fontSize: 7, color: "#B4C8A8", lineHeight: 1 }}>✓</span>}
      </button>
    );
  });

  return (
    <div
      className="lg:flex"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F5F0E6 0%, #EDE5D5 100%)",
        color: "#5C4A32",
        position: "relative",
      }}
    >
      {/* ══ MOBILE: role banner + sticky chrome (hidden on desktop) ══════════ */}
      <div className="lg:hidden">
        {isGroup && (
          <div
            style={{
              background: isOwner
                ? "linear-gradient(90deg, #3D5A3E 0%, #2A4430 100%)"
                : "linear-gradient(90deg, #C8860A 0%, #A06808 100%)",
              color: "#FFF",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              padding: "5px 16px",
            }}
          >
            {isOwner ? translations.masterRole : translations.participantRole}
          </div>
        )}

        <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
              padding: "12px 16px 8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => router.back()}
                style={{ color: "#FFF", background: "transparent", border: "none", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
              >
                ←
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ color: "#FFF", fontWeight: 700, fontSize: 16, fontFamily: "'Cormorant Garamond', Georgia, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {session.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                  {subtitle}
                  {isGroup && <span style={{ marginLeft: 8 }}>· {translations.submittedOf}</span>}
                </div>
              </div>
              {saveStatus === "saving" && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", flexShrink: 0 }}>Guardando...</div>
              )}
              {saveStatus === "saved" && (
                <div style={{ fontSize: 10, color: "#B4C8A8", flexShrink: 0 }}>✓ Guardado</div>
              )}
            </div>

            {activeTab === "cupping" && (
              <PhaseStepper
                phases={CUPPING_PHASES}
                currentPhase={currentPhase}
                phaseStatuses={phaseStatuses}
                onSelect={handlePhaseChange}
              />
            )}

            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingBottom: 4,
                scrollbarWidth: "none",
                maskImage: "linear-gradient(to right, black 85%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)",
              }}
            >
              {samplePills(false)}
            </div>
          </div>

          {/* Mobile tab bar */}
          <div style={{ display: "flex", background: "#FDFBF7", borderBottom: "1px solid #E8E0D0" }}>
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
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? "#3D5A3E" : "#8B7355",
                    background: isActive ? "#E8F0E8" : "transparent",
                    border: "none",
                    borderBottom: isActive ? "2px solid #3D5A3E" : "2px solid transparent",
                    cursor: isGoingToResults ? "default" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ DESKTOP: left sidebar (hidden on mobile) ══════════════════════════ */}
      <div
        className="hidden lg:flex flex-col w-72 flex-shrink-0 overflow-y-auto"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          background: "linear-gradient(180deg, #3D5A3E 0%, #2A4430 100%)",
          zIndex: 100,
        }}
      >
        {/* Role banner */}
        {isGroup && (
          <div
            style={{
              background: isOwner ? "rgba(0,0,0,0.2)" : "rgba(193,120,23,0.35)",
              color: "#FFF",
              textAlign: "center",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              padding: "6px 20px",
              flexShrink: 0,
            }}
          >
            {isOwner ? translations.masterRole : translations.participantRole}
          </div>
        )}

        {/* Header: back + title + save status */}
        <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
            <button
              onClick={() => router.back()}
              style={{ color: "rgba(255,255,255,0.7)", background: "transparent", border: "none", fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0, marginTop: 3 }}
            >
              ←
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ color: "#FFF", fontWeight: 700, fontSize: 17, fontFamily: "'Cormorant Garamond', Georgia, serif", lineHeight: 1.3, wordBreak: "break-word" }}
              >
                {session.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                {subtitle}
                {isGroup && <span style={{ marginLeft: 6 }}>· {submittedCount}/{participantCount}</span>}
              </div>
            </div>
            <div style={{ flexShrink: 0, minWidth: 20, textAlign: "right" }}>
              {saveStatus === "saving" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>…</div>}
              {saveStatus === "saved" && <div style={{ fontSize: 10, color: "#B4C8A8" }}>✓</div>}
            </div>
          </div>

          {/* Phase stepper */}
          {activeTab === "cupping" && (
            <div style={{ marginBottom: 14 }}>
              <PhaseStepper
                phases={CUPPING_PHASES}
                currentPhase={currentPhase}
                phaseStatuses={phaseStatuses}
                onSelect={handlePhaseChange}
              />
            </div>
          )}

          {/* Sample pills — wrapped in sidebar */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              paddingBottom: 16,
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {samplePills(true)}
          </div>
        </div>

        {/* Tab list — vertical */}
        <div style={{ flex: 1, paddingTop: 8 }}>
          {TABS.map((tab) => {
            const isActive = tab.key !== "results" && activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                disabled={isGoingToResults}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 20px",
                  background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                  color: isActive ? "#FFF" : "rgba(255,255,255,0.6)",
                  border: "none",
                  cursor: isGoingToResults ? "default" : "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  textAlign: "left",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Master controls in sidebar — owner + group only */}
        {isOwner && isGroup && (
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.15)",
              flexShrink: 0,
            }}
          >
            <div
              style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}
            >
              {translations.masterControls}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>
              {submittedCount} / {participantCount} {translations.submittedOf}
            </div>
            <button
              onClick={handleCloseSession}
              disabled={sessionStatus === "closed"}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: "none",
                background: sessionStatus === "closed" ? "rgba(255,255,255,0.2)" : "#A83232",
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
      </div>

      {/* ══ MAIN CONTENT AREA ═════════════════════════════════════════════════ */}
      <div className="lg:flex-1 lg:flex lg:flex-col">
        {/* Mobile master controls (desktop shows in sidebar) */}
        {isOwner && isGroup && (
          <div
            className="lg:hidden"
            style={{
              margin: "12px 16px 0",
              padding: "12px 14px",
              background: "#E8F0E8",
              borderRadius: 10,
              border: "1px solid #B4C8A8",
            }}
          >
            <div
              style={{ fontSize: 11, fontWeight: 700, color: "#3D5A3E", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}
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

        {/* Form content */}
        <div
          key={currentPhase}
          className="p-4 lg:px-8 lg:py-6 lg:flex-1"
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

        {/* Spacer so mobile fixed nav doesn't cover content */}
        <div
          className="lg:hidden"
          style={{ height: "max(80px, calc(env(safe-area-inset-bottom) + 64px))" }}
        />

        {/* Desktop inline nav — sticky at bottom of content column */}
        <div
          className="hidden lg:flex"
          style={{
            borderTop: "1px solid #E8E0D0",
            background: "#FDFBF7",
            padding: "16px 32px",
            gap: 12,
            position: "sticky",
            bottom: 0,
            zIndex: 50,
          }}
        >
          <button
            onClick={handlePrev}
            disabled={prevDisabled || isNavigating}
            style={prevButtonStyle(true)}
          >
            ← {translations.prev}
          </button>
          {isLastSampleOverall ? (
            <button
              onClick={handleGoToResults}
              disabled={isGoingToResults}
              style={resultsButtonStyle(true)}
            >
              {isGoingToResults ? translations.submitting : `${translations.viewResults} →`}
            </button>
          ) : (
            <button
              onClick={handleNextSample}
              disabled={isNavigating}
              style={nextButtonStyle(true)}
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

      <DevRoleBadge email={userEmail} />

      {/* Mobile fixed bottom nav */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "10px 16px",
          paddingBottom: "max(10px, calc(env(safe-area-inset-bottom) + 6px))",
          display: "flex",
          gap: 8,
          zIndex: 99,
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={handlePrev}
          disabled={prevDisabled || isNavigating}
          style={prevButtonStyle(false)}
        >
          ← {translations.prev}
        </button>
        {isLastSampleOverall ? (
          <button
            onClick={handleGoToResults}
            disabled={isGoingToResults}
            style={resultsButtonStyle(false)}
          >
            {isGoingToResults ? translations.submitting : `${translations.viewResults} →`}
          </button>
        ) : (
          <button
            onClick={handleNextSample}
            disabled={isNavigating}
            style={nextButtonStyle(false)}
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

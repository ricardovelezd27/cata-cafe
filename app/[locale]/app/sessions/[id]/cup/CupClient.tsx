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
import { submitAllEvaluations, closeSession, revealSample } from "@/app/actions/community";
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
    reveal: string;
    selectCoffee: string;
    masterRole: string;
    participantRole: string;
  };
  userEmail?: string;
}) {
  const router = useRouter();
  const [sampleIdx, setSampleIdx] = useState(0);
  const [samples, setSamples] = useState(session.samples);
  const [activeTab, setActiveTab] = useState<CuppingTab>("cupping");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [submittedCount, setSubmittedCount] = useState(initialSubmittedCount);
  const [isGoingToResults, setIsGoingToResults] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const persist = (sampleId: string, key: keyof Sample, data: Data) => {
    setSaveStatus("saving");
    startTransition(async () => {
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
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("idle");
      }
    });
  };

  const scheduleAutoSave = (sampleId: string, key: keyof Sample, data: Data) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(sampleId, key, data), 800);
  };

  const setCurrentData = (key: keyof Sample, data: Data) => {
    setSamples((prev) =>
      prev.map((s, i) => (i === sampleIdx ? { ...s, [key]: data } : s)),
    );
    scheduleAutoSave(samples[sampleIdx].id, key, data);
  };

  const handleGoToResults = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setIsGoingToResults(true);
    try {
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

  const handleReveal = (sampleId: string, coffeeId: string) => {
    startTransition(async () => {
      await revealSample(sampleId, coffeeId);
      setSamples((prev) =>
        prev.map((s) => (s.id === sampleId ? { ...s, revealed: true, coffeeId } : s)),
      );
    });
  };

  const current = samples[sampleIdx];
  const isLastSample = sampleIdx >= samples.length - 1;

  const TABS = [
    { key: "cupping" as const, icon: "☕", label: "Cata" },
    { key: "extrinsic" as const, icon: "📋", label: translations.extrinsic },
    { key: "physical" as const, icon: "⚖", label: translations.physical },
    { key: "results" as const, icon: "📊", label: translations.results },
  ];

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F5F0E6 0%, #EDE5D5 100%)",
        color: "#5C4A32",
        position: "relative",
      }}
    >
      {/* Role banner — group sessions only */}
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

      {/* Sticky chrome: header + tab bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        {/* Gradient header */}
        <div
          style={{
            background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
            padding: "12px 16px 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "#FFF",
                  fontWeight: 700,
                  fontSize: 16,
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {session.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                {translations.sample} {sampleIdx + 1} {translations.ofTotal}
                {isGroup && (
                  <span style={{ marginLeft: 8 }}>
                    · {translations.submittedOf}
                  </span>
                )}
              </div>
            </div>
            {saveStatus === "saving" && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", flexShrink: 0 }}>
                Guardando...
              </div>
            )}
            {saveStatus === "saved" && (
              <div style={{ fontSize: 10, color: "#B4C8A8", flexShrink: 0 }}>✓ Guardado</div>
            )}
          </div>

          {/* Sample pills */}
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 4,
              scrollbarWidth: "none",
            }}
          >
            {samples.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSampleIdx(i)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: i === sampleIdx ? 700 : 400,
                  background:
                    i === sampleIdx ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  color: "#FFF",
                  border:
                    i === sampleIdx
                      ? "1px solid rgba(255,255,255,0.6)"
                      : "1px solid rgba(255,255,255,0.25)",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            background: "#FDFBF7",
            borderBottom: "1px solid #E8E0D0",
          }}
        >
          {TABS.map((tab) => {
            const isActive = tab.key !== "results" && activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={async () => {
                  if (tab.key === "results") {
                    await handleGoToResults();
                  } else {
                    setActiveTab(tab.key);
                  }
                }}
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

      {/* Master controls panel — owner only */}
      {isOwner && isGroup && (
        <div
          style={{
            margin: "12px 16px 0",
            padding: "12px 14px",
            background: "#E8F0E8",
            borderRadius: 10,
            border: "1px solid #B4C8A8",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#3D5A3E",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 10,
            }}
          >
            {translations.masterControls}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#5C4A32",
              marginBottom: 10,
            }}
          >
            {submittedCount} / {participantCount} {translations.submittedOf}
          </div>

          {/* Per-sample reveal buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {samples.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#5C4A32" }}>{s.label}:</span>
                {s.revealed ? (
                  <span style={{ fontSize: 10, color: "#3D5A3E" }}>✓ Revelado</span>
                ) : (
                  <button
                    onClick={() => {
                      if (s.coffeeId) {
                        handleReveal(s.id, s.coffeeId);
                      } else {
                        const coffeeId = prompt(translations.selectCoffee);
                        if (coffeeId) handleReveal(s.id, coffeeId);
                      }
                    }}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      border: "1px solid #3D5A3E",
                      background: "white",
                      color: "#3D5A3E",
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {translations.reveal}
                  </button>
                )}
              </div>
            ))}
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

      {/* Content */}
      <div style={{ padding: 16, paddingBottom: 88 }}>
        {activeTab === "cupping" && session.format === "descriptive" && (
          <DescriptiveForm
            sampleData={current.descriptive}
            onChange={(d) => setCurrentData("descriptive", d)}
          />
        )}
        {activeTab === "cupping" && session.format === "affective" && (
          <AffectiveForm
            sampleData={current.affective}
            onChange={(d) => setCurrentData("affective", d)}
            cupsPerSample={session.cupsPerSample}
          />
        )}
        {activeTab === "cupping" &&
          (session.format === "combined" ||
            !["descriptive", "affective"].includes(session.format)) && (
            <CombinedForm
              sampleData={current.combined}
              onChange={(d) => setCurrentData("combined", d)}
              cupsPerSample={session.cupsPerSample}
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

      {/* Bottom nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "#FDFBF7",
          borderTop: "1px solid #E8E0D0",
          padding: "12px 16px",
          display: "flex",
          gap: 8,
          zIndex: 99,
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={() => setSampleIdx((i) => Math.max(0, i - 1))}
          disabled={sampleIdx === 0}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 10,
            border: "1px solid #D4C5A9",
            background: "transparent",
            color: sampleIdx === 0 ? "#C4B49A" : "#5C4A32",
            fontSize: 13,
            fontWeight: 600,
            cursor: sampleIdx === 0 ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          ← {translations.prev}
        </button>
        {isLastSample ? (
          <button
            onClick={handleGoToResults}
            disabled={isGoingToResults}
            style={{
              flex: 1.5,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: isGoingToResults
                ? "#C4B49A"
                : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
              color: "#FFF",
              fontSize: 13,
              fontWeight: 700,
              cursor: isGoingToResults ? "default" : "pointer",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              letterSpacing: "0.3px",
            }}
          >
            {isGoingToResults ? translations.submitting : `${translations.viewResults} →`}
          </button>
        ) : (
          <button
            onClick={() => setSampleIdx((i) => Math.min(samples.length - 1, i + 1))}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
              color: "#FFF",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {translations.nextSample} →
          </button>
        )}
      </div>
    </div>
  );
}

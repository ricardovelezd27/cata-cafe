"use client";

import { useEffect, useRef } from "react";
import { PHASE_LABELS, type CuppingPhase } from "@/lib/constants";

interface PhaseStepperProps {
  phases: CuppingPhase[];
  currentPhase: CuppingPhase;
  phaseStatuses: Record<CuppingPhase, "empty" | "partial" | "complete">;
  onSelect: (phase: CuppingPhase) => void;
}

export function PhaseStepper({ phases, currentPhase, phaseStatuses, onSelect }: PhaseStepperProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentPhase]);

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        padding: "4px 2px 4px",
        scrollbarWidth: "none",
        /* Fade both edges to signal scrollability */
        maskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
      }}
    >
      {phases.map((phase, idx) => {
        const isActive = phase === currentPhase;
        const status = phaseStatuses[phase];

        const statusDot =
          status === "complete"
            ? { symbol: "✓", color: isActive ? "#3D5A3E" : "#B4C8A8" }
            : status === "partial"
            ? { symbol: "●", color: isActive ? "#C17817" : "rgba(193,120,23,0.65)" }
            : { symbol: "○", color: "transparent" };

        return (
          <button
            key={phase}
            ref={isActive ? activeRef : null}
            onClick={() => onSelect(phase)}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: isActive ? 700 : 400,
              background: isActive ? "rgba(255,255,255,0.92)" : "transparent",
              color: isActive ? "#3D5A3E" : "rgba(255,255,255,0.72)",
              border: isActive ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              minHeight: 44, /* WCAG 2.5.5 minimum touch target */
              minWidth: 44,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {idx + 1}. {PHASE_LABELS[phase]}
            </span>
            <span
              style={{
                fontSize: 7,
                lineHeight: 1,
                color: statusDot.color,
                transition: "color 0.25s",
              }}
            >
              {statusDot.symbol}
            </span>
          </button>
        );
      })}
    </div>
  );
}

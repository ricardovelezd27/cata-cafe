"use client";

import { useEffect, useRef } from "react";

interface PhaseStepperProps<T extends string> {
  phases: readonly T[];
  currentPhase: T;
  phaseStatuses: Record<string, "empty" | "partial" | "complete">;
  labels: Record<string, string>;
  onSelect: (phase: T) => void;
  variant?: "dark" | "light";
}

export function PhaseStepper<T extends string>({
  phases,
  currentPhase,
  phaseStatuses,
  labels,
  onSelect,
  variant = "dark",
}: PhaseStepperProps<T>) {
  const isLight = variant === "light";
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
        overflowX: "auto",
        padding: "4px 8px",
        scrollbarWidth: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          width: "fit-content",
          margin: "0 auto",
        }}
      >
      {phases.map((phase, idx) => {
        const isActive = phase === currentPhase;
        const status = phaseStatuses[phase] ?? "empty";

        const statusDot =
          status === "complete"
            ? { symbol: "✓", color: isLight ? (isActive ? "#3D5A3E" : "#6B8F71") : (isActive ? "#3D5A3E" : "#B4C8A8") }
            : status === "partial"
            ? { symbol: "●", color: "#C17817" }
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
              background: isLight
                ? (isActive ? "#FFFFFF" : "transparent")
                : (isActive ? "rgba(255,255,255,0.92)" : "transparent"),
              color: isLight
                ? (isActive ? "#3D5A3E" : "#8B7355")
                : (isActive ? "#3D5A3E" : "rgba(255,255,255,0.72)"),
              border: isLight
                ? (isActive ? "1px solid #3D5A3E" : "1px solid #E8E0D0")
                : (isActive ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent"),
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              minHeight: 44,
              minWidth: 44,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {idx + 1}. {labels[phase] ?? phase}
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
    </div>
  );
}

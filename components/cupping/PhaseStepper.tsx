"use client";

import { useEffect, useRef } from "react";
import { scrollBehavior } from "@/lib/motion";
import { HIT_Y44 } from "@/components/ui/hitArea";

interface PhaseStepperProps<T extends string> {
  phases: readonly T[];
  currentPhase: T;
  phaseStatuses: Record<string, "empty" | "partial" | "complete">;
  labels: Record<string, string>;
  onSelect: (phase: T) => void;
  variant?: "dark" | "light";
  align?: "start" | "center";
  /** Phone chrome: shorter pills (40px) and tighter outer padding. */
  compact?: boolean;
}

export function PhaseStepper<T extends string>({
  phases,
  currentPhase,
  phaseStatuses,
  labels,
  onSelect,
  variant = "dark",
  align = "center",
  compact = false,
}: PhaseStepperProps<T>) {
  const isLight = variant === "light";
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: scrollBehavior(), block: "nearest", inline: "center" });
    }
  }, [currentPhase]);

  return (
    <div
      ref={scrollRef}
      style={{
        overflowX: "auto",
        padding: compact ? "2px 8px" : "4px 8px",
        scrollbarWidth: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          width: "fit-content",
          margin: align === "start" ? "0" : "0 auto",
        }}
      >
      {phases.map((phase, idx) => {
        const isActive = phase === currentPhase;
        const status = phaseStatuses[phase] ?? "empty";

        const statusDot =
          status === "complete"
            ? { symbol: "✓", color: isLight ? (isActive ? "var(--color-primary-container)" : "var(--color-primary-muted)") : (isActive ? "var(--color-primary-container)" : "var(--color-primary-fixed-dim)") }
            : status === "partial"
            ? { symbol: "●", color: "var(--color-secondary)" }
            : { symbol: "○", color: "transparent" };

        return (
          <button
            key={phase}
            ref={isActive ? activeRef : null}
            onClick={() => onSelect(phase)}
            // Compact (the phone's docked stepper) keeps its 40 px so the chrome
            // does not grow; its hit area is 44 px tall, inside the scroller's
            // 2 px padding. The full stepper paints 44 px itself.
            className={compact ? HIT_Y44 : undefined}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: compact ? "4px 12px" : "6px 12px",
              borderRadius: 20,
              fontSize: "var(--text-caption)",
              fontWeight: isActive ? 700 : 400,
              background: isLight
                ? (isActive ? "var(--color-surface-container-lowest)" : "transparent")
                : (isActive ? "rgba(255,255,255,0.92)" : "transparent"),
              color: isLight
                ? (isActive ? "var(--color-primary-container)" : "var(--color-on-surface-variant)")
                : (isActive ? "var(--color-primary-container)" : "rgba(255,255,255,0.72)"),
              border: isLight
                ? (isActive ? "1px solid var(--color-primary-container)" : "1px solid var(--color-outline-variant)")
                : (isActive ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent"),
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              minHeight: compact ? 40 : 44,
              minWidth: 44,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {idx + 1}. {labels[phase] ?? phase}
            </span>
            <span
              style={{
                // a status dot drawn with a glyph, not text: it keeps its 7 px (0.57 of the caption)
                fontSize: "0.57em",
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

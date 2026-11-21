"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { scrollBehavior } from "@/lib/motion";
import { nextRovingIndex, tabStopIndex } from "@/lib/rovingFocus";
import { HIT_Y44 } from "@/components/ui/hitArea";
import { EdgeFades, useEdgeHint } from "@/components/ui/EdgeHint";

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
  /** The tablist's name (P5b). */
  ariaLabel?: string;
  /** "paso {n} de {total}": read after each step's label (P5b, D-04). */
  stepOfTemplate?: string;
  /**
   * The steps after the phases, shown numbered and NOT interactive (P5b, D-04): the notes
   * stage and the send. They say where the cupping ends; both are still reached only by the
   * footer, as before.
   */
  trailing?: readonly string[];
}

/**
 * The cupping screen's steps (P5b, audit D-02 / D-04 / H-08): TABS, one Tab stop (the current
 * step), the arrow keys, Home and End move the focus (`lib/rovingFocus.ts`). Activation is
 * MANUAL: Enter or Space (the button's own click) selects, because a step change awaits the
 * page's flush of pending saves. Each step says "paso n de N"; the trailing steps are disabled
 * tabs the arrows skip. A sideways row says when it has more (P5a's fade with a chevron).
 */
export function PhaseStepper<T extends string>({
  phases,
  currentPhase,
  phaseStatuses,
  labels,
  onSelect,
  variant = "dark",
  align = "center",
  compact = false,
  ariaLabel,
  stepOfTemplate,
  trailing = [],
}: PhaseStepperProps<T>) {
  const isLight = variant === "light";
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const total = phases.length + trailing.length;
  const disabled = [...phases.map(() => false), ...trailing.map(() => true)];
  const selected = phases.indexOf(currentPhase);
  const stop = tabStopIndex(selected, disabled);
  const hint = useEdgeHint(scrollRef, [phases.length, trailing.length]);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: scrollBehavior(), block: "nearest", inline: "center" });
    }
  }, [currentPhase]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingIndex(e.key, index, disabled);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
  };

  const stepOf = (n: number) =>
    stepOfTemplate ? `, ${stepOfTemplate.replace("{n}", String(n)).replace("{total}", String(total))}` : "";

  // DESIGN.md "Selected and not selected", the pill-tab row (as PillTabs): not selected = an
  // `outline` border, hover and pressed = `surface-container`; selected = `primary-fixed`.
  const LIGHT_PILL = {
    active: "border border-primary-fixed bg-primary-fixed font-semibold text-on-primary-fixed",
    idle: "border border-outline font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface active:bg-surface-container active:text-on-surface",
    trailing: "border border-dashed border-outline font-medium text-on-surface-variant",
  };
  const pillClass = (kind: keyof typeof LIGHT_PILL) => (isLight ? LIGHT_PILL[kind] : "");

  const pillStyle = (isActive: boolean) => ({
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
    padding: compact ? "4px 12px" : "6px 12px",
    borderRadius: 20,
    fontSize: "var(--text-caption)",
    // The light stepper (the cup page) takes its tones from LIGHT_PILL (classes, so it has a
    // hover and a pressed tone); the dark one keeps its inline tones.
    ...(isLight
      ? {}
      : {
          fontWeight: isActive ? 700 : 400,
          background: isActive ? "rgba(255,255,255,0.92)" : "transparent",
          color: isActive ? "var(--color-primary-container)" : "rgba(255,255,255,0.72)",
          border: isActive ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent",
        }),
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
    minHeight: compact ? 40 : 44,
    minWidth: 44,
  });

  return (
    <div style={{ position: "relative" }}>
    <div
      ref={scrollRef}
      style={{
        overflowX: "auto",
        padding: compact ? "2px 8px" : "4px 8px",
        scrollbarWidth: "none",
      }}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
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
            ref={(el) => {
              refs.current[idx] = el;
              if (isActive) activeRef.current = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={idx === stop ? 0 : -1}
            onClick={() => onSelect(phase)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            // Compact (the phone's docked stepper) keeps its 40 px so the chrome
            // does not grow; its hit area is 44 px tall, inside the scroller's
            // 2 px padding. The full stepper paints 44 px itself.
            className={`${compact ? HIT_Y44 : ""} ${pillClass(isActive ? "active" : "idle")}`.trim() || undefined}
            style={pillStyle(isActive)}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {idx + 1}. {labels[phase] ?? phase}
              <span className="sr-only">{stepOf(idx + 1)}</span>
            </span>
            <span
              aria-hidden
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
      {trailing.map((label, k) => {
        const idx = phases.length + k;
        return (
          <button
            key={`trailing-${k}`}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={false}
            aria-disabled
            tabIndex={-1}
            data-trailing-step=""
            className={`${compact ? HIT_Y44 : ""} ${pillClass("trailing")}`.trim() || undefined}
            style={{ ...pillStyle(false), cursor: "default", ...(isLight ? {} : { borderStyle: "dashed" }) }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {idx + 1}. {label}
              <span className="sr-only">{stepOf(idx + 1)}</span>
            </span>
            {/* the status line's room (no mark: these steps have no status), so every pill is as tall */}
            <span aria-hidden style={{ display: "block", height: "0.57em" }} />
          </button>
        );
      })}
      </div>
    </div>
    <EdgeFades hint={hint} />
    </div>
  );
}

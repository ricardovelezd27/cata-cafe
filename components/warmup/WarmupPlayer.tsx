"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import {
  WARMUP_CLOSING_HOLD_SEC,
  WARMUP_SHARED,
  WARMUP_STEP_PAUSE_SEC,
  lw,
  type WarmupExercise,
  type WarmupFigure as WarmupFigureSpec,
  type WarmupFigureVariant,
} from "@/lib/warmup/exercises";
import { useCountdown } from "@/hooks/useCountdown";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WarmupFigure } from "@/components/warmup/figures";
import s from "./WarmupPlayer.module.css";

/** Chrome strings (messages/*.json `warmup.player`). `{n}`/`{total}`/`{min}`
 *  placeholders are replaced here — pass `t.raw()` for those. */
export interface WarmupPlayerStrings {
  start: string;
  next: string;
  prev: string;
  pause: string;
  resume: string;
  skip: string;
  finish: string;
  close: string;
  /** "Paso {n} de {total}" */
  stepOf: string;
  /** "Quedan {n} segundos" (aria-live) */
  remaining: string;
  pauseTitle: string;
  /** "Siguiente paso en {n} s" */
  pauseBody: string;
  /** "{min} min" */
  minutes: string;
  /** "{count} pasos" */
  stepsCount: string;
  postureLabel: string;
  observeTitle: string;
  closingTitle: string;
  doneTitle: string;
  doneBody: string;
  evolutionLabel: string;
  reducedMotionNote: string;
  pausedLabel: string;
  keyboardHint: string;
  intro: string;
}

export interface WarmupPlayerProps {
  exercise: WarmupExercise;
  locale: string;
  t: WarmupPlayerStrings;
  /** Called from the final screen. */
  onFinish?: () => void;
  /** "Saltar" / close — the user leaves before finishing. */
  onSkip?: () => void;
  /** md:+ only: render inside the page instead of fixed full-screen. */
  inline?: boolean;
  /** Skip the intro screen (session interstitials show their own). */
  autoStart?: boolean;
  className?: string;
}

type Phase =
  | { kind: "intro" }
  | { kind: "step"; i: number }
  | { kind: "pause"; next: number }
  | { kind: "observe" }
  | { kind: "closing" }
  | { kind: "done" };

const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), tpl);

const MemoFigure = memo(WarmupFigure);

const NEUTRAL: Record<WarmupExercise["figureKind"], WarmupFigureSpec> = {
  "arm-raise": { kind: "arm-raise", variant: "slow-open", direction: "center" },
  eyes: { kind: "eyes", variant: "slow-closed", direction: "rest" },
  "head-rotate": { kind: "head-rotate", variant: "slow-open", direction: "rest" },
  "trunk-forward-back": { kind: "trunk-forward-back", variant: "slow-open", direction: "rest" },
  "trunk-side": { kind: "trunk-side", variant: "slow-open", direction: "rest" },
};

export function WarmupPlayer({
  exercise,
  locale,
  t,
  onFinish,
  onSkip,
  inline = false,
  autoStart = false,
  className,
}: WarmupPlayerProps) {
  const reducedMotion = useReducedMotion();
  const steps = exercise.steps;
  const total = steps.length;
  const [phase, setPhase] = useState<Phase>(autoStart ? { kind: "step", i: 0 } : { kind: "intro" });

  // ── Phase → countdown config ────────────────────────────────────────────
  const phaseKey =
    phase.kind === "step"
      ? `step-${phase.i}`
      : phase.kind === "pause"
        ? `pause-${phase.next}`
        : phase.kind;
  const phaseSeconds =
    phase.kind === "step"
      ? steps[phase.i].durationSec
      : phase.kind === "pause"
        ? WARMUP_STEP_PAUSE_SEC
        : phase.kind === "closing"
          ? WARMUP_CLOSING_HOLD_SEC
          : 0;

  const goNext = useCallback(() => {
    setPhase((p) => {
      switch (p.kind) {
        case "intro":
          return { kind: "step", i: 0 };
        case "step":
          return p.i + 1 < total ? { kind: "pause", next: p.i + 1 } : { kind: "observe" };
        case "pause":
          return { kind: "step", i: p.next };
        case "observe":
          return { kind: "closing" };
        case "closing":
          return { kind: "done" };
        case "done":
          return p;
      }
    });
  }, [total]);

  const goPrev = useCallback(() => {
    setPhase((p) => {
      switch (p.kind) {
        case "intro":
          return p;
        case "step":
          return p.i === 0 ? { kind: "intro" } : { kind: "step", i: p.i - 1 };
        case "pause":
          return { kind: "step", i: p.next - 1 };
        case "observe":
          return { kind: "step", i: total - 1 };
        case "closing":
          return { kind: "observe" };
        case "done":
          return { kind: "closing" };
      }
    });
  }, [total]);

  // Reduced motion → no auto-advance (the person taps "Siguiente"); the
  // countdown still runs so the 15 s remain visible.
  const onComplete = useCallback(() => {
    if (reducedMotion) return;
    setPhase((p) => (p.kind === "step" || p.kind === "pause" ? nextOf(p, total) : p));
  }, [reducedMotion, total]);

  // userPaused resets on every phase change on purpose (each step starts running).
  const countdown = useCountdown(phaseSeconds, {
    resetKey: phaseKey,
    autoStart: phaseSeconds > 0,
    onComplete,
  });

  // ── Keyboard (desktop) ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Focus in a form field: leave every key to it (arrows move caret/options).
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      // Space/Enter on a focused button/link/etc. activates THAT control (the
      // Pause button would otherwise toggle twice).
      const onInteractive = !!target?.closest?.('button, a[href], [role="button"], summary, [tabindex]:not([tabindex="-1"])');
      if (onInteractive && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " " && phaseSeconds > 0) {
        e.preventDefault();
        countdown.toggle();
      } else if (e.key === "Escape" && onSkip) {
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, countdown, phaseSeconds, onSkip]);

  // ── Derived display ─────────────────────────────────────────────────────
  const step = phase.kind === "step" ? steps[phase.i] : null;
  const stepIndex =
    phase.kind === "step" ? phase.i : phase.kind === "pause" ? phase.next - 1 : phase.kind === "intro" ? -1 : total;
  // During the 3-s stillness between steps keep the step just finished at its
  // END pose (static) instead of snapping to neutral, so a raised arm stays up.
  const holdStep = phase.kind === "pause" ? (steps[phase.next - 1] ?? null) : null;
  const figureSpec: WarmupFigureSpec = step
    ? step.figure
    : holdStep
      ? holdStep.figure
      : NEUTRAL[exercise.figureKind];
  const figureDuration = step ? step.durationSec : holdStep ? holdStep.durationSec : 0;
  const figureKey = step ? step.id : holdStep ? `hold-${holdStep.id}` : `neutral-${phase.kind}`;
  const variant: WarmupFigureVariant | null = step ? step.figure.variant : null;
  const paused = countdown.paused && phaseSeconds > 0;
  const figurePaused = paused || phase.kind !== "step";

  const stageLabel = variant ? lw(WARMUP_SHARED.evolution.stages[variant], locale) : "";
  const name = lw(exercise.name, locale);

  const evolution = useMemo(
    () => (["fast-open", "slow-open", "slow-closed"] as const).map((v) => ({ v, label: lw(WARMUP_SHARED.evolution.stages[v], locale) })),
    [locale],
  );

  const canPrev = phase.kind !== "intro";
  const isLast = phase.kind === "done";

  return (
    <section
      className={[s.root, inline ? s.inline : "", className ?? ""].join(" ")}
      aria-label={name}
      data-phase={phase.kind}
    >
      <div className={s.inner}>
        {/* ── Figure column ── */}
        <div className={s.figureCol}>
          <div className={s.figureBox}>
            <MemoFigure
              key={figureKey}
              figure={figureSpec}
              durationSec={figureDuration}
              paused={figurePaused}
              reducedMotion={holdStep ? true : undefined}
              title={step ? lw(step.text, locale) : name}
            />
          </div>
          <div className={s.timerRow}>
            <div className={s.timer} aria-hidden>
              {phaseSeconds > 0 ? countdown.remainingSec : "—"}
              {phaseSeconds > 0 && <small>s</small>}
            </div>
            <div className={s.stage}>
              {paused ? t.pausedLabel : phase.kind === "pause" ? t.pauseTitle : stageLabel}
            </div>
          </div>
          <div className={s.bar} aria-hidden>
            {phaseSeconds > 0 && (
              <div
                key={phaseKey}
                className={[s.barFill, paused ? s.paused : ""].join(" ")}
                style={{ "--countdown": `${phaseSeconds}s` } as React.CSSProperties}
              />
            )}
          </div>
          {/* Screen readers: whole seconds, polite, no per-tick figure churn. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {step ? lw(step.text, locale) : ""}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {phaseSeconds > 0 && [10, 5, 3].includes(countdown.remainingSec)
              ? fill(t.remaining, { n: countdown.remainingSec })
              : ""}
          </p>
        </div>

        {/* ── Text column ── */}
        <div className={s.textCol}>
          <header className={s.topbar}>
            <div>
              <p className={s.eyebrow}>
                {phase.kind === "intro"
                  ? lw(WARMUP_SHARED.title, locale)
                  : phase.kind === "step" || phase.kind === "pause"
                    ? fill(t.stepOf, { n: stepIndex + 1, total })
                    : phase.kind === "observe"
                      ? t.observeTitle
                      : phase.kind === "closing"
                        ? t.closingTitle
                        : t.doneTitle}
              </p>
              <div className={s.dots} aria-hidden>
                {steps.map((st, i) => (
                  <span
                    key={st.id}
                    className={[s.dot, i < stepIndex ? s.done : "", i === stepIndex ? s.current : ""].join(" ")}
                  />
                ))}
              </div>
            </div>
            {onSkip && (
              <button type="button" className={s.ghostBtn} onClick={onSkip} aria-label={t.close}>
                <X size={18} aria-hidden />
              </button>
            )}
          </header>

          <div className={s.body}>
            {phase.kind === "intro" && (
              <>
                <h1 className={s.title}>{name}</h1>
                <p className={s.lead}>{lw(exercise.purpose, locale)}</p>
                <p className={s.muted}>
                  {fill(t.minutes, { min: exercise.durationMin })} · {fill(t.stepsCount, { count: total })} ·{" "}
                  {lw(WARMUP_SHARED.posture[exercise.posture], locale)}
                </p>
                <p className={s.kicker}>{t.postureLabel}</p>
                <p className={s.lead}>{lw(exercise.postureText, locale)}</p>
                <p className={s.kicker}>{t.evolutionLabel}</p>
                <div className={s.evolution}>
                  {evolution.map((e) => (
                    <span key={e.v} className={s.chip}>
                      {e.label}
                    </span>
                  ))}
                </div>
                <p className={s.safety}>
                  <strong>{lw(WARMUP_SHARED.safety.title, locale)}.</strong>{" "}
                  {lw(WARMUP_SHARED.safety.text, locale)}
                </p>
                {reducedMotion && <p className={s.muted} style={{ marginTop: 12 }}>{t.reducedMotionNote}</p>}
              </>
            )}

            {phase.kind === "step" && step && (
              <>
                <p className={s.stepText}>{lw(step.text, locale)}</p>
                <div className={s.evolution} aria-label={t.evolutionLabel}>
                  {evolution.map((e) => (
                    <span key={e.v} className={[s.chip, e.v === variant ? s.active : ""].join(" ")}>
                      {e.label}
                    </span>
                  ))}
                </div>
              </>
            )}

            {phase.kind === "pause" && (
              <div className={s.pauseCard}>
                <p className={s.stepText}>{t.pauseTitle}</p>
                <p className={s.muted}>{fill(t.pauseBody, { n: countdown.remainingSec })}</p>
                <p className={s.kicker}>{fill(t.stepOf, { n: phase.next + 1, total })}</p>
                <p className={s.lead}>{lw(steps[phase.next].text, locale)}</p>
              </div>
            )}

            {phase.kind === "observe" && (
              <>
                <h2 className={s.title}>{t.observeTitle}</h2>
                <ul className={s.list}>
                  {exercise.observe.map((o, i) => (
                    <li key={i}>{lw(o, locale)}</li>
                  ))}
                </ul>
              </>
            )}

            {phase.kind === "closing" && (
              <>
                <h2 className={s.title}>{lw(WARMUP_SHARED.closing.title, locale)}</h2>
                <p className={s.lead}>{lw(WARMUP_SHARED.closing.text, locale)}</p>
                {exercise.closing.map((q, i) => (
                  <p key={i} className={s.question}>
                    {i + 1}. {lw(q, locale)}
                  </p>
                ))}
              </>
            )}

            {phase.kind === "done" && (
              <>
                <h2 className={s.title}>{t.doneTitle}</h2>
                <p className={s.lead}>{t.doneBody}</p>
              </>
            )}
          </div>

          <footer className={s.controls}>
            <button
              type="button"
              className={s.iconBtn}
              onClick={goPrev}
              disabled={!canPrev}
              aria-label={t.prev}
            >
              <ChevronLeft size={20} aria-hidden />
            </button>
            {phaseSeconds > 0 && (
              <button
                type="button"
                className={s.iconBtn}
                onClick={countdown.toggle}
                aria-label={countdown.userPaused ? t.resume : t.pause}
                aria-pressed={countdown.userPaused}
              >
                {countdown.userPaused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
              </button>
            )}
            <span className={s.spacer} />
            <span className={s.kbd}>{t.keyboardHint}</span>
            {onSkip && !isLast && (
              <button type="button" className={s.ghostBtn} onClick={onSkip}>
                {t.skip}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-primary-container px-5 text-sm font-medium text-on-primary min-h-[44px] hover:bg-primary transition-colors"
                onClick={onFinish ?? onSkip}
              >
                {t.finish}
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-primary-container px-5 text-sm font-medium text-on-primary min-h-[44px] hover:bg-primary transition-colors"
                onClick={goNext}
              >
                {phase.kind === "intro" ? t.start : t.next}
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </footer>
        </div>
      </div>
    </section>
  );
}

function nextOf(p: Extract<Phase, { kind: "step" | "pause" }>, total: number): Phase {
  if (p.kind === "step") return p.i + 1 < total ? { kind: "pause", next: p.i + 1 } : { kind: "observe" };
  return { kind: "step", i: p.next };
}

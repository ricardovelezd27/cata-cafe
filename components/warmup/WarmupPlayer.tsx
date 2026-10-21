"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import {
  WARMUP_CLOSING_HOLD_SEC,
  WARMUP_HOLD_SEC,
  WARMUP_LEG_SEC,
  WARMUP_SHARED,
  WARMUP_STEP_PAUSE_SEC,
  lw,
  type WarmupExercise,
  type WarmupFigure as WarmupFigureSpec,
  type WarmupStep,
} from "@/lib/warmup/exercises";
import { saveReflection } from "@/lib/warmup/reflections";
import { useCountdown } from "@/hooks/useCountdown";
import { useLocalFlag } from "@/hooks/useLocalFlag";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useWarmupCues } from "@/hooks/useWarmupCues";
import { WarmupFigure } from "@/components/warmup/figures";
import { BreathRing } from "./BreathRing";
import s from "./WarmupPlayer.module.css";

/** Strings added by the v2 player (messages/*.json `warmup.v2`). */
export interface WarmupV2Strings {
  arriveEyebrow: string;
  arriveCue: string;
  arriveReady: string;
  optionsTitle: string;
  soundLabel: string;
  muteLabel: string;
  unmuteLabel: string;
  accessibleLabel: string;
  largeTextLabel: string;
  stillLabel: string;
  stillHelp: string;
  cueTurn: string;
  cueHold: string;
  cueClose: string;
  holdCue: string;
  reflectEyebrow: string;
  reflectTitle: string;
  reflectLead: string;
  answerLabel: string;
  save: string;
  omit: string;
  savedNote: string;
  noticedTitle: string;
  ringLabel: string;
}

/** Chrome strings (messages/*.json `warmup.player` + `warmup.v2`). `{n}`/
 *  `{total}`/`{min}` placeholders are replaced here — pass `t.raw()` for those. */
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
  v2: WarmupV2Strings;
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
  | { kind: "arrive" }
  | { kind: "step"; i: number }
  | { kind: "pause"; next: number }
  | { kind: "closing" }
  | { kind: "reflect" }
  | { kind: "done" };

/** "Llega": a breath, ten seconds, no auto-start. */
const ARRIVE_SEC = 10;
/** Cadence of the whispered "observa" prompts during slow legs. */
const OBSERVE_EVERY_SEC = 5;

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

/** Slow legs carry the whispered "observa" prompts. */
const isSlowLeg = (st: WarmupStep) => st.figure.variant !== "fast-open" && st.durationSec >= WARMUP_LEG_SEC;
/** Out-and-back steps (15 s + 3 s hold + 15 s): chime at the turn-around. */
const isRoundTrip = (st: WarmupStep) =>
  st.figure.variant !== "fast-open" && (!!st.figure.returns || !!st.figure.direction?.includes("-"));

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
  const cues = useWarmupCues();
  const [accessible, setAccessible] = useLocalFlag("cata_warmup_numeral", false);
  const [largeText, setLargeText] = useLocalFlag("cata_warmup_largetext", false);
  const [still, setStill] = useLocalFlag("cata_warmup_still", false);
  const v2 = t.v2;
  const steps = exercise.steps;
  const total = steps.length;
  const [phase, setPhase] = useState<Phase>(autoStart ? { kind: "arrive" } : { kind: "intro" });
  const [answers, setAnswers] = useState<[string, string]>(["", ""]);
  const [saved, setSaved] = useState(false);

  // Reduced motion OR "quieto, solo atiende": nothing moves, nothing advances
  // by itself — the person taps "Siguiente" when ready.
  const manual = reducedMotion || still;
  const showNumeral = reducedMotion || accessible;

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
          : phase.kind === "arrive"
            ? ARRIVE_SEC
            : 0;

  const goNext = useCallback(() => {
    setPhase((p) => {
      switch (p.kind) {
        case "intro":
          return { kind: "arrive" };
        case "arrive":
          return { kind: "step", i: 0 };
        case "step":
          return p.i + 1 < total ? { kind: "pause", next: p.i + 1 } : { kind: "closing" };
        case "pause":
          return { kind: "step", i: p.next };
        case "closing":
          return { kind: "reflect" };
        case "reflect":
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
        case "arrive":
          return { kind: "intro" };
        case "step":
          return p.i === 0 ? { kind: "arrive" } : { kind: "step", i: p.i - 1 };
        case "pause":
          return { kind: "step", i: p.next - 1 };
        case "closing":
          return { kind: "step", i: total - 1 };
        case "reflect":
          return { kind: "closing" };
        case "done":
          return { kind: "reflect" };
      }
    });
  }, [total]);

  // Steps, pauses and the closing hold advance on their own unless the person
  // asked for the still / reduced-motion variant. "Llega" never auto-starts.
  const onComplete = useCallback(() => {
    if (manual) return;
    setPhase((p) => (p.kind === "step" || p.kind === "pause" || p.kind === "closing" ? nextOf(p, total) : p));
  }, [manual, total]);

  // userPaused resets on every phase change on purpose (each step starts running).
  const countdown = useCountdown(phaseSeconds, {
    resetKey: phaseKey,
    autoStart: phaseSeconds > 0,
    onComplete,
  });

  const step = phase.kind === "step" ? steps[phase.i] : null;
  const elapsed = phaseSeconds - countdown.remainingSec;
  const turnAt = step && isRoundTrip(step) ? WARMUP_LEG_SEC : null;
  const holdEndAt = step
    ? turnAt !== null
      ? WARMUP_LEG_SEC + WARMUP_HOLD_SEC
      : step.figure.holdBeforeSec
        ? step.figure.holdBeforeSec
        : null
    : null;

  // ── Cues: chime / voice / haptic ────────────────────────────────────────
  const firedRef = useRef<Set<string>>(new Set());
  const { cue, voice, stopVoice } = cues;
  useEffect(() => {
    const fire = (id: string, run: () => void) => {
      const key = `${phaseKey}:${id}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      run();
    };
    if (phase.kind === "step" && step) {
      fire("start", () => {
        cue("start");
        voice(exercise.slug, step.id);
      });
      if (turnAt !== null && elapsed >= turnAt) fire("turn", () => cue("turn"));
      if (holdEndAt !== null && elapsed >= holdEndAt) fire("holdEnd", () => cue("holdEnd"));
    } else if (phase.kind === "reflect") {
      fire("close", () => cue("close"));
    }
  }, [phase.kind, phaseKey, step, elapsed, turnAt, holdEndAt, cue, voice, exercise.slug]);

  // Voice is tied to its step: leaving the step or pausing stops it.
  useEffect(() => {
    if (phase.kind !== "step" || countdown.userPaused) stopVoice();
  }, [phase.kind, phaseKey, countdown.userPaused, stopVoice]);
  useEffect(() => stopVoice, [stopVoice]);

  const advance = useCallback(() => {
    cues.unlock();
    goNext();
  }, [cues, goNext]);

  // ── Keyboard (desktop) ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Focus in a form field: leave every key to it (arrows move caret/options).
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      // Space/Enter on a focused button/link/etc. activates THAT control (the
      // Pause button would otherwise toggle twice).
      const onInteractive = !!target?.closest?.('button, a[href], [role="button"], [role="switch"], summary, [tabindex]:not([tabindex="-1"])');
      if (onInteractive && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (phase.kind !== "reflect") advance();
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
  }, [advance, goPrev, countdown, phaseSeconds, onSkip, phase.kind]);

  // ── Derived display ─────────────────────────────────────────────────────
  const stepIndex =
    phase.kind === "step"
      ? phase.i
      : phase.kind === "pause"
        ? phase.next - 1
        : phase.kind === "intro" || phase.kind === "arrive"
          ? -1
          : total;
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
  const paused = countdown.paused && phaseSeconds > 0;
  const figurePaused = paused || phase.kind !== "step";
  const eyesClosed = (step ?? holdStep)?.figure.variant === "slow-closed";

  const name = lw(exercise.name, locale);
  const cueText =
    phase.kind === "step" && step
      ? lw(step.text, locale)
      : phase.kind === "pause"
        ? lw(steps[phase.next].text, locale)
        : phase.kind === "arrive"
          ? v2.arriveCue
          : phase.kind === "closing"
            ? v2.holdCue
            : "";

  // One whispered "observa" prompt at a time, every ~5 s of a slow leg.
  const whisperIdx =
    step && isSlowLeg(step) && exercise.observe.length > 0 ? Math.floor(elapsed / OBSERVE_EVERY_SEC) - 1 : -1;
  const whisper = whisperIdx >= 0 ? lw(exercise.observe[whisperIdx % exercise.observe.length], locale) : "";

  // Every cue mirrored as text for screen readers (derived, not stored).
  const liveCue =
    phase.kind === "step" && step
      ? turnAt !== null && elapsed >= turnAt && elapsed < (holdEndAt ?? turnAt + 1)
        ? v2.cueTurn
        : holdEndAt !== null && elapsed >= holdEndAt && elapsed < holdEndAt + 2
          ? v2.cueHold
          : lw(step.text, locale)
      : phase.kind === "closing"
        ? v2.cueClose
        : phase.kind === "arrive"
          ? v2.arriveCue
          : phase.kind === "reflect"
            ? v2.reflectTitle
            : "";

  const evolution = useMemo(
    () => (["fast-open", "slow-open", "slow-closed"] as const).map((v) => ({ v, label: lw(WARMUP_SHARED.evolution.stages[v], locale) })),
    [locale],
  );

  const canPrev = phase.kind !== "intro";
  const isLast = phase.kind === "done";
  const eyebrow =
    phase.kind === "intro"
      ? lw(WARMUP_SHARED.title, locale)
      : phase.kind === "arrive"
        ? v2.arriveEyebrow
        : phase.kind === "step"
          ? fill(t.stepOf, { n: stepIndex + 1, total })
          : phase.kind === "pause"
            ? t.pauseTitle
            : phase.kind === "closing"
              ? t.closingTitle
              : phase.kind === "reflect"
                ? v2.reflectEyebrow
                : t.doneTitle;

  const submitReflection = (keep: boolean) => {
    if (keep) setSaved(saveReflection(exercise.id, answers));
    setPhase({ kind: "done" });
  };

  const primaryLabel =
    phase.kind === "intro" ? t.start : phase.kind === "arrive" ? v2.arriveReady : t.next;

  return (
    <section
      className={[s.root, inline ? s.inline : "", largeText ? s.large : "", className ?? ""].join(" ")}
      aria-label={name}
      data-phase={phase.kind}
    >
      <div className={s.inner}>
        {/* ── Figure column: breathing ring behind a silhouette ── */}
        <div className={s.figureCol}>
          <div className={s.stage}>
            <BreathRing
              durationSec={phaseSeconds}
              remainingSec={countdown.remainingSec}
              runKey={phaseKey}
              paused={paused}
              glow={eyesClosed}
            />
            <div className={[s.figureBox, eyesClosed ? s.dim : ""].join(" ")}>
              <MemoFigure
                key={figureKey}
                figure={figureSpec}
                durationSec={figureDuration}
                paused={figurePaused}
                highlight={phase.kind === "step"}
                reducedMotion={holdStep || still ? true : undefined}
                title={step ? lw(step.text, locale) : name}
              />
            </div>
          </div>
          {showNumeral && (
            <div className={s.numeral} aria-hidden>
              {phaseSeconds > 0 ? countdown.remainingSec : "—"}
              {phaseSeconds > 0 && <small>s</small>}
            </div>
          )}
          {/* Screen readers: every cue as polite text, whole seconds only at 10/5/3. */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {liveCue}
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
              <p className={s.eyebrow}>{eyebrow}</p>
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

          <div className={[s.body, phase.kind === "intro" || phase.kind === "reflect" || phase.kind === "done" ? "" : s.bodyCentered].join(" ")}>
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
                <p className={s.kicker}>{v2.optionsTitle}</p>
                <div className={s.options}>
                  <Switch label={v2.soundLabel} checked={!cues.muted} onChange={(on) => cues.setMuted(!on)} />
                  <Switch label={v2.accessibleLabel} checked={accessible} onChange={setAccessible} />
                  <Switch label={v2.largeTextLabel} checked={largeText} onChange={setLargeText} />
                  <Switch label={v2.stillLabel} hint={v2.stillHelp} checked={still} onChange={setStill} />
                </div>
                {reducedMotion && <p className={s.muted} style={{ marginTop: 12 }}>{t.reducedMotionNote}</p>}
              </>
            )}

            {(phase.kind === "step" || phase.kind === "pause" || phase.kind === "arrive" || phase.kind === "closing") && (
              <>
                <p
                  key={`${phaseKey}-cue`}
                  className={[s.cue, phase.kind === "pause" ? s.cueMuted : "", s.fadeIn].join(" ")}
                >
                  {cueText}
                </p>
                {phase.kind === "step" && (
                  <p className={s.whisperSlot} aria-live="polite">
                    {whisper && (
                      <span key={whisperIdx} className={s.whisper}>
                        {whisper}
                      </span>
                    )}
                  </p>
                )}
              </>
            )}

            {phase.kind === "reflect" && (
              <form
                className={s.reflect}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitReflection(true);
                }}
              >
                <h2 className={s.title}>{v2.reflectTitle}</h2>
                <p className={s.muted}>{v2.reflectLead}</p>
                {exercise.closing.map((q, i) => (
                  <div key={i} className={s.field}>
                    <label className={s.question} htmlFor={`warmup-reflect-${i}`}>
                      {lw(q, locale)}
                    </label>
                    <textarea
                      id={`warmup-reflect-${i}`}
                      className={s.textarea}
                      rows={3}
                      maxLength={2000}
                      value={answers[i]}
                      placeholder={v2.answerLabel}
                      onChange={(e) =>
                        setAnswers((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))
                      }
                    />
                  </div>
                ))}
                <div className={s.reflectActions}>
                  <button type="button" className={s.ghostBtn} onClick={() => submitReflection(false)}>
                    {v2.omit}
                  </button>
                  <button type="submit" className={s.primaryBtn}>
                    {v2.save}
                  </button>
                </div>
              </form>
            )}

            {phase.kind === "done" && (
              <>
                <h2 className={s.title}>{t.doneTitle}</h2>
                <p className={s.lead}>{t.doneBody}</p>
                {saved && <p className={s.savedNote}>{v2.savedNote}</p>}
                {exercise.observe.length > 0 && (
                  <>
                    <p className={s.kicker}>{v2.noticedTitle}</p>
                    <ul className={s.list}>
                      {exercise.observe.map((o, i) => (
                        <li key={i}>{lw(o, locale)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>

          {phase.kind !== "reflect" && (
            <footer className={s.controls}>
              <button
                type="button"
                className={[s.iconBtn, s.prevBtn].join(" ")}
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
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => cues.setMuted(!cues.muted)}
                aria-label={cues.muted ? v2.unmuteLabel : v2.muteLabel}
                aria-pressed={cues.muted}
              >
                {cues.muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
              </button>
              <span className={s.spacer} />
              <span className={s.kbd}>{t.keyboardHint}</span>
              {onSkip && !isLast && (
                <button type="button" className={s.ghostBtn} onClick={onSkip}>
                  {t.skip}
                </button>
              )}
              {isLast ? (
                <button type="button" className={s.primaryBtn} onClick={onFinish ?? onSkip}>
                  {t.finish}
                </button>
              ) : (
                <button type="button" className={s.primaryBtn} onClick={advance}>
                  {primaryLabel}
                  <ChevronRight size={16} aria-hidden />
                </button>
              )}
            </footer>
          )}
        </div>
      </div>
    </section>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={s.switchRow} onClick={() => onChange(!checked)}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{label}</span>
        {hint && <span className={s.switchHint}>{hint}</span>}
      </span>
      <span className={[s.switchTrack, checked ? s.switchOn : ""].join(" ")} aria-hidden>
        <span className={s.switchThumb} />
      </span>
    </button>
  );
}

function nextOf(p: Extract<Phase, { kind: "step" | "pause" | "closing" }>, total: number): Phase {
  if (p.kind === "closing") return { kind: "reflect" };
  if (p.kind === "step") return p.i + 1 < total ? { kind: "pause", next: p.i + 1 } : { kind: "closing" };
  return { kind: "step", i: p.next };
}

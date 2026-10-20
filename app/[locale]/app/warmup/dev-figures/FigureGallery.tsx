"use client";

import { useState } from "react";
import {
  WARMUP_EN_STATUS,
  WARMUP_EXERCISES,
  WARMUP_SHARED,
  lw,
  type WarmupFigure as WarmupFigureSpec,
  type WarmupFigureVariant,
} from "@/lib/warmup/exercises";
import { WarmupFigure } from "@/components/warmup/figures";

const VARIANTS: WarmupFigureVariant[] = ["fast-open", "slow-open", "slow-closed"];

/** Representative descriptor per kind × variant (first matching step). */
function pick(kind: string, variant: WarmupFigureVariant): { figure: WarmupFigureSpec; durationSec: number; label: string } {
  const ex = WARMUP_EXERCISES.find((e) => e.figureKind === kind)!;
  const step =
    ex.steps.find((s) => s.figure.variant === variant && s.figure.direction !== "rest") ??
    ex.steps.find((s) => s.figure.variant === variant);
  if (step) return { figure: step.figure, durationSec: step.durationSec, label: step.id };
  // The eyes exercise has no open-eyes steps; synthesise one for review.
  const base = ex.steps[1] ?? ex.steps[0];
  return { figure: { ...base.figure, variant }, durationSec: base.durationSec, label: `${base.id} (synthetic)` };
}

export function FigureGallery({ locale }: { locale: string }) {
  const [epoch, setEpoch] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stepsMode, setStepsMode] = useState(false);

  const btn =
    "rounded-pill border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            dev · figures review
          </p>
          <h1 className="font-display text-3xl text-primary-container">
            {lw(WARMUP_SHARED.title, locale)} — figuras
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            EN: {WARMUP_EN_STATUS}. Speed ×{speed}. Mirror semantics: “derecha” = viewer&apos;s right.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setEpoch((e) => e + 1)}>
            Replay
          </button>
          <button type="button" className={btn} aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className={btn} aria-pressed={reduced} onClick={() => setReduced((v) => !v)}>
            Reduced motion: {reduced ? "on" : "off"}
          </button>
          <button type="button" className={btn} aria-pressed={stepsMode} onClick={() => setStepsMode((v) => !v)}>
            {stepsMode ? "Kinds × variants" : "Every step"}
          </button>
          <select
            className={btn}
            value={speed}
            onChange={(e) => {
              setSpeed(Number(e.target.value));
              setEpoch((v) => v + 1);
            }}
            aria-label="speed"
          >
            {[1, 3, 10].map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!stepsMode ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {WARMUP_EXERCISES.map((ex) =>
            VARIANTS.map((variant) => {
              const { figure, durationSec, label } = pick(ex.figureKind, variant);
              return (
                <figure
                  key={`${ex.id}-${variant}-${epoch}`}
                  className="rounded-card border border-outline-variant bg-surface-container-lowest p-4"
                >
                  <div className="aspect-[3/4] max-h-[320px] w-full">
                    <WarmupFigure
                      figure={figure}
                      durationSec={durationSec / speed}
                      paused={paused}
                      reducedMotion={reduced}
                      title={`${lw(ex.name, locale)} · ${lw(WARMUP_SHARED.evolution.stages[variant], locale)}`}
                    />
                  </div>
                  <figcaption className="mt-3 text-xs text-on-surface-variant">
                    <span className="font-semibold text-on-surface">
                      {ex.order}. {lw(ex.name, locale)}
                    </span>{" "}
                    · {lw(WARMUP_SHARED.evolution.stages[variant], locale)} · {label} · {durationSec}s
                    {figure.direction ? ` · ${figure.direction}` : ""}
                    {figure.lead ? ` · lead:${figure.lead}` : ""}
                  </figcaption>
                </figure>
              );
            }),
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {WARMUP_EXERCISES.map((ex) => (
            <section key={ex.id} className="space-y-3">
              <h2 className="font-display text-xl text-primary-container">
                {ex.order}. {lw(ex.name, locale)}
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {ex.steps.map((step, i) => (
                  <figure
                    key={`${step.id}-${epoch}`}
                    className="rounded-card border border-outline-variant bg-surface-container-lowest p-3"
                  >
                    <div className="aspect-[3/4] w-full">
                      <WarmupFigure
                        figure={step.figure}
                        durationSec={step.durationSec / speed}
                        paused={paused}
                        reducedMotion={reduced}
                      />
                    </div>
                    <figcaption className="mt-2 text-[11px] leading-snug text-on-surface-variant">
                      <span className="font-semibold text-on-surface">{i + 1}.</span>{" "}
                      {lw(step.text, locale)}
                      <br />
                      <span className="tabular-nums">
                        {step.durationSec}s · {step.figure.variant}
                        {step.figure.direction ? ` · ${step.figure.direction}` : ""}
                        {step.figure.lead ? ` · ${step.figure.lead}` : ""}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

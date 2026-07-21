"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AFFECTIVE_MAX,
  AFFECTIVE_MIN,
  CUPPERS,
  cupperScore,
  cvaScore,
  DEFAULT_USER_SCORE,
  groupSpread,
  REFERENCE,
  SCORE_STEP,
  type Cupper,
} from "./calibration-data";

type Labels = {
  title: string;
  scoreLabel: string;
  scoreAria: string; // contains {score}
  scorePoints: string;
  referenceLabel: string;
  groupLabel: string;
  spreadLabel: string;
  spreadUnit: string;
  cvaLabel: string;
  cuppers: Record<Cupper["key"], string>;
  source: string;
  disclaimer: string;
};

const DEMO_DELAY = 650; // after the hero entrance settles
const DEMO_DURATION = 3000; // one calibration round, ~3s
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

// Position of an affective value (1–9) as a percentage of the track width.
const pct = (value: number) =>
  ((value - AFFECTIVE_MIN) / (AFFECTIVE_MAX - AFFECTIVE_MIN)) * 100;

export default function CalibrationWidget({
  locale,
  labels,
}: {
  locale: string;
  labels: Labels;
}) {
  // Initial state = the CONVERGED end of the round (progress 1, user at the
  // reference). First paint / hydration therefore shows the settled state with
  // stable text width → zero layout shift. The demo then rewinds to the start
  // and glides back. Mirrors PriceBandWidget, whose initial score is the demo
  // DESTINATION, not its origin.
  const [progress, setProgress] = useState(1); // 0 = scattered, 1 = converged
  const [score, setScore] = useState(REFERENCE); // the visitor's own value
  // idle → running → done (demo finished) | user (visitor took over).
  // With reduced motion the demo never arms; "user" and "idle" render
  // identically (both leave progress/score at their converged initial values),
  // so hydration stays consistent.
  const [demo, setDemo] = useState<"idle" | "running" | "done" | "user">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "user"
      : "idle",
  );
  const demoCancelled = useRef(false);
  const uid = useId();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    demoCancelled.current = false;
    let raf = 0;
    const t0 = performance.now() + DEMO_DELAY;
    const tick = (now: number) => {
      if (demoCancelled.current) return;
      const t = Math.min(1, Math.max(0, (now - t0) / DEMO_DURATION));
      if (t > 0) {
        setDemo("running");
        const p = easeOutQuart(t);
        setProgress(p);
        // Sweep the visitor's own dot from its scattered start toward the
        // instructor reference, snapped to the slider step.
        const v = DEFAULT_USER_SCORE + (REFERENCE - DEFAULT_USER_SCORE) * p;
        setScore(Math.round(v / SCORE_STEP) * SCORE_STEP);
      }
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDemo("done");
    };
    raf = requestAnimationFrame(tick);
    return () => {
      demoCancelled.current = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // The user taking over cancels the demo instantly, without the pulse.
  // Student dots stay wherever the round left them.
  const takeOver = () => {
    demoCancelled.current = true;
    setDemo("user");
  };

  const running = demo === "running";

  const studentScores = CUPPERS.map((c) => cupperScore(c, progress));
  const spread = groupSpread(studentScores);
  const cva = cvaScore(score);

  const nf = (min: number, max: number) =>
    new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });

  const scoreFmt = nf(score % 1 !== 0 ? 1 : 0, 2).format(score);
  const spreadFmt = nf(1, 1).format(spread);
  const cvaFmt = nf(1, 1).format(cva);
  const userPct = pct(score);
  const refPct = pct(REFERENCE);

  return (
    <div className="rounded-[2rem] bg-surface border border-outline-variant/60 shadow-[0_24px_60px_-24px_rgba(21,53,38,0.45)] p-6 sm:p-8 text-on-surface">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
        {labels.title}
      </p>

      {/* Legend for the terracotta cohort — meaningful, so outside the
          aria-hidden track. */}
      <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full border-2 border-surface bg-secondary"
        />
        <span>{labels.groupLabel}</span>
      </div>

      {/* Track visualization — decorative, values are conveyed by the slider
          and the payoff readout below. */}
      <div className="mt-3" aria-hidden="true">
        <div className="relative h-16">
          {/* baseline axis */}
          <div className="absolute inset-x-0 top-8 h-[3px] rounded-full bg-surface-container-high" />

          {/* instructor reference marker */}
          <div
            className="absolute top-3 bottom-4 w-[2px] -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${refPct}%` }}
          />
          <span
            className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"
            style={{ left: `${refPct}%` }}
          >
            {labels.referenceLabel}
          </span>

          {/* five student dots (terracotta), eased so the round reads smooth */}
          {CUPPERS.map((c, i) => (
            <span
              key={c.key}
              title={labels.cuppers[c.key]}
              className="absolute top-8 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-secondary shadow-[0_1px_4px_rgba(21,53,38,0.35)]"
              style={{
                left: `${pct(studentScores[i])}%`,
                transition: "left 300ms ease",
              }}
            />
          ))}

          {/* the visitor's own dot — larger, ringed, bound to the slider */}
          <span
            className="absolute top-8 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-primary-container shadow-[0_2px_8px_rgba(21,53,38,0.4)]"
            style={{ left: `${userPct}%`, transition: "left 300ms ease" }}
          />
        </div>

        {/* axis ticks at 1 / 5 / 9 */}
        <div className="relative mt-1 h-4 text-[11px] tabular-nums text-on-surface-variant/70">
          <span className="absolute left-0">{AFFECTIVE_MIN}</span>
          <span className="absolute left-1/2 -translate-x-1/2">
            {(AFFECTIVE_MIN + AFFECTIVE_MAX) / 2}
          </span>
          <span className="absolute right-0">{AFFECTIVE_MAX}</span>
        </div>
      </div>

      {/* Slider — the visitor's own score */}
      <div className="mt-5">
        <div className="flex items-end justify-between gap-4">
          <label
            htmlFor={`${uid}-score`}
            className="text-sm font-medium text-on-surface-variant"
          >
            {labels.scoreLabel}
          </label>
          <p className="min-w-[2ch] text-right font-serif tabular-nums leading-none text-[40px] sm:text-[48px] text-primary">
            {scoreFmt}
            <span className="ml-2 align-baseline font-sans text-xs font-medium tracking-wide text-on-surface-variant">
              {labels.scorePoints}
            </span>
          </p>
        </div>
        <input
          id={`${uid}-score`}
          type="range"
          min={AFFECTIVE_MIN}
          max={AFFECTIVE_MAX}
          step={SCORE_STEP}
          value={score}
          onChange={(e) => {
            takeOver();
            setScore(Number(e.target.value));
          }}
          onPointerDown={takeOver}
          onKeyDown={takeOver}
          aria-valuetext={labels.scoreAria.replace("{score}", scoreFmt)}
          className={`landing-range mt-3 w-full ${demo === "done" ? "demo-pulse" : ""}`}
          style={{ "--fill": `${userPct}%` } as React.CSSProperties}
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-on-surface-variant/70">
          <span>{AFFECTIVE_MIN}</span>
          <span>{AFFECTIVE_MAX}</span>
        </div>
      </div>

      {/* Payoff readout — the two figures the calibration produces */}
      <div
        className={`mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-primary text-center transition-opacity duration-300 ${
          running ? "opacity-70" : "opacity-100"
        } ${demo === "done" ? "band-settle" : ""}`}
      >
        <div className="px-4 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed-dim">
            {labels.spreadLabel}
          </p>
          <p
            aria-live={running ? "off" : "polite"}
            className="mt-1.5 font-serif tabular-nums text-3xl sm:text-[34px] sm:leading-tight text-surface"
          >
            ±{spreadFmt}
            <span className="ml-1 font-sans text-sm text-primary-fixed-dim">
              {labels.spreadUnit}
            </span>
          </p>
        </div>
        <div className="border-l border-surface/15 px-4 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed-dim">
            {labels.cvaLabel}
          </p>
          <p
            aria-live={running ? "off" : "polite"}
            className="mt-1.5 font-serif tabular-nums text-3xl sm:text-[34px] sm:leading-tight text-surface"
          >
            ≈&thinsp;{cvaFmt}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">
        {labels.source}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant/80">
        {labels.disclaimer}
      </p>
    </div>
  );
}

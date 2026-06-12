"use client";

import { useId, useState } from "react";
import {
  calcPriceBand,
  ORIGIN_KEYS,
  PROCESS_KEYS,
  SCORE_DEFAULT,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  type OriginKey,
  type ProcessKey,
} from "./price-bands";

type Labels = {
  title: string;
  scoreLabel: string;
  scoreAria: string; // contains {score}
  scorePoints: string;
  originLabel: string;
  processLabel: string;
  origins: Record<OriginKey, string>;
  processes: Record<ProcessKey, string>;
  bandLabel: string;
  perKg: string;
  source: string;
  disclaimer: string;
};

export default function PriceBandWidget({
  locale,
  labels,
}: {
  locale: string;
  labels: Labels;
}) {
  const [score, setScore] = useState(SCORE_DEFAULT);
  const [origin, setOrigin] = useState<OriginKey>("colombia");
  const [process, setProcess] = useState<ProcessKey>("lavado");
  const uid = useId();

  const band = calcPriceBand(score, origin, process);
  const eur = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const scoreFmt = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    minimumFractionDigits: score % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(score);

  const pct = ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;

  return (
    <div className="rounded-[2rem] bg-surface border border-outline-variant/60 shadow-[0_24px_60px_-24px_rgba(21,53,38,0.45)] p-6 sm:p-8 text-on-surface">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
        {labels.title}
      </p>

      {/* Score */}
      <div className="mt-5">
        <div className="flex items-end justify-between gap-4">
          <label
            htmlFor={`${uid}-score`}
            className="text-sm font-medium text-on-surface-variant"
          >
            {labels.scoreLabel}
          </label>
          <p className="font-serif tabular-nums leading-none text-[56px] sm:text-[64px] text-primary">
            {scoreFmt}
            <span className="ml-2 align-baseline font-sans text-xs font-medium tracking-wide text-on-surface-variant">
              {labels.scorePoints}
            </span>
          </p>
        </div>
        <input
          id={`${uid}-score`}
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={SCORE_STEP}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          aria-valuetext={labels.scoreAria.replace("{score}", scoreFmt)}
          className="landing-range mt-3 w-full"
          style={{ "--fill": `${pct}%` } as React.CSSProperties}
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-on-surface-variant/70">
          <span>{SCORE_MIN}</span>
          <span>{SCORE_MAX}</span>
        </div>
      </div>

      {/* Origin + process */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor={`${uid}-origin`}
            className="block text-sm font-medium text-on-surface-variant"
          >
            {labels.originLabel}
          </label>
          <select
            id={`${uid}-origin`}
            value={origin}
            onChange={(e) => setOrigin(e.target.value as OriginKey)}
            className="mt-1.5 w-full appearance-none rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
          >
            {ORIGIN_KEYS.map((k) => (
              <option key={k} value={k}>
                {labels.origins[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`${uid}-process`}
            className="block text-sm font-medium text-on-surface-variant"
          >
            {labels.processLabel}
          </label>
          <select
            id={`${uid}-process`}
            value={process}
            onChange={(e) => setProcess(e.target.value as ProcessKey)}
            className="mt-1.5 w-full appearance-none rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
          >
            {PROCESS_KEYS.map((k) => (
              <option key={k} value={k}>
                {labels.processes[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Band readout */}
      <div className="mt-6 rounded-2xl bg-primary px-5 py-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-fixed-dim">
          {labels.bandLabel}
        </p>
        <p
          aria-live="polite"
          className="mt-1.5 font-serif tabular-nums text-3xl sm:text-4xl text-surface"
        >
          {eur.format(band.low)}&thinsp;–&thinsp;{eur.format(band.high)}
          <span className="ml-1 font-sans text-sm text-primary-fixed-dim">
            {labels.perKg}
          </span>
        </p>
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

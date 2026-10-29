"use client";

import { useState, type Ref } from "react";
import s from "./StepProgress.module.css";

/**
 * ONE bar for the whole exercise (v3.2 — replaces the segmented per-step
 * bar whose gaps and dot clusters read as noise). React renders the frame
 * and the label; the player drives the fill per frame WITHOUT re-rendering,
 * through this DOM contract (scoped to the `ref` root):
 *
 *  - `[data-bar-fill]`  set `style.setProperty("--p", u)`, u in 0..1 =
 *    elapsed / total of the run;
 *  - `[data-halo]`      set `data-fire="1"` to play the turn halo at the fill
 *    head (700 ms), then remove the attribute so it can fire again.
 */
export interface StepProgressProps {
  /** Word under the bar for what is happening now ("SUBE", "PARA", …). */
  label: string;
  /** Override text (e.g. "EN PAUSA"). */
  holdLabel?: string;
  paused?: boolean;
  /** "Accesible": remaining whole seconds of the current segment; null hides. */
  seconds?: number | null;
  dusk?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function StepProgress({ label, holdLabel, paused = false, seconds = null, dusk = false, ref }: StepProgressProps) {
  const text = holdLabel ?? label;
  const showSeconds = typeof seconds === "number" && Number.isFinite(seconds);
  // Keep the previous word one render longer so it fades out under the new
  // one (state derived during render, no effect) — a label swap must never
  // snap, the whole run is meant to feel continuous.
  const [labels, setLabels] = useState({ cur: text, prev: null as string | null, n: 0 });
  if (labels.cur !== text) setLabels({ cur: text, prev: labels.cur, n: labels.n + 1 });

  return (
    <div
      ref={ref}
      className={[s.root, dusk ? s.dusk : "", paused ? s.paused : ""].join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={text || undefined}
    >
      <div className={s.track}>
        <div className={s.fill} data-bar-fill="" />
        <span className={s.halo} data-halo="" aria-hidden />
      </div>
      <div className={[s.labelRow, showSeconds ? s.withSeconds : ""].join(" ")} aria-hidden>
        <span className={s.labelBox}>
          {labels.prev !== null && labels.prev !== labels.cur && (
            <span key={`${labels.n - 1}:${labels.prev}`} className={`${s.label} ${s.out}`}>
              {labels.prev}
            </span>
          )}
          <span key={`${labels.n}:${labels.cur}`} className={`${s.label} ${labels.n > 0 ? s.in : ""}`}>
            {labels.cur}
          </span>
        </span>
        {showSeconds && <span className={s.seconds}>{Math.max(0, Math.ceil(seconds))}</span>}
      </div>
    </div>
  );
}

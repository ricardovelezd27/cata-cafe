"use client";

import type { CSSProperties, Ref } from "react";
import type { Segment, SegmentLabel } from "@/lib/warmup/timelineTypes";
import s from "./StepProgress.module.css";

/**
 * Segmented progress bar under the figure (replaces the ring). React renders
 * the structure and the label; the player drives progress per frame WITHOUT
 * re-rendering, through this DOM contract (scoped to the `ref` root):
 *
 *  - `[data-seg-fill="i"]`  set `style.setProperty("--p", u)`, u in 0..1
 *    (setting --p on the track `[data-seg="i"]` works too: the fill inherits
 *    it, and the halo then follows the head instead of sitting at the end);
 *  - `[data-hold-dot="i-k"]` (k = 0..2) set / remove `data-lit="1"`;
 *  - `[data-halo="i"]`       set `data-fire="1"` to play the turn halo
 *    (700 ms), then remove the attribute so it can fire again.
 */
export interface StepProgressProps {
  /** The CURRENT step's segments, in order. */
  segments: readonly Segment[];
  /** Index into `segments`; -1 = none. */
  activeIdx: number;
  labels: Record<SegmentLabel, string>;
  /** Override text for the active segment (e.g. "EN PAUSA"). */
  holdLabel?: string;
  paused?: boolean;
  /** "Accesible": remaining whole seconds of the active segment; null hides. */
  seconds?: number | null;
  dusk?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const DOTS = [0, 1, 2] as const;

function HoldCluster({ i }: { i: number }) {
  return (
    <div className={s.hold} data-hold={i}>
      {DOTS.map((k) => (
        <span key={k} className={s.dot} data-hold-dot={`${i}-${k}`} />
      ))}
    </div>
  );
}

function Track({ i, durMs, active }: { i: number; durMs: number; active: boolean }) {
  return (
    <div
      className={s.track}
      data-seg={i}
      data-active={active ? "1" : undefined}
      style={{ flexGrow: Math.max(1, durMs) } as CSSProperties}
    >
      <div className={s.fill} data-seg-fill={i} />
      <span className={s.halo} data-halo={i} aria-hidden />
    </div>
  );
}

export function StepProgress({
  segments,
  activeIdx,
  labels,
  holdLabel,
  paused = false,
  seconds = null,
  dusk = false,
  ref,
}: StepProgressProps) {
  const active = activeIdx >= 0 ? segments[activeIdx] : undefined;
  const label = holdLabel ?? (active ? labels[active.label] : "");
  const showSeconds = typeof seconds === "number" && Number.isFinite(seconds);

  return (
    <div
      ref={ref}
      className={[s.root, dusk ? s.dusk : "", paused ? s.paused : ""].join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={segments.length}
      aria-valuenow={Math.max(0, activeIdx + 1)}
      aria-valuetext={label || undefined}
    >
      <div className={s.bar}>
        {segments.map((seg, i) => {
          if (seg.kind === "hold") return <HoldCluster key={i} i={i} />;
          const folded = seg.kind === "read" && seg.foldedHoldMs ? Math.min(seg.foldedHoldMs, seg.durMs) : 0;
          if (folded > 0) {
            return [
              <Track key={`${i}-t`} i={i} durMs={seg.durMs - folded} active={i === activeIdx} />,
              <HoldCluster key={`${i}-h`} i={i} />,
            ];
          }
          return <Track key={i} i={i} durMs={seg.durMs} active={i === activeIdx} />;
        })}
      </div>
      <div className={[s.labelRow, showSeconds ? s.withSeconds : ""].join(" ")} aria-hidden>
        <span className={s.label}>{label}</span>
        {showSeconds && <span className={s.seconds}>{Math.max(0, Math.ceil(seconds))}</span>}
      </div>
    </div>
  );
}

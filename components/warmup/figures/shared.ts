import type { CSSProperties } from "react";
import type { WarmupFigure as WarmupFigureSpec } from "@/lib/warmup/exercises";

/** Props every figure accepts: the content descriptor flattened + playback. */
export interface FigureProps extends Omit<WarmupFigureSpec, "kind"> {
  /** Seconds the step runs (the animation fills it, minus `holdBeforeSec`). */
  durationSec: number;
  paused?: boolean;
  /** Static end-pose + arrow, no animation (prefers-reduced-motion). */
  reducedMotion?: boolean;
  title?: string;
  className?: string;
}

const SMALL_AMP = 0.18;

/** CSS custom properties for figures.module.css timing. "Un par de veces"
 *  (fast, round trip) = two iterations of half the step. */
export function timingStyle(p: FigureProps, roundTrip: boolean): CSSProperties {
  const fast = p.variant === "fast-open";
  const iterations = fast && roundTrip ? 2 : 1;
  const hold = p.holdBeforeSec ?? 0;
  const duration = Math.max(0.2, (p.durationSec - hold) / iterations);
  return {
    "--warmup-duration": `${duration}s`,
    "--warmup-delay": `${hold}s`,
    "--warmup-iterations": iterations,
    "--warmup-ease": fast ? "ease-in-out" : "linear",
    "--warmup-amp": p.amplitude === "small" ? SMALL_AMP : 1,
  } as CSSProperties;
}

export function ampOf(p: FigureProps): number {
  return p.amplitude === "small" ? SMALL_AMP : 1;
}

export function eyesOf(p: FigureProps): "open" | "closed" {
  return p.variant === "slow-closed" ? "closed" : "open";
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

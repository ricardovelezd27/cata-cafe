"use client";

import type { WarmupFigure as WarmupFigureSpec } from "@/lib/warmup/exercises";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ArmRaiseFigure } from "./ArmRaiseFigure";
import { EyesFigure } from "./EyesFigure";
import { HeadRotateFigure } from "./HeadRotateFigure";
import { TrunkForwardBackFigure } from "./TrunkForwardBackFigure";
import { TrunkSideFigure } from "./TrunkSideFigure";
import type { FigureProps } from "./shared";

export type { FigureProps } from "./shared";
export { ArmRaiseFigure, EyesFigure, HeadRotateFigure, TrunkForwardBackFigure, TrunkSideFigure };

export interface WarmupFigureProps {
  figure: WarmupFigureSpec;
  durationSec: number;
  paused?: boolean;
  /** Force static (dev review) — otherwise follows prefers-reduced-motion. */
  reducedMotion?: boolean;
  title?: string;
  className?: string;
}

/**
 * Dispatcher: content descriptor → the figure for its kind. The player
 * remounts it per step (key on the step id) so every animation starts from
 * neutral. Reduced motion → static end-pose + arrow (no animation).
 */
export function WarmupFigure({ figure, reducedMotion, ...rest }: WarmupFigureProps) {
  const prefersReduced = useReducedMotion();
  const { kind, ...spec } = figure;
  const props: FigureProps = { ...spec, ...rest, reducedMotion: reducedMotion ?? prefersReduced };
  switch (kind) {
    case "arm-raise":
      return <ArmRaiseFigure {...props} />;
    case "eyes":
      return <EyesFigure {...props} />;
    case "head-rotate":
      return <HeadRotateFigure {...props} />;
    case "trunk-forward-back":
      return <TrunkForwardBackFigure {...props} />;
    case "trunk-side":
      return <TrunkSideFigure {...props} />;
  }
}

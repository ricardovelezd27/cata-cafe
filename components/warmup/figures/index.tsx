"use client";

import { ArmRaiseFigure } from "./ArmRaiseFigure";
import { EyesFigure } from "./EyesFigure";
import { FaceFigure } from "./FaceFigure";
import { HeadRotateFigure } from "./HeadRotateFigure";
import { TrunkForwardBackFigure } from "./TrunkForwardBackFigure";
import { TrunkSideFigure } from "./TrunkSideFigure";
import type { WarmupFigureProps } from "./shared";

export type { FigureProps, WarmupFigureProps } from "./shared";
export { THUMB_VIEWBOX } from "./shared";
export { ArmRaiseFigure, EyesFigure, FaceFigure, HeadRotateFigure, TrunkForwardBackFigure, TrunkSideFigure };

/**
 * Dispatcher: kind → figure. Figures do NOT animate. Either:
 *  - pass `pose` for a static render (tiles, dev gallery), or
 *  - omit it and write `transform` attributes on the `[data-part]` groups
 *    yourself every frame (the player, via poses.partTransforms + `ref`).
 * `path` draws the current leg's dotted trajectory.
 */
export function WarmupFigure({ kind, ...props }: WarmupFigureProps) {
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

import type { Ref } from "react";
import type { WarmupFigureKind, WarmupLead } from "@/lib/warmup/exercises";
import type { Pose } from "@/lib/warmup/timelineTypes";

/** Public props of `WarmupFigure` (re-exported from ./index). */
export interface WarmupFigureProps {
  kind: WarmupFigureKind;
  eyes: "open" | "closed";
  /** Body part that initiates the movement: a static lead dot pinned to the
   *  group that moves with it. The player glows it once via data-glow="1". */
  lead?: WarmupLead;
  /** Default true: the moving part is drawn in var(--wu-move). */
  highlight?: boolean;
  /** STATIC pose (library tiles, dev gallery): written as `transform`
   *  attributes at render time. The player omits it and writes them itself. */
  pose?: Pose;
  /** Trajectory of the current leg; `progress` marks passed dots statically. */
  path?: { from: Pose; to: Pose; progress?: number } | null;
  /** "tile" = square THUMB_VIEWBOX framing (library / dashboard thumbnails). */
  frame?: "stage" | "tile";
  title?: string;
  className?: string;
  /** React 19 ref-as-prop on the root <svg>. */
  ref?: Ref<SVGSVGElement>;
}

/** What each per-kind figure receives (the dispatcher strips `kind`). */
export type FigureProps = Omit<WarmupFigureProps, "kind">;

/** Square tile framing per posture: head top (y 34) at ~18 %, floor (y 302)
 *  at ~90 % of the square → side 372, top -33, centred on x 120. Seated and
 *  standing share head and floor heights, so the boxes coincide. */
export const THUMB_VIEWBOX: Record<"standing" | "seated" | "face", string> = {
  standing: "-66 -33 372 372",
  seated: "-66 -33 372 372",
  face: "0 0 200 200",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Stable, url()-safe id from React's useId (which may contain «» or :). */
export function svgId(raw: string, prefix: string): string {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

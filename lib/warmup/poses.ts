// Pose -> SVG geometry for the warm-up figures. Pure; vitest-covered.
//
// The player writes the strings returned by `partTransforms` as the
// `transform` ATTRIBUTE of the `[data-part]` group (never a CSS transform —
// figures.module.css must not set transform-origin/transform-box on these
// groups, or the pivots compound). Geometry below is in the Mannequin's user
// units (viewBox 0 0 240 320) except the eyes, which live in FaceFigure's
// viewBox 0 0 200 200.

import type { WarmupFigureKind } from "./exercises";
import type { Pose } from "./timelineTypes";

export type PartTransforms = Readonly<Record<string, string>>;

/** Pivots / ranges — single source for figures AND trajectories. */
export const GEO = {
  arm: { pivot: [146, 112] as const, hand: [158, 198] as const, maxDeg: -160 },
  head: { center: [120, 58] as const, dx: 13 },
  eyes: { center: [100, 86] as const, dx: 10, dy: 6 },
  trunkFwd: { pivot: [118, 206] as const, headTop: [122, 32] as const, maxDeg: 16 },
  trunkSide: { headTop: [120, 32] as const, dx: 22 },
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Transform attribute per data-part for a pose. Only the moving part(s). */
export function partTransforms(kind: WarmupFigureKind, pose: Pose): PartTransforms {
  const a = pose.a;
  const b = pose.b ?? 0;
  switch (kind) {
    case "arm-raise":
      return { "arm-r": `rotate(${r2(GEO.arm.maxDeg * a)} ${GEO.arm.pivot[0]} ${GEO.arm.pivot[1]})` };
    case "head-rotate":
      return { face: `translate(${r2(GEO.head.dx * a)} 0)` };
    case "eyes":
      return { pupils: `translate(${r2(GEO.eyes.dx * a)} ${r2(GEO.eyes.dy * b)})` };
    case "trunk-forward-back":
      return {
        upper: `rotate(${r2(GEO.trunkFwd.maxDeg * a)} ${GEO.trunkFwd.pivot[0]} ${GEO.trunkFwd.pivot[1]})`,
      };
    case "trunk-side":
      return { upper: `translate(${r2(GEO.trunkSide.dx * a)} 0)` };
  }
}

/** Rest-step micro-breath on the torso (0.6 % on a 10 s cycle). */
export function torsoBreathTransform(tMs: number): string {
  const m = 0.5 - 0.5 * Math.cos((2 * Math.PI * tMs) / 10000);
  const s = 1 + 0.006 * m;
  return `translate(120 206) scale(1 ${r2(s)}) translate(-120 -206)`;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

function rotateAbout(px: number, py: number, x: number, y: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const dx = x - px;
  const dy = y - py;
  return { x: px + dx * Math.cos(rad) - dy * Math.sin(rad), y: py + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

/** Where the extremity (hand / nose / gaze / head top) sits for a pose. */
export function extremityAt(kind: WarmupFigureKind, pose: Pose): Point {
  const a = pose.a;
  const b = pose.b ?? 0;
  switch (kind) {
    case "arm-raise":
      return rotateAbout(GEO.arm.pivot[0], GEO.arm.pivot[1], GEO.arm.hand[0], GEO.arm.hand[1], GEO.arm.maxDeg * a);
    case "head-rotate":
      return { x: GEO.head.center[0] + GEO.head.dx * a, y: GEO.head.center[1] + 8 };
    case "eyes":
      return { x: GEO.eyes.center[0] + GEO.eyes.dx * a, y: GEO.eyes.center[1] + GEO.eyes.dy * b };
    case "trunk-forward-back":
      return rotateAbout(
        GEO.trunkFwd.pivot[0],
        GEO.trunkFwd.pivot[1],
        GEO.trunkFwd.headTop[0],
        GEO.trunkFwd.headTop[1],
        GEO.trunkFwd.maxDeg * a,
      );
    case "trunk-side":
      return { x: GEO.trunkSide.headTop[0] + GEO.trunkSide.dx * a, y: GEO.trunkSide.headTop[1] };
  }
}

/** Dots along the extremity's route from -> to, every ~`spacing` user units,
 *  plus the destination. Figures draw these; the player marks the ones
 *  behind the extremity as passed. */
export function trajectoryDots(
  kind: WarmupFigureKind,
  from: Pose,
  to: Pose,
  spacing = kind === "eyes" ? 5 : 8,
): { dots: Point[]; destination: Point } {
  const destination = extremityAt(kind, to);
  const steps = 48;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(
      extremityAt(kind, {
        a: from.a + (to.a - from.a) * u,
        b: (from.b ?? 0) + ((to.b ?? 0) - (from.b ?? 0)) * u,
      }),
    );
  }
  let acc = 0;
  const dots: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc >= spacing) {
      dots.push(pts[i]);
      acc = 0;
    }
  }
  return { dots, destination };
}

/** How many of `total` dots lie behind the extremity at progress u in [0,1]. */
export function passedDots(total: number, u: number): number {
  return Math.max(0, Math.min(total, Math.floor(total * u)));
}

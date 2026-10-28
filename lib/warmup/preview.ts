// Static "peak pose" for warm-up thumbnails (library tiles, waiting room,
// dashboard). Pure — no React — so it is usable on the server and in tests.

import type { WarmupDirection, WarmupExercise, WarmupFigureKind } from "./exercises";
import type { FigureStaticSpec, Pose } from "./timelineTypes";

/** Neutral pose per kind (arm hanging, head/eyes/trunk centred). */
export function neutralPose(kind: WarmupFigureKind): Pose {
  return kind === "eyes" ? { a: 0, b: 0 } : { a: 0 };
}

/** End of the FIRST leg of a step's direction (round trips go right / up /
 *  forward first). Rest/centre fall back to the kind's positive extreme. */
function legEnd(kind: WarmupFigureKind, direction: WarmupDirection | undefined): Pose {
  if (kind === "eyes") {
    switch (direction) {
      case "left":
        return { a: -1, b: 0 };
      case "up":
        return { a: 0, b: -1 };
      case "down":
        return { a: 0, b: 1 };
      default:
        return { a: 1, b: 0 };
    }
  }
  if (direction === "left") return { a: -1 };
  return { a: 1 };
}

/** Thumbnail spec: the first slow-open step (else the first non-rest step),
 *  posed at the end of its first leg with 70 % of the trajectory filled. */
export function previewSpec(ex: WarmupExercise): FigureStaticSpec {
  const step =
    ex.steps.find((s) => s.figure.variant === "slow-open") ??
    ex.steps.find((s) => s.figure.direction !== "rest") ??
    ex.steps[0];
  const kind = ex.figureKind;
  const from = neutralPose(kind);
  const to = legEnd(kind, step?.figure.direction);
  const closed = kind === "eyes" || step?.figure.variant === "slow-closed";
  return {
    kind,
    pose: to,
    eyes: closed ? "closed" : "open",
    path: { from, to, progress: 0.7 },
  };
}

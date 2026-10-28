import type { WarmupFigureKind } from "@/lib/warmup/exercises";
import { passedDots, trajectoryDots } from "@/lib/warmup/poses";
import type { Pose } from "@/lib/warmup/timelineTypes";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Dotted route of the CURRENT leg's extremity (hand / nose / head top / gaze),
 * replacing the old arrows. Positions come from poses.trajectoryDots so the
 * player can mark `data-passed` / `data-reached` by index without
 * recomputing geometry. Colours live in figures.module.css.
 *
 * DOM: <g data-traj> · <circle data-traj-dot={i}> × n · <circle data-traj-dest>
 */
export function Trajectory({
  kind,
  from,
  to,
  progress,
  dotR = 1.6,
  destR = 6,
  spacing,
}: {
  kind: WarmupFigureKind;
  from: Pose;
  to: Pose;
  /** 0..1: statically marks passed dots (tiles); the player sets them live. */
  progress?: number;
  dotR?: number;
  destR?: number;
  /** User units between dots (poses.trajectoryDots default when omitted). */
  spacing?: number;
}) {
  const { dots, destination } = trajectoryDots(kind, from, to, spacing);
  const passed = progress == null ? 0 : passedDots(dots.length, progress);
  return (
    <g data-traj="" aria-hidden>
      {dots.map((p, i) => (
        <circle
          key={i}
          data-traj-dot={i}
          data-passed={i < passed ? "1" : undefined}
          cx={r2(p.x)}
          cy={r2(p.y)}
          r={dotR}
        />
      ))}
      <circle
        data-traj-dest=""
        data-reached={progress != null && progress >= 1 ? "1" : undefined}
        cx={r2(destination.x)}
        cy={r2(destination.y)}
        r={destR}
      />
    </g>
  );
}

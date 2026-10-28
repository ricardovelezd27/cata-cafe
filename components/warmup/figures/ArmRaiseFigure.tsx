import { partTransforms } from "@/lib/warmup/poses";
import { Mannequin, leadDots } from "./Mannequin";
import type { FigureProps } from "./shared";

/** Ejercicio 1 · El brazo lento — lateral raise of the right arm (standing,
 *  front). Moving group `arm-r`, pivot at the shoulder (146,112). */
export function ArmRaiseFigure({ eyes, lead, highlight = true, pose, path, frame = "stage", ...rest }: FigureProps) {
  return (
    <Mannequin
      kind="arm-raise"
      view="front"
      posture="standing"
      eyes={eyes}
      frame={frame}
      moving={highlight ? "arm-r" : undefined}
      transforms={pose ? partTransforms("arm-raise", pose) : {}}
      leads={leadDots("front", lead)}
      path={path}
      {...rest}
    />
  );
}

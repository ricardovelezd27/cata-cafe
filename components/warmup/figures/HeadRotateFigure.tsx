import { partTransforms } from "@/lib/warmup/poses";
import { Mannequin, leadDots } from "./Mannequin";
import type { FigureProps } from "./shared";

/** Ejercicio 3 · La cabeza — turn right/left (seated, front). The `face`
 *  group (eyes + nose) slides inside the head; ears and head stay. */
export function HeadRotateFigure({ eyes, lead, highlight = true, pose, path, frame = "stage", ...rest }: FigureProps) {
  return (
    <Mannequin
      kind="head-rotate"
      view="front"
      posture="seated"
      eyes={eyes}
      frame={frame}
      moving={highlight ? "head" : undefined}
      transforms={pose ? partTransforms("head-rotate", pose) : {}}
      leads={leadDots("front", lead, true)}
      path={path}
      {...rest}
    />
  );
}

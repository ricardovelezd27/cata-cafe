import { partTransforms } from "@/lib/warmup/poses";
import { Mannequin, leadDots } from "./Mannequin";
import type { FigureProps } from "./shared";

/** Ejercicio 5 · De lado a lado — the trunk (`upper`) translates sideways,
 *  shoulders stay over the hips (front view, seated). */
export function TrunkSideFigure({ eyes, lead, highlight = true, pose, path, frame = "stage", ...rest }: FigureProps) {
  return (
    <Mannequin
      kind="trunk-side"
      view="front"
      posture="seated"
      eyes={eyes}
      frame={frame}
      moving={highlight ? "upper" : undefined}
      transforms={pose ? partTransforms("trunk-side", pose) : {}}
      leads={leadDots("front", lead)}
      path={path}
      {...rest}
    />
  );
}

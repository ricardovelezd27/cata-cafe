import { partTransforms } from "@/lib/warmup/poses";
import { Mannequin, leadDots } from "./Mannequin";
import type { FigureProps } from "./shared";

/** Ejercicio 4 · Adelante y atrás — the whole trunk (`upper`) pivots at the
 *  hips (118,206), side view, seated. */
export function TrunkForwardBackFigure({
  eyes,
  lead,
  highlight = true,
  pose,
  path,
  frame = "stage",
  ...rest
}: FigureProps) {
  return (
    <Mannequin
      kind="trunk-forward-back"
      view="side"
      posture="seated"
      eyes={eyes}
      frame={frame}
      moving={highlight ? "upper" : undefined}
      transforms={pose ? partTransforms("trunk-forward-back", pose) : {}}
      leads={leadDots("side", lead)}
      path={path}
      {...rest}
    />
  );
}

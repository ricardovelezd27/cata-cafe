import { Mannequin } from "./Mannequin";
import { Arrow } from "./Arrow";
import s from "./figures.module.css";
import { ampOf, cx, eyesOf, timingStyle, type FigureProps } from "./shared";

/** Ejercicio 4 · Adelante y atrás — whole trunk pivots at the hips (side view). */
export function TrunkForwardBackFigure(p: FigureProps) {
  const dir = p.direction ?? "forward-back";
  const fast = p.variant === "fast-open";
  const amp = ampOf(p);
  const deg = 16 * amp;

  let cls: string | undefined;
  let staticTransform = "rotate(0deg)";
  let arrow: { d: string; both?: boolean } | null = null;

  switch (dir) {
    case "forward-back":
      cls = fast ? s.trunkForwardBackFast : s.trunkForwardBack;
      staticTransform = `rotate(${deg}deg)`;
      arrow = { d: p.amplitude === "small" ? "M154 30 H166" : "M154 30 H184", both: true };
      break;
    case "forward":
      cls = s.trunkForwardBack;
      staticTransform = `rotate(${deg}deg)`;
      arrow = { d: "M154 30 H184" };
      break;
    default:
      break;
  }

  const animated = !p.reducedMotion && cls;

  return (
    <Mannequin
      view="side"
      posture="seated"
      eyes={eyesOf(p)}
      lead={p.lead}
      title={p.title}
      paused={p.paused}
      className={p.className}
      style={timingStyle(p, dir === "forward-back")}
      partClass={{ upper: cx(animated && s.anim, animated && cls) }}
      partStyle={{ upper: animated ? undefined : { transform: staticTransform } }}
    >
      {arrow && <Arrow d={arrow.d} both={arrow.both} />}
    </Mannequin>
  );
}

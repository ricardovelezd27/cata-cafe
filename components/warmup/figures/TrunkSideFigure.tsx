import { Mannequin } from "./Mannequin";
import { Arrow } from "./Arrow";
import s from "./figures.module.css";
import { ampOf, cx, eyesOf, timingStyle, type FigureProps } from "./shared";

/** Ejercicio 5 · De lado a lado — the trunk translates, shoulders stay over hips. */
export function TrunkSideFigure(p: FigureProps) {
  const dir = p.direction ?? "right-left";
  const fast = p.variant === "fast-open";
  const amp = ampOf(p);
  const dx = 22 * amp;

  let cls: string | undefined;
  let staticTransform = "translateX(0)";
  let arrow: { d: string; both?: boolean } | null = null;

  switch (dir) {
    case "right-left":
      cls = fast ? s.trunkFast : s.trunkRightLeft;
      staticTransform = `translateX(${dx}px)`;
      arrow = { d: p.amplitude === "small" ? "M110 22 H130" : "M92 22 H148", both: true };
      break;
    case "right":
      cls = s.trunkRightLeft;
      staticTransform = `translateX(${dx}px)`;
      arrow = { d: "M120 22 H148" };
      break;
    case "center":
      cls = s.trunkCenter;
      arrow = { d: "M96 22 H118" };
      break;
    default:
      break;
  }

  const animated = !p.reducedMotion && cls;

  return (
    <Mannequin
      view="front"
      posture="seated"
      eyes={eyesOf(p)}
      lead={p.lead}
      title={p.title}
      paused={p.paused}
      className={p.className}
      style={timingStyle(p, dir === "right-left")}
      partClass={{ upper: cx(animated && s.anim, animated && cls) }}
      partStyle={{ upper: animated ? undefined : { transform: staticTransform } }}
    >
      {arrow && <Arrow d={arrow.d} both={arrow.both} />}
    </Mannequin>
  );
}

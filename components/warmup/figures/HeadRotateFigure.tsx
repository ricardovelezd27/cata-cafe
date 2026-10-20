import { Mannequin } from "./Mannequin";
import { Arrow } from "./Arrow";
import s from "./figures.module.css";
import { ampOf, cx, eyesOf, timingStyle, type FigureProps } from "./shared";

/** Ejercicio 3 · La cabeza — turn right/left; features slide, ears stay. */
export function HeadRotateFigure(p: FigureProps) {
  const dir = p.direction ?? "right-left";
  const fast = p.variant === "fast-open";
  const amp = ampOf(p);
  const dx = 13 * amp;

  let cls: string | undefined;
  let staticTransform = "translateX(0)";
  let arrow: { d: string; both?: boolean } | null = null;

  switch (dir) {
    case "right-left":
      cls = fast ? s.headFast : s.headRightLeft;
      staticTransform = `translateX(${dx}px)`;
      arrow = { d: "M96 30 Q120 16 144 30", both: true };
      break;
    case "right":
      cls = s.headRightLeft;
      staticTransform = `translateX(${dx}px)`;
      arrow = { d: "M120 24 Q134 18 144 30" };
      break;
    case "center":
      cls = s.headCenter;
      arrow = { d: "M96 30 Q106 20 118 22" };
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
      partClass={{ face: cx(animated && s.anim, animated && cls) }}
      partStyle={{ face: animated ? undefined : { transform: staticTransform } }}
    >
      {arrow && <Arrow d={arrow.d} both={arrow.both} />}
    </Mannequin>
  );
}

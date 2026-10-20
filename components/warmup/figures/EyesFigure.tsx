import { Mannequin } from "./Mannequin";
import { Arrow } from "./Arrow";
import s from "./figures.module.css";
import { ampOf, cx, eyesOf, timingStyle, type FigureProps } from "./shared";

/** Ejercicio 2 · Los ojos — only the pupils move (ghosted under closed lids). */
export function EyesFigure(p: FigureProps) {
  const dir = p.direction ?? "rest";
  const amp = ampOf(p);
  const dx = 4.5 * amp;
  const dy = 3.2 * amp;

  let cls: string | undefined;
  let staticTransform = "translate(0, 0)";
  let arrow: { d: string; both?: boolean } | null = null;

  switch (dir) {
    case "right":
      cls = s.eyesRight;
      staticTransform = `translate(${dx}px, 0)`;
      arrow = { d: "M128 44 H142" };
      break;
    case "left":
      cls = s.eyesLeft;
      staticTransform = `translate(${-dx}px, 0)`;
      arrow = { d: "M112 44 H98", both: p.returns };
      break;
    case "up":
      cls = s.eyesUp;
      staticTransform = `translate(0, ${-dy}px)`;
      arrow = { d: "M152 64 V50", both: p.returns };
      break;
    case "down":
      cls = s.eyesDown;
      staticTransform = `translate(0, ${dy}px)`;
      arrow = { d: "M152 52 V66", both: p.returns };
      break;
    case "center":
      cls = s.eyesCenter;
      arrow = { d: "M140 44 H126" };
      break;
    case "rest":
    default:
      break;
  }

  const animated = !p.reducedMotion && cls;

  return (
    <Mannequin
      view="front"
      posture="seated"
      eyes={eyesOf(p)}
      zoom="face"
      lead={p.lead}
      title={p.title}
      paused={p.paused}
      className={p.className}
      style={timingStyle(p, false)}
      partClass={{ pupils: cx(animated && s.anim, animated && cls) }}
      partStyle={{ pupils: animated ? undefined : { transform: staticTransform } }}
    >
      {arrow && <Arrow d={arrow.d} both={arrow.both} />}
    </Mannequin>
  );
}

import { Mannequin } from "./Mannequin";
import { Arrow } from "./Arrow";
import s from "./figures.module.css";
import { ampOf, cx, eyesOf, timingStyle, type FigureProps } from "./shared";

// Hand path = circle around the shoulder (146,112), r ≈ 86.
const ARC_UP = "M189 186 A86 86 0 0 0 189 38";
const ARC_DOWN = "M189 38 A86 86 0 0 1 189 186";

/** Ejercicio 1 · El brazo lento — lateral raise of the right arm. */
export function ArmRaiseFigure(p: FigureProps) {
  const dir = p.direction ?? "up";
  const roundTrip = dir === "up-down";
  const amp = ampOf(p);

  let armClass: string | undefined;
  let armStatic: string | undefined;
  let arrow: { d: string; both?: boolean } | null = null;

  switch (dir) {
    case "up":
      armClass = s.armUp;
      armStatic = `rotate(${-160 * amp}deg)`;
      arrow = { d: ARC_UP };
      break;
    case "up-down":
      armClass = s.armUpDown;
      armStatic = `rotate(${-160 * amp}deg)`;
      arrow = { d: ARC_UP, both: true };
      break;
    case "down":
      armClass = s.armDown;
      armStatic = "rotate(0deg)";
      arrow = { d: ARC_DOWN };
      break;
    case "rest":
    default:
      // "Párate ahí unos segundos": the arm pauses mid-way, the body breathes.
      armStatic = "rotate(-95deg)";
      break;
  }

  const animated = !p.reducedMotion && armClass;

  return (
    <Mannequin
      view="front"
      posture="standing"
      eyes={eyesOf(p)}
      lead={p.lead}
      title={p.title}
      paused={p.paused}
      className={p.className}
      style={timingStyle(p, roundTrip)}
      partClass={{
        "arm-r": cx(animated && s.anim, animated && armClass),
        torso: cx(dir === "rest" && !p.reducedMotion && s.breathe),
      }}
      partStyle={{
        "arm-r": animated ? undefined : { transform: armStatic },
      }}
    >
      {arrow && <Arrow d={arrow.d} both={arrow.both} />}
    </Mannequin>
  );
}

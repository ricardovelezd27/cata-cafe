import { FaceFigure } from "./FaceFigure";
import type { FigureProps } from "./shared";

/** Ejercicio 2 · Los ojos — the bust close-up; only the pupil glow moves. */
export function EyesFigure(p: FigureProps) {
  return <FaceFigure {...p} />;
}

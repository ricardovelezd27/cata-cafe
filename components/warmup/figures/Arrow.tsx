import { useId } from "react";
import s from "./figures.module.css";

/**
 * Trajectory arrow drawn on top of the mannequin (same user units). Uses an
 * SVG marker for the head; `both` adds a head at the start too (round trips).
 * Colour = terracotta `secondary` token ("energy and emphasis") via CSS.
 */
export function Arrow({
  d,
  both = false,
  dashed = false,
  className,
}: {
  /** SVG path data in mannequin user units. */
  d: string;
  both?: boolean;
  dashed?: boolean;
  className?: string;
}) {
  const id = useId();
  const headId = `warmup-arrow-${id}`;
  const tailId = `warmup-arrow-tail-${id}`;
  return (
    <g className={[s.arrow, className ?? ""].join(" ")} aria-hidden>
      <defs>
        <marker
          id={headId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M1 1 L9 5 L1 9" className={s.arrowHead} />
        </marker>
        {both && (
          <marker
            id={tailId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M1 1 L9 5 L1 9" className={s.arrowHead} />
          </marker>
        )}
      </defs>
      <path
        d={d}
        markerEnd={`url(#${headId})`}
        markerStart={both ? `url(#${tailId})` : undefined}
        strokeDasharray={dashed ? "4 5" : undefined}
      />
    </g>
  );
}

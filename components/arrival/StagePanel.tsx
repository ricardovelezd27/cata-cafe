import type { ReactNode } from "react";
import styles from "./ArrivalStage.module.css";

/**
 * The arrival stage's ground as a PANEL inside the app (package S7b, the
 * waiting room, audit K-02). `ArrivalStage` is a whole page with its own bar;
 * the waiting room lives inside the app shell, so it needs the same ground in
 * a box: the stage behind the status only, the page around it paper. Same
 * tokens, same gradient (one rule in ArrivalStage.module.css), the same still
 * mint light and the same focus ring. No canvas, nothing that moves.
 */
export function StagePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.panel} ${className}`} data-stage-panel="">
      <div className={`stage-light stage-light-mint ${styles.panelLight}`} aria-hidden="true" />
      {children}
    </div>
  );
}

/** Eight dots in a ring and six still arriving: people gathering around one
 *  cupping table, seen from above. A still drawing in the stage's own colours
 *  (cream, mint, one terracotta); decorative. It replaces the waiting room's
 *  coffee emoji. Never animated. */
export function GatheringMark({ className = "" }: { className?: string }) {
  const ring = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: 48 + Math.cos(a) * 18, y: 48 + Math.sin(a) * 18, r: 3.2, tone: i === 0 ? "fill-secondary-container" : "fill-primary-fixed" };
  });
  const arriving = [
    { a: -0.35, d: 34 },
    { a: 0.55, d: 38 },
    { a: 1.6, d: 33 },
    { a: 2.45, d: 40 },
    { a: 3.5, d: 35 },
    { a: 4.6, d: 39 },
  ].map(({ a, d }) => ({ x: 48 + Math.cos(a) * d, y: 48 + Math.sin(a) * d, r: 2.2, tone: "fill-surface opacity-70" }));
  return (
    <svg viewBox="0 0 96 96" width="88" height="88" aria-hidden="true" focusable="false" className={className} data-gathering="">
      {[...arriving, ...ring].map((dot, i) => (
        <circle key={i} cx={dot.x.toFixed(2)} cy={dot.y.toFixed(2)} r={dot.r} className={dot.tone} />
      ))}
    </svg>
  );
}

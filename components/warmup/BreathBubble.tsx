"use client";

import { useState, type Ref } from "react";
import s from "./BreathBubble.module.css";

/**
 * Breathing bubble (replaces BreathRing). React only renders `phase` and the
 * label; the player writes, per frame, on the root element (`ref`):
 *   --scale  0.62 .. 1     bubble size   (lib/warmup/breath.ts breathAt().scale)
 *   --halo   0.25 .. 0.55  halo opacity  (lib/warmup/breath.ts halo())
 * Centre it inside a `container-type: size` stage; it sizes itself from cqmin.
 */
export interface BreathBubbleProps {
  phase: "rest" | "in" | "out";
  label: string;
  dusk?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function BreathBubble({ phase, label, dusk = false, ref }: BreathBubbleProps) {
  // Keep the previous label one render longer so it can fade out underneath
  // the incoming one (state derived during render, no effect).
  const [labels, setLabels] = useState({ cur: label, prev: null as string | null, n: 0 });
  if (labels.cur !== label) setLabels({ cur: label, prev: labels.cur, n: labels.n + 1 });

  return (
    <div ref={ref} className={[s.root, dusk ? s.dusk : ""].join(" ")} data-phase={phase}>
      <div className={s.halo} aria-hidden />
      <div className={s.disc} aria-hidden />
      <div className={s.labelBox}>
        {labels.prev !== null && labels.prev !== labels.cur && (
          <span key={`${labels.n - 1}:${labels.prev}`} className={`${s.label} ${s.out}`} aria-hidden>
            {labels.prev}
          </span>
        )}
        <span key={`${labels.n}:${labels.cur}`} className={`${s.label} ${labels.n > 0 ? s.in : ""}`}>
          {labels.cur}
        </span>
      </div>
    </div>
  );
}

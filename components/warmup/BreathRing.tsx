"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import s from "./BreathRing.module.css";

const noopSubscribe = () => () => {};
/** True where CSS.registerProperty exists (= @property is supported). */
const supportsTypedProps = () => typeof CSS !== "undefined" && "registerProperty" in CSS;

export interface BreathRingProps {
  /** Phase length in seconds; 0 = no arc (intro / reflection), just breathing. */
  durationSec: number;
  /** Whole seconds left — only used for the no-@property fallback angle. */
  remainingSec: number;
  /** Changing it restarts the sweep (the player passes its phase key). */
  runKey: string;
  paused?: boolean;
  /** Eyes-closed variant: the ring glows in the secondary token. */
  glow?: boolean;
}

/** Decorative progress ring that slowly breathes; centred in a positioned,
 *  container-query parent (`container-type: size`). */
export function BreathRing({ durationSec, remainingSec, runKey, paused = false, glow = false }: BreathRingProps) {
  const smooth = useSyncExternalStore(noopSubscribe, supportsTypedProps, () => false);
  const elapsed = durationSec > 0 ? Math.min(1, Math.max(0, (durationSec - remainingSec) / durationSec)) : 0;
  const arcStyle = {
    "--ring-dur": `${durationSec}s`,
    ...(smooth ? null : { "--ring-p": `${Math.round(elapsed * 360)}deg` }),
  } as CSSProperties;
  return (
    <div className={[s.ring, glow ? s.glow : "", paused ? s.paused : ""].join(" ")} aria-hidden>
      <div className={s.track} />
      {durationSec > 0 && (
        <div
          key={runKey}
          className={[s.arc, smooth ? s.arcSmooth : "", paused ? s.paused : ""].join(" ")}
          style={arcStyle}
        />
      )}
    </div>
  );
}

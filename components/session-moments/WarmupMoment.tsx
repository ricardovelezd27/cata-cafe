"use client";

import { warmupById, lw } from "@/lib/warmup/exercises";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { SessionMomentOverlay, useSessionMoment } from "./SessionMomentOverlay";

export interface WarmupMomentProps {
  sessionId: string;
  locale: string;
  /** `CuppingSession.warmupExerciseId` — null/unknown id → never opens. */
  exerciseId: string | null | undefined;
  /** Extra gate from the host (e.g. session not closed). */
  enabled?: boolean;
  strings: WarmupPlayerStrings;
}

/**
 * Pre-cupping warm-up interstitial: the session's configured exercise, once
 * per session per device, before the first sample. Static content only, so
 * it renders offline exactly like online. Finishing OR skipping marks it
 * seen — the cupper is never nagged twice.
 */
export function WarmupMoment({ sessionId, locale, exerciseId, enabled = true, strings }: WarmupMomentProps) {
  const exercise = warmupById(exerciseId);
  const { open, dismiss } = useSessionMoment({
    kind: "warmup",
    sessionId,
    when: enabled && exercise !== null,
  });
  if (!exercise) return null;
  return (
    <SessionMomentOverlay open={open} onDismiss={dismiss} label={lw(exercise.name, locale)}>
      <WarmupPlayer exercise={exercise} locale={locale} t={strings} mode="session" onFinish={dismiss} onExit={dismiss} />
    </SessionMomentOverlay>
  );
}

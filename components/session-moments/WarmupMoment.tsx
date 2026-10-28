"use client";

import { useState } from "react";
import { warmupById, lw } from "@/lib/warmup/exercises";
import { seenMomentValue } from "@/lib/sessionMoments";
import { shouldShowWarmupOverlay } from "@/lib/warmup/overlayGate";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { SessionMomentOverlay, useSessionMoment } from "./SessionMomentOverlay";

export interface WarmupMomentProps {
  sessionId: string;
  userId: string;
  locale: string;
  /** `CuppingSession.warmupExerciseId` — null/unknown id → never opens. */
  exerciseId: string | null | undefined;
  /** The cupper already has an evaluation in this session (returning). */
  hasOwnEvaluation: boolean;
  isOwner: boolean;
  isGroup: boolean;
  isAsync: boolean;
  /** Extra gate from the host (e.g. session not closed). */
  enabled?: boolean;
  strings: WarmupPlayerStrings;
}

/**
 * Pre-cupping warm-up interstitial: the session's configured exercise, once
 * per (session, user, exercise) per device, before the first sample. Static
 * content only, so it renders offline exactly like online. Finishing OR
 * skipping marks it seen — the cupper is never nagged twice.
 *
 * The gate and the exercise id are FROZEN at mount: the reference auto-save
 * writes an evaluation ~800 ms after the cup page mounts and
 * `router.refresh()` runs on realtime + every 30 s, so a live gate would
 * close the overlay mid-exercise or open it mid-cupping.
 */
export function WarmupMoment({
  sessionId,
  userId,
  locale,
  exerciseId,
  hasOwnEvaluation,
  isOwner,
  isGroup,
  isAsync,
  enabled = true,
  strings,
}: WarmupMomentProps) {
  const [frozen] = useState(() => {
    const id = exerciseId ?? null;
    const show =
      enabled &&
      shouldShowWarmupOverlay({
        exerciseId: id,
        seenValue: id ? seenMomentValue("warmup", sessionId, userId) : null,
        hasOwnEvaluation,
        isOwner,
        isGroup,
        isAsync,
      });
    return { id, show };
  });
  const exercise = warmupById(frozen.id);
  const { open, dismiss } = useSessionMoment({
    kind: "warmup",
    sessionId,
    userId,
    value: frozen.id ?? "",
    when: frozen.show && exercise !== null,
  });
  if (!exercise) return null;
  return (
    <SessionMomentOverlay open={open} label={lw(exercise.name, locale)}>
      <WarmupPlayer exercise={exercise} locale={locale} t={strings} mode="session" onFinish={dismiss} onExit={dismiss} />
    </SessionMomentOverlay>
  );
}

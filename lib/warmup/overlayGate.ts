// Pure rules for the pre-cupping warm-up overlay on /cup and for what the
// waiting room does when the cupping starts mid-exercise. No React, no DOM.

import { isWarmupId } from "./exercises";

export interface OverlayGateInput {
  /** CuppingSession.warmupExerciseId */
  exerciseId: string | null | undefined;
  /** What the seen-set recorded for (warmup, session, user), or null. */
  seenValue: string | null;
  /** The cupper already has an evaluation row in this session. */
  hasOwnEvaluation: boolean;
  isOwner: boolean;
  isGroup: boolean;
  isAsync: boolean;
}

/**
 * Truth table (first match wins):
 *  - no / unknown exercise id              → false
 *  - seen value === exercise id            → false (done or skipped already)
 *  - has an evaluation already             → false (returning mid-cupping)
 *  - owner of a LIVE group session         → false (the master runs it with the
 *                                            group from the panel — Stage 2)
 *  - otherwise (solo owner, async owner,
 *    any participant)                       → true
 */
export function shouldShowWarmupOverlay(i: OverlayGateInput): boolean {
  if (!isWarmupId(i.exerciseId)) return false;
  if (i.seenValue === i.exerciseId) return false;
  if (i.hasOwnEvaluation) return false;
  if (i.isOwner && i.isGroup && !i.isAsync) return false;
  return true;
}

/** How long the waiting room lets an open player finish once the cupping
 *  has started (wall clock, pause ignored). */
export const START_EXIT_CAP_MS = 30_000;

export type StartArrival = "push" | "bar";

/** When `startedAt` arrives: push to /cup at once unless the player is in
 *  the middle of its run (then show the "La cata empezó" bar and let the
 *  player leave at the next segment boundary or the cap). */
export function onCuppingStarted(playerState: "closed" | "intro" | "run" | "ended"): StartArrival {
  return playerState === "run" ? "bar" : "push";
}

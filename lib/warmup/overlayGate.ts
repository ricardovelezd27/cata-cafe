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
  /** The live cupping has started (CuppingSession.startedAt is set). */
  startedAt: boolean;
}

/**
 * Truth table (first match wins):
 *  - no / unknown exercise id              → false
 *  - seen value === exercise id            → false (done or skipped already)
 *  - has an evaluation already             → false (returning mid-cupping)
 *  - owner of a LIVE group session         → false (the master runs it with the
 *                                            group from the panel — Stage 2)
 *  - LIVE group session already started  → false (S8-13 F-1: the water is on;
 *                                            nobody gets a 3-7 min interstitial
 *                                            between the cups, late joiners included)
 *  - otherwise (solo owner, async owner,
 *    any participant)                       → true
 */
export function shouldShowWarmupOverlay(i: OverlayGateInput): boolean {
  if (!isWarmupId(i.exerciseId)) return false;
  if (i.seenValue === i.exerciseId) return false;
  if (i.hasOwnEvaluation) return false;
  if (i.isOwner && i.isGroup && !i.isAsync) return false;
  if (i.isGroup && !i.isAsync && i.startedAt) return false;
  return true;
}

export interface WarmupEntryInput {
  /** CuppingSession.warmupExerciseId */
  exerciseId: string | null | undefined;
  /** The session is closed (or its status says so): nothing to warm up for. */
  sessionClosed: boolean;
  /** The pre-cupping interstitial is on screen right now. */
  overlayOpen: boolean;
}

/**
 * S10 WP7 (Kim F1): the DISCREET entry to the warm-up once the interstitial is
 * not (or no longer) showing: one small text button on the cup page that opens
 * the same player in session mode. Never the interstitial: it appears only
 * when the session has an exercise, is not closed, and the overlay itself is
 * not open (so it covers a cupping that already started, a returning cupper,
 * a skipped or finished warm-up, and the master of a live group, whose own
 * run lives in the master panel). Closing the player changes nothing: it
 * marks nothing seen and never blocks the cupping.
 */
export function shouldOfferWarmupEntry(i: WarmupEntryInput): boolean {
  if (!isWarmupId(i.exerciseId)) return false;
  if (i.sessionClosed) return false;
  if (i.overlayOpen) return false;
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

// ── Leaving the player early (S8-13 F-movimiento-sensorial-6) ────────────

/** A skip before this much run time does NOT mark the exercise seen, so a
 *  stray tap on the × never silences it for the whole session. */
export const SKIP_SEEN_AFTER_MS = 20_000;

/** What the player tells its host when it is left (× / Skip / Escape). */
export interface WarmupExitInfo {
  /** The exercise ran to its end (reflect / done reached). */
  completed: boolean;
  /** Run time reached, in ms (0 from the intro). */
  elapsedMs: number;
}

/** Host rule: mark the (session, user, exercise) seen only when it was
 *  completed or the person was at least SKIP_SEEN_AFTER_MS in. No info
 *  (legacy caller) keeps the old behaviour: seen. */
export function exitMarksSeen(info?: WarmupExitInfo | null): boolean {
  if (!info) return true;
  return info.completed || info.elapsedMs >= SKIP_SEEN_AFTER_MS;
}

/** Player rule: a skip that WOULD mark the exercise seen asks for a second
 *  tap first (an early stray tap just leaves it unseen, no question). */
export function skipNeedsConfirm(info: WarmupExitInfo): boolean {
  return !info.completed && info.elapsedMs >= SKIP_SEEN_AFTER_MS;
}

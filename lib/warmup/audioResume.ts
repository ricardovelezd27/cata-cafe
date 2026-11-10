// Pure decision for "the phone came back from a lock / call: is the sound
// still going to play?" (S8-13 F-movimiento-sensorial-3). No React, no DOM.

export type AudioCtxState = "running" | "suspended" | "interrupted" | "closed" | "none";

export interface AudioResumeInput {
  /** AudioContext state sampled AFTER the resume attempt settled (or timed out). */
  ctxState: AudioCtxState;
  /** The cupper turned the sound off: there is nothing to be silent about. */
  muted: boolean;
  /** The run is in progress (phase "run", not paused by the person). */
  running: boolean;
  /** iOS "interrupted" is already handled as a plain pause by the player. */
  interrupted: boolean;
}

export type AudioResume = "ok" | "prompt";

/** How long the player waits for `ctx.resume()` before deciding (iOS may
 *  never settle the promise outside a gesture). */
export const RESUME_WAIT_MS = 300;

/**
 * "prompt" = pause the clock and ask for a tap ("Toca para reanudar"); a tap
 * is the gesture that lets the context resume. Never when muted, when the run
 * is not going, when the context is running / closed / absent, or when the
 * `interrupted` pause already took over.
 */
export function audioResumeDecision(i: AudioResumeInput): AudioResume {
  if (i.muted || !i.running || i.interrupted) return "ok";
  return i.ctxState === "suspended" || i.ctxState === "interrupted" ? "prompt" : "ok";
}

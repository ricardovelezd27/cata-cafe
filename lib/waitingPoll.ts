// Waiting-room fallback poll cadence (S8-11 T2, F-grupal-5). A room full of
// phones that all lost the socket at the same moment must not hit
// getWaitingState in lockstep, so each tick is 15 s ± 3 s. Pure for vitest.

export const WAITING_POLL_BASE_MS = 15_000;
export const WAITING_POLL_JITTER_MS = 3_000;

/** `rand` is Math.random-shaped, in [0, 1). */
export function nextPollDelayMs(rand: number = Math.random()): number {
  const offset = Math.round((rand * 2 - 1) * WAITING_POLL_JITTER_MS);
  return WAITING_POLL_BASE_MS + offset;
}

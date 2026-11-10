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

/** S8-23 (C-03): the fallback poll as a self-re-arming chain that survives a
 *  rejected tick. A server-action call rejects when the network is down, which
 *  is exactly when the socket is down too, so a failed tick must not end the
 *  chain. `stop()` is final until the next `start()`: a tick that is in flight
 *  when it is called does not schedule another. */
export function createPollChain(opts: {
  tick: () => Promise<unknown>;
  delayMs?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}) {
  const delayMs = opts.delayMs ?? (() => nextPollDelayMs());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id));
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Bumped on every start(): a tick still in flight from an earlier run must
  // not re-arm once stop() + start() happened meanwhile (two chains, S8-27).
  let generation = 0;

  const arm = (gen: number) => {
    timer = setTimer(() => {
      timer = null;
      void (async () => {
        try {
          await opts.tick();
        } catch {
          // A rejected tick (offline) is not the end of the chain.
        } finally {
          if (running && gen === generation) arm(gen);
        }
      })();
    }, delayMs());
  };

  return {
    start() {
      if (running) return;
      running = true;
      arm(++generation);
    },
    stop() {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    isRunning: () => running,
  };
}

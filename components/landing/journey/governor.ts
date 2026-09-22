// Adaptive draw-cost governor for the constellation engine. Pure (no DOM) so
// it is unit-tested in tests/landingGovernor.test.ts. It samples the time
// spent drawing one frame — never the rAF interval, which browsers throttle
// on their own — and decides once per full window: keep, cut the live particle
// count, or (after `maxDowngrades` cuts still over budget) kill the field.

export type GovernorDecision = "keep" | "downgrade" | "kill";

export type GovernorOptions = {
  budgetMs: number;
  windowSize: number;
  warmupFrames: number;
  maxDowngrades: number;
};

const DOWNGRADE_FACTOR = 0.6;
const LIVE_FLOOR = 60;

export function createGovernor(o: GovernorOptions) {
  const buf = new Float32Array(o.windowSize);
  let cursor = 0;
  let filled = 0;
  let frames = 0;
  let downgrades = 0;
  let killed = false;
  let meanMs = 0;

  return {
    get downgrades() {
      return downgrades;
    },
    get killed() {
      return killed;
    },
    /** mean draw cost of the last fully evaluated window */
    get meanMs() {
      return meanMs;
    },
    sample(drawMs: number): GovernorDecision {
      if (killed) return "kill";
      frames++;
      if (frames <= o.warmupFrames) return "keep";
      buf[cursor] = drawMs;
      cursor = (cursor + 1) % o.windowSize;
      filled++;
      if (filled < o.windowSize) return "keep";
      filled = 0;
      let sum = 0;
      for (let k = 0; k < o.windowSize; k++) sum += buf[k];
      meanMs = sum / o.windowSize;
      if (meanMs <= o.budgetMs) return "keep";
      if (downgrades >= o.maxDowngrades) {
        killed = true;
        return "kill";
      }
      downgrades++;
      return "downgrade";
    },
    /** how many of `total` particles to draw after the cuts so far */
    liveFor(total: number): number {
      const scaled = Math.floor(total * Math.pow(DOWNGRADE_FACTOR, downgrades));
      return Math.max(Math.min(total, LIVE_FLOOR), scaled);
    },
  };
}

export type Governor = ReturnType<typeof createGovernor>;

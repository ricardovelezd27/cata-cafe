import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPollChain, nextPollDelayMs } from "@/lib/waitingPoll";

describe("nextPollDelayMs", () => {
  it("stays within 15 s ± 3 s", () => {
    expect(nextPollDelayMs(0)).toBe(12_000);
    expect(nextPollDelayMs(0.5)).toBe(15_000);
    expect(nextPollDelayMs(0.999999)).toBe(18_000);
  });
  it("never leaves the window for any rand in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const d = nextPollDelayMs(i / 1000);
      expect(d).toBeGreaterThanOrEqual(12_000);
      expect(d).toBeLessThanOrEqual(18_000);
    }
  });
});

describe("createPollChain (S8-23, C-03)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a rejected tick is followed by another tick", async () => {
    const tick = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    const chain = createPollChain({ tick, delayMs: () => 15_000 });
    chain.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(6);
    chain.stop();
  });

  it("stop during an in-flight tick does not re-arm, and start works again", async () => {
    let release!: () => void;
    const tick = vi.fn(() => new Promise<void>((r) => (release = r)));
    const chain = createPollChain({ tick, delayMs: () => 1_000 });
    chain.start();
    await vi.advanceTimersByTimeAsync(1_000);
    chain.stop();
    release();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(chain.isRunning()).toBe(false);
    chain.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tick).toHaveBeenCalledTimes(2);
    chain.stop();
  });
});

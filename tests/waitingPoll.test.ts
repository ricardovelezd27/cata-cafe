import { describe, expect, it } from "vitest";
import { nextPollDelayMs } from "@/lib/waitingPoll";

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

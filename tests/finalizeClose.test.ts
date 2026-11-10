import { describe, expect, it } from "vitest";
import { FINALIZE_GRACE_MS, needsFinalize } from "@/lib/closeRules";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);

describe("needsFinalize (two-phase close repair, F-solo-1 / F-grupal-asincrona-7)", () => {
  it("an active session never needs a repair", () => {
    expect(needsFinalize({ status: "active", closedAt: null, closeFinalizedAt: null }, NOW)).toBe(false);
  });

  it("a finalized close is a no-op, however old", () => {
    expect(
      needsFinalize({ status: "closed", closedAt: ago(9e9), closeFinalizedAt: ago(9e9) }, NOW),
    ).toBe(false);
  });

  it("a close still inside the grace window is left to the call that is finishing it", () => {
    expect(
      needsFinalize({ status: "closed", closedAt: ago(FINALIZE_GRACE_MS - 1), closeFinalizedAt: null }, NOW),
    ).toBe(false);
  });

  it("an unfinalized close older than the grace window is owed a repair", () => {
    expect(
      needsFinalize({ status: "closed", closedAt: ago(FINALIZE_GRACE_MS), closeFinalizedAt: null }, NOW),
    ).toBe(true);
  });

  it("a solo resubmit repairs immediately with grace 0", () => {
    expect(needsFinalize({ status: "closed", closedAt: ago(1000), closeFinalizedAt: null }, NOW, 0)).toBe(true);
  });

  it("a legacy closed row without closedAt is owed", () => {
    expect(needsFinalize({ status: "closed", closedAt: null, closeFinalizedAt: null }, NOW)).toBe(true);
  });

  it("stamping makes the second call a no-op (nothing re-emailed)", () => {
    const row = { status: "closed", closedAt: ago(60 * 60_000), closeFinalizedAt: null as Date | null };
    expect(needsFinalize(row, NOW)).toBe(true);
    row.closeFinalizedAt = new Date(NOW);
    expect(needsFinalize(row, NOW)).toBe(false);
  });
});

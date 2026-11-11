import { describe, expect, it } from "vitest";
import { planClosesAtChange } from "@/lib/sessionState";

// S8-22 B-02: clearing the closing date must not lock participants out.
describe("planClosesAtChange: clearing the date", () => {
  const NOW = Date.parse("2026-10-20T12:00:00Z");

  it("session with activity and no startedAt -> startedAt = now", () => {
    const plan = planClosesAtChange(
      { isGroup: true, closesAt: new Date(NOW + 86_400_000), startedAt: null, hasActivity: true },
      "",
      NOW,
    );
    expect(plan).toEqual({ closesAt: null, closesAtZone: null, isAsync: false, startedAt: new Date(NOW) });
  });

  it("fresh unstarted session (no activity) stays unstarted", () => {
    const plan = planClosesAtChange(
      { isGroup: true, closesAt: new Date(NOW + 86_400_000), startedAt: null, hasActivity: false },
      null,
      NOW,
    );
    expect(plan).toEqual({ closesAt: null, closesAtZone: null, isAsync: false });
    expect(plan && "startedAt" in plan).toBe(false);
  });

  it("an already started session keeps its original startedAt", () => {
    const plan = planClosesAtChange(
      { isGroup: true, startedAt: new Date(NOW - 1000), hasActivity: true },
      "",
      NOW,
    );
    expect(plan && "startedAt" in plan).toBe(false);
  });
});

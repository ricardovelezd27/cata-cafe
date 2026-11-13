import { describe, expect, it } from "vitest";
import { planWaitlistMerge, type WaitlistRowFacts } from "@/lib/waitlistMoveRules";

const row = (id: string, day: number, consent: string | null = null, version: string | null = null): WaitlistRowFacts => ({
  id,
  createdAt: new Date(Date.UTC(2026, 0, day)),
  consentAt: consent ? new Date(consent) : null,
  consentNoticeVersion: version,
});

describe("planWaitlistMerge (S10 leftovers A2)", () => {
  it("keeps the earlier row, deletes the later", () => {
    expect(planWaitlistMerge(row("old", 5), row("new", 9))).toMatchObject({ keepId: "old", deleteId: "new" });
    expect(planWaitlistMerge(row("old", 9), row("new", 5))).toMatchObject({ keepId: "new", deleteId: "old" });
  });

  it("a tie keeps the old-address row", () => {
    expect(planWaitlistMerge(row("old", 5), row("new", 5))).toMatchObject({ keepId: "old", deleteId: "new" });
  });

  it("takes the other's consent stamp only when the kept row has none, as a pair", () => {
    const stamp = "2026-03-01T00:00:00.000Z";
    const p = planWaitlistMerge(row("old", 5), row("new", 9, stamp, "v1"));
    expect(p.adoptConsent).toEqual({ consentAt: new Date(stamp), consentNoticeVersion: "v1" });
    // kept row already has one: untouched
    expect(planWaitlistMerge(row("old", 5, "2026-02-01T00:00:00.000Z", "v0"), row("new", 9, stamp, "v1")).adoptConsent).toBeNull();
    // neither has one
    expect(planWaitlistMerge(row("old", 5), row("new", 9)).adoptConsent).toBeNull();
    // the dropped row has none
    expect(planWaitlistMerge(row("old", 5, stamp, "v1"), row("new", 9)).adoptConsent).toBeNull();
  });
});

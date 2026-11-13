import { describe, expect, it } from "vitest";
import { evaluationWriteAllowed, evaluationWriteRefusal } from "@/lib/sessionState";

// S10 WP3a (X3): the one rule behind "a revealed sample of an open session is
// frozen for ratings". Used by upsertEvaluation and the offline replay.
const NOW = Date.parse("2026-11-13T12:00:00Z");
const open = { status: "active", closesAt: null, revealed: false };

describe("evaluationWriteRefusal", () => {
  it("allows an open, blind sample", () => {
    expect(evaluationWriteRefusal(open, NOW)).toBeNull();
    expect(evaluationWriteAllowed(open, NOW)).toBe(true);
  });

  it("refuses a revealed sample of an open session", () => {
    expect(evaluationWriteRefusal({ ...open, revealed: true }, NOW)).toBe("revealed");
    expect(evaluationWriteAllowed({ ...open, revealed: true }, NOW)).toBe(false);
  });

  it("a closed session is `closed`, revealed or not (closing reveals everything)", () => {
    expect(evaluationWriteRefusal({ ...open, status: "closed" }, NOW)).toBe("closed");
    expect(evaluationWriteRefusal({ ...open, status: "closed", revealed: true }, NOW)).toBe("closed");
  });

  it("an expired session is `closed` even while its status is still active", () => {
    const expired = { ...open, closesAt: new Date(NOW - 1000) };
    expect(evaluationWriteRefusal(expired, NOW)).toBe("closed");
    expect(evaluationWriteRefusal({ ...expired, revealed: true }, NOW)).toBe("closed");
  });

  it("a closing date in the future does not refuse", () => {
    expect(evaluationWriteAllowed({ ...open, closesAt: new Date(NOW + 60_000) }, NOW)).toBe(true);
  });
});

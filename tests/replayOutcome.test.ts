import { describe, expect, it } from "vitest";
import { replayOutcomeFromResult } from "@/lib/offline/replayOutcome";

describe("replayOutcomeFromResult (S8-12 review)", () => {
  it("ok clears the pending flag", () => {
    expect(replayOutcomeFromResult({ ok: true, data: { edited: false } })).toBe("synced");
  });
  it("session_closed is non-retryable and treated as discarded/synced", () => {
    expect(replayOutcomeFromResult({ ok: false, error: "session_closed" })).toBe("synced");
  });
  it("any other refusal is a failure like a throw (retry)", () => {
    for (const error of ["unknown", "not_found_or_forbidden", "not_authenticated", "invalid_input"] as const) {
      expect(replayOutcomeFromResult({ ok: false, error })).toBe("retry");
    }
  });
});

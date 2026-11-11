import { describe, expect, it } from "vitest";
import {
  DIGEST_STALE_MS,
  classifyExistingRun,
  countSent,
  digestInsightsUrl,
  mergeResults,
  parseResults,
  recipientsStillToSend,
  shouldReleasePeriod,
} from "@/lib/digestClaim";

const now = new Date("2026-12-01T12:00:00Z");

describe("classifyExistingRun", () => {
  it("a done row (or a legacy row without status) blocks the period", () => {
    expect(classifyExistingRun({ status: "done", createdAt: now }, now)).toBe("done");
    expect(classifyExistingRun({ status: "", createdAt: now }, now)).toBe("done");
  });
  it("a fresh running row means another invocation is sending", () => {
    const createdAt = new Date(now.getTime() - 60_000);
    expect(classifyExistingRun({ status: "running", createdAt }, now)).toBe("running");
  });
  it("a running row older than 30 minutes can be taken over", () => {
    const createdAt = new Date(now.getTime() - DIGEST_STALE_MS);
    expect(classifyExistingRun({ status: "running", createdAt }, now)).toBe("stale");
  });
});

describe("results bookkeeping", () => {
  it("parses defensively", () => {
    expect(parseResults(null)).toEqual({});
    expect(parseResults([1, 2])).toEqual({});
    expect(parseResults({ "a@x.co": "sent", "b@x.co": "weird" })).toEqual({ "a@x.co": "sent" });
  });
  it("a takeover only sends to recipients without a sent result", () => {
    expect(
      recipientsStillToSend(["a@x.co", "b@x.co"], { "a@x.co": "sent", "b@x.co": "failed" }),
    ).toEqual(["b@x.co"]);
  });
  it("a takeover after a partially recorded loop skips only the recorded sent recipients", () => {
    const targets = ["a@x.co", "b@x.co", "c@x.co"];
    // The run died after recording a's send: b and c still go out, a does not.
    const afterFirst = mergeResults({}, [{ email: "a@x.co", ok: true }]);
    expect(recipientsStillToSend(targets, afterFirst)).toEqual(["b@x.co", "c@x.co"]);
    // Incremental per-recipient merges accumulate and never lose earlier sends.
    const afterSecond = mergeResults(afterFirst, [{ email: "b@x.co", ok: false }]);
    expect(afterSecond).toEqual({ "a@x.co": "sent", "b@x.co": "failed" });
    expect(recipientsStillToSend(targets, afterSecond)).toEqual(["b@x.co", "c@x.co"]);
  });
  it("merging never downgrades a sent recipient", () => {
    const merged = mergeResults({ "a@x.co": "sent" }, [
      { email: "a@x.co", ok: false },
      { email: "b@x.co", ok: true },
    ]);
    expect(merged).toEqual({ "a@x.co": "sent", "b@x.co": "sent" });
    expect(countSent(merged)).toBe(2);
  });
  it("a run with no successful send releases the month (no email key case)", () => {
    expect(shouldReleasePeriod(mergeResults({}, [{ email: "a@x.co", ok: false }]))).toBe(true);
    expect(shouldReleasePeriod({})).toBe(true);
    expect(shouldReleasePeriod({ "a@x.co": "sent" })).toBe(false);
  });
});

describe("digestInsightsUrl", () => {
  it("links to the recipient's locale", () => {
    expect(digestInsightsUrl("https://x.test/", "en")).toBe("https://x.test/en/app/insights");
    expect(digestInsightsUrl("https://x.test", "es")).toBe("https://x.test/es/app/insights");
  });
});

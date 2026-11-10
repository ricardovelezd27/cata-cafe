import { describe, expect, it } from "vitest";
import {
  EXCLUSION_REASONS,
  exclusionData,
  isExclusionReason,
  resultsUpdatedAfterClose,
} from "@/lib/exclusionReasons";
import { extrinsicWriteAllowed } from "@/lib/sessionState";
import * as v from "@/lib/validate";

describe("exclusion reasons (S8-12, F-resultados-5)", () => {
  it("accepts exactly the fixed list through the validator", () => {
    for (const r of EXCLUSION_REASONS) expect(v.oneOf(r, "reason", EXCLUSION_REASONS)).toBe(r);
    expect(() => v.oneOf("because", "reason", EXCLUSION_REASONS)).toThrow();
    expect(() => v.oneOf(undefined, "reason", EXCLUSION_REASONS)).toThrow();
    expect(isExclusionReason("protocol")).toBe(true);
    expect(isExclusionReason("")).toBe(false);
    expect(isExclusionReason(null)).toBe(false);
  });
});

describe("resultsUpdatedAfterClose", () => {
  const closed = new Date("2026-11-01T10:00:00Z");

  it("is null for an open session", () => {
    expect(resultsUpdatedAfterClose(null, [new Date("2026-11-02T00:00:00Z")])).toBeNull();
  });

  it("ignores stamps at or before the close", () => {
    expect(resultsUpdatedAfterClose(closed, [closed, new Date("2026-10-31T00:00:00Z"), null])).toBeNull();
  });

  it("returns the latest stamp strictly after the close", () => {
    const a = new Date("2026-11-02T00:00:00Z");
    const b = new Date("2026-11-03T00:00:00Z");
    expect(resultsUpdatedAfterClose(closed, [a, null, b, undefined])).toEqual(b);
  });
});

describe("extrinsicWriteAllowed (S8-12, F-resultados-4)", () => {
  it("open sessions are unaffected", () => {
    expect(extrinsicWriteAllowed({ over: false, revealed: false })).toBe(true);
    expect(extrinsicWriteAllowed({ over: false, revealed: true })).toBe(true);
  });

  it("after the close only a revealed sample can be corrected", () => {
    expect(extrinsicWriteAllowed({ over: true, revealed: true })).toBe(true);
    expect(extrinsicWriteAllowed({ over: true, revealed: false })).toBe(false);
  });
});

describe("exclusionData (S8-12 review)", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("stamps who/when/why when excluding", () => {
    expect(exclusionData({ excluded: true, reason: "protocol", userId: "u1", now })).toEqual({
      excludedFromResults: true,
      excludedAt: now,
      excludedBy: "u1",
      exclusionReason: "protocol",
    });
  });
  it("requires a valid reason to exclude", () => {
    expect(() => exclusionData({ excluded: true, userId: "u1", now })).toThrow("invalid_input");
    expect(() => exclusionData({ excluded: true, reason: "because", userId: "u1", now })).toThrow();
  });
  it("clears all three trail fields when restoring, ignoring any reason", () => {
    expect(exclusionData({ excluded: false, reason: "protocol", userId: "u1", now })).toEqual({
      excludedFromResults: false,
      excludedAt: null,
      excludedBy: null,
      exclusionReason: null,
    });
  });
});

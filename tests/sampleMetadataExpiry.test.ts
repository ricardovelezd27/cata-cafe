import { describe, expect, it } from "vitest";
import { assertSampleMetadataWritable, assertSessionWritable } from "@/lib/sessionState";

// S8-22 A-05 / S8-28: updateSampleMetadata's write gate, as a pure function.
describe("assertSampleMetadataWritable (A-05)", () => {
  const NOW = Date.parse("2026-10-20T12:00:00Z");
  const expired = { status: "active", closesAt: new Date(NOW - 1000) };
  const open = { status: "active", closesAt: new Date(NOW + 60_000) };
  const closed = { status: "closed", closesAt: new Date(NOW - 1000) };
  const withCoffee = { coffeeId: "c1" };
  const noCoffee = { coffeeId: null };

  it("a label edit on an expired but not-yet-closed session throws session_closed", () => {
    expect(() => assertSampleMetadataWritable(expired, noCoffee, false, NOW)).toThrow("session_closed");
    expect(() => assertSessionWritable(expired, NOW)).toThrow("session_closed");
  });

  it("naming a coffee on an expired-but-active session is still refused (only CLOSED qualifies)", () => {
    expect(() => assertSampleMetadataWritable(expired, noCoffee, true, NOW)).toThrow("session_closed");
  });

  it("an open session accepts any edit", () => {
    expect(() => assertSampleMetadataWritable(open, withCoffee, false, NOW)).not.toThrow();
    expect(() => assertSampleMetadataWritable(open, noCoffee, true, NOW)).not.toThrow();
  });

  it("a row without closesAt is judged on status alone (the original bug)", () => {
    expect(() => assertSampleMetadataWritable({ status: "active" }, noCoffee, false, NOW)).not.toThrow();
  });

  it("closed + coffee-less sample + names a coffee is the sanctioned post-close write", () => {
    expect(() => assertSampleMetadataWritable(closed, noCoffee, true, NOW)).not.toThrow();
  });

  it("closed otherwise stays read-only: label-only, or sample already has a coffee", () => {
    expect(() => assertSampleMetadataWritable(closed, noCoffee, false, NOW)).toThrow("session_closed");
    expect(() => assertSampleMetadataWritable(closed, withCoffee, true, NOW)).toThrow("session_closed");
  });
});

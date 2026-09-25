import { describe, expect, it } from "vitest";
import * as v from "@/lib/validate";

describe("lib/validate", () => {
  it("str trims, enforces bounds, and honours required:false", () => {
    expect(v.str("  hola ", "f", { max: 10 })).toBe("hola");
    expect(v.str("", "f", { max: 10, required: false })).toBeNull();
    expect(v.str(undefined, "f", { max: 10, required: false })).toBeNull();
    expect(() => v.str("", "f", { max: 10 })).toThrow("invalid_input");
    expect(() => v.str("x".repeat(11), "f", { max: 10 })).toThrow("invalid_input");
    expect(() => v.str(42, "f", { max: 10 })).toThrow("invalid_input");
  });

  it("int accepts integers in range (also numeric strings) and rejects the rest", () => {
    expect(v.int(5, "cups", 1, 5)).toBe(5);
    expect(v.int("3", "cups", 1, 5)).toBe(3);
    expect(() => v.int(0, "cups", 1, 5)).toThrow("invalid_input");
    expect(() => v.int(2.5, "cups", 1, 5)).toThrow("invalid_input");
    expect(() => v.int("abc", "cups", 1, 5)).toThrow("invalid_input");
  });

  it("oneOf only admits listed literals", () => {
    expect(v.oneOf("affective", "format", ["descriptive", "affective", "combined"] as const)).toBe(
      "affective",
    );
    expect(() => v.oneOf("weird", "format", ["descriptive"] as const)).toThrow("invalid_input");
  });

  it("isoDate rejects unparseable dates and, with future:true, past dates", () => {
    expect(v.isoDate("2026-10-01T10:00:00.000Z", "d").toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(() => v.isoDate("not a date", "d")).toThrow("invalid_input");
    expect(() => v.isoDate("2000-01-01", "d", { future: true })).toThrow("invalid_input");
    expect(v.isoDate(Date.now() + 3_600_000, "d", { future: true })).toBeInstanceOf(Date);
  });

  it("dateOnlyEndOfDay reads YYYY-MM-DD as the END of that day (UTC)", () => {
    expect(v.dateOnlyEndOfDay("2026-10-01", "closesAt").toISOString()).toBe(
      "2026-10-01T23:59:59.999Z",
    );
    // Strict calendar format only — no time part, no loose "2026-9-1".
    expect(() => v.dateOnlyEndOfDay("2026-9-1", "closesAt")).toThrow("invalid_input");
    expect(() => v.dateOnlyEndOfDay("2026-10-01T10:00:00Z", "closesAt")).toThrow("invalid_input");
    expect(() => v.dateOnlyEndOfDay("2026-13-45", "closesAt")).toThrow("invalid_input");
    expect(() => v.dateOnlyEndOfDay(20261001, "closesAt")).toThrow("invalid_input");
    // future: today is allowed (its end has not passed), yesterday is not.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(v.dateOnlyEndOfDay(today, "closesAt", { future: true })).toBeInstanceOf(Date);
    expect(() => v.dateOnlyEndOfDay(yesterday, "closesAt", { future: true })).toThrow(
      "invalid_input",
    );
  });

  it("list guards length", () => {
    expect(v.list([1, 2], "s", 3)).toEqual([1, 2]);
    expect(() => v.list([1, 2, 3, 4], "s", 3)).toThrow("invalid_input");
    expect(() => v.list("nope", "s", 3)).toThrow("invalid_input");
  });

  it("email normalises and validates", () => {
    expect(v.email("  Pepe@Example.COM ")).toBe("pepe@example.com");
    expect(() => v.email("pepe@")).toThrow("invalid_input");
  });

  it("cupFlags clamps to the cup count and keeps only literal true", () => {
    expect(v.cupFlags([true, 1, "true", false, true, true], 5)).toEqual([true, false, false, false, true]);
    expect(v.cupFlags("bogus", 5)).toEqual([]);
  });

  it("carries the offending field name for debugging", () => {
    try {
      v.int(99, "cupsPerSample", 1, 5);
    } catch (e) {
      expect(e).toBeInstanceOf(v.ValidationError);
      expect((e as v.ValidationError).field).toBe("cupsPerSample");
    }
  });
});

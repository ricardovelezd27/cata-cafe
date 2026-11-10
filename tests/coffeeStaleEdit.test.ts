import { describe, expect, it } from "vitest";
import { isStaleCoffeeEdit } from "../lib/coffeeInputBounds";

describe("isStaleCoffeeEdit", () => {
  const stored = new Date("2026-11-10T12:00:00.000Z");
  it("passes when the form loaded the stored version", () => {
    expect(isStaleCoffeeEdit(stored, stored.toISOString())).toBe(false);
  });
  it("refuses a stale or malformed token", () => {
    expect(isStaleCoffeeEdit(stored, "2026-11-10T11:59:59.000Z")).toBe(true);
    expect(isStaleCoffeeEdit(stored, "not a date")).toBe(true);
  });
  it("skips the check for callers that send none", () => {
    expect(isStaleCoffeeEdit(stored, undefined)).toBe(false);
  });
});

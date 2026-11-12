import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canPickExistingCoffee, needsCupCoffeePicker } from "@/lib/cupCoffeePick";

describe("canPickExistingCoffee", () => {
  const ok = { isOwner: true, writable: true, sampleCoffeeId: null };
  it("allows the owner on a writable coffee-less sample", () => {
    expect(canPickExistingCoffee(ok)).toBe(true);
  });
  it("refuses non-owners, unwritable sessions and samples with a coffee", () => {
    expect(canPickExistingCoffee({ ...ok, isOwner: false })).toBe(false);
    expect(canPickExistingCoffee({ ...ok, writable: false })).toBe(false);
    expect(canPickExistingCoffee({ ...ok, sampleCoffeeId: "c1" })).toBe(false);
  });
});

describe("needsCupCoffeePicker", () => {
  it("is true only when some sample has no coffee", () => {
    const base = { isOwner: true, writable: true };
    expect(needsCupCoffeePicker({ ...base, samples: [{ coffeeId: "a" }, { coffeeId: null }] })).toBe(true);
    expect(needsCupCoffeePicker({ ...base, samples: [{ coffeeId: "a" }] })).toBe(false);
    expect(needsCupCoffeePicker({ ...base, samples: [] })).toBe(false);
  });
  it("is false for participants and unwritable sessions", () => {
    const samples = [{ coffeeId: null }];
    expect(needsCupCoffeePicker({ isOwner: false, writable: true, samples })).toBe(false);
    expect(needsCupCoffeePicker({ isOwner: true, writable: false, samples })).toBe(false);
  });
});

// Static scan (no Prisma): the pick branch re-validates the id, is guarded
// against a concurrent link and is rejected for a sample that has a coffee.
describe("updateSampleMetadata pick branch", () => {
  const src = readFileSync(join(process.cwd(), "app", "actions", "sessions.ts"), "utf8");
  const start = src.indexOf("export async function updateSampleMetadata");
  const body = src.slice(start, src.indexOf("\nexport ", start + 10));
  it("re-validates with usableCoffeeWhere and maps to coffee_not_usable", () => {
    expect(body).toContain("usableCoffeeWhere(user.id)");
    expect(body).toContain('"coffee_not_usable"');
  });
  it("rejects a pick on a sample that already has a coffee", () => {
    expect(body).toMatch(/pickId && sample\.coffeeId\) throw new Error\("invalid_input"\)/);
  });
  it("links guarded by coffeeId: null", () => {
    expect(body).toMatch(/prisma\.sessionSample\.updateMany\(\{\s*where: \{ id: sampleId, coffeeId: null \}/);
  });
});

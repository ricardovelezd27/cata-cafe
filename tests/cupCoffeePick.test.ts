import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canPickExistingCoffee } from "@/lib/cupCoffeePick";

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

// Static scans (no Prisma, no React): the wiring this feature depends on.
describe("cup-page coffee pick wiring", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  const page = read("app", "[locale]", "app", "sessions", "[id]", "cup", "page.tsx");
  const client = read("app", "[locale]", "app", "sessions", "[id]", "cup", "CupClient.tsx");
  const sessions = read("app", "actions", "sessions.ts");

  it("the page never hands a sample's coffee id to a participant", () => {
    expect(page).toContain("coffeeId: isOwner ? s.coffeeId : null");
    expect(page).not.toMatch(/coffeeId: s\.coffeeId,/);
  });
  it("the page does not query the usable-coffee list (hot path)", () => {
    expect(page).not.toContain("getUsableCoffees");
  });
  it("the pick goes through assignSampleCoffee, not updateSampleMetadata", () => {
    expect(client).toMatch(/assignSampleCoffee\(sampleId, \{ coffeeId: picked\.id \}\)/);
    expect(client).not.toMatch(/updateSampleMetadata\([^)]*coffeeId/);
  });
  it("updateSampleMetadata takes no client coffee id", () => {
    const start = sessions.indexOf("export async function updateSampleMetadata");
    const body = sessions.slice(start, sessions.indexOf("\nexport ", start + 10));
    expect(body).not.toContain("pickId");
  });
});

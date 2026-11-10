import { describe, expect, it } from "vitest";
import { planAssignCoffee } from "@/lib/assignCoffee";

describe("planAssignCoffee", () => {
  it("links an existing coffee by id", () => {
    expect(planAssignCoffee({ coffeeId: " abc " })).toEqual({ mode: "link", coffeeId: "abc" });
  });

  it("creates from a typed name and keeps only non-blank optional fields", () => {
    expect(
      planAssignCoffee({ fields: { name: " Geisha ", country: "Panamá", region: "  " } }),
    ).toEqual({ mode: "create", fields: { name: "Geisha", country: "Panamá" } });
  });

  it("an id wins over fields", () => {
    expect(planAssignCoffee({ coffeeId: "x", fields: { name: "ignored" } })).toEqual({
      mode: "link",
      coffeeId: "x",
    });
  });

  it("rejects nothing-at-all, blank names and non-strings", () => {
    expect(() => planAssignCoffee({})).toThrow();
    expect(() => planAssignCoffee({ fields: { name: "  " } })).toThrow();
    expect(() => planAssignCoffee({ coffeeId: 42 })).toThrow();
    expect(() => planAssignCoffee({ fields: { name: "x".repeat(121) } })).toThrow();
  });
});

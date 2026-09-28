import { describe, expect, it } from "vitest";
import {
  ANONYMIZED_COFFEE_DATA,
  coffeeDisplayName,
  isCoffeeDeleted,
} from "../lib/coffeeAnonymize";

describe("ANONYMIZED_COFFEE_DATA", () => {
  it("wipes every identifying field and resets sharing state", () => {
    expect(ANONYMIZED_COFFEE_DATA).toEqual({
      name: "",
      code: null,
      farm: null,
      producer: null,
      notes: null,
      certifications: [],
      visibility: "private",
      resultsPublished: false,
      resultsPublishedAt: null,
    });
  });

  it("never touches analytical attributes", () => {
    const keys = Object.keys(ANONYMIZED_COFFEE_DATA);
    for (const kept of [
      "country",
      "region",
      "variety",
      "species",
      "processType",
      "altitude",
      "harvestYear",
      "roastLevel",
    ]) {
      expect(keys).not.toContain(kept);
    }
  });
});

describe("isCoffeeDeleted", () => {
  it("is true only when deletedAt is set", () => {
    expect(isCoffeeDeleted({ deletedAt: null })).toBe(false);
    expect(isCoffeeDeleted({ deletedAt: undefined })).toBe(false);
    expect(isCoffeeDeleted({ deletedAt: new Date() })).toBe(true);
    expect(isCoffeeDeleted({ deletedAt: "2026-09-26T00:00:00Z" })).toBe(true);
  });
});

describe("coffeeDisplayName", () => {
  it("returns the name for a live coffee", () => {
    expect(coffeeDisplayName({ name: "Gesha Lote 3", deletedAt: null }, "X")).toBe("Gesha Lote 3");
    expect(coffeeDisplayName({ name: "Gesha Lote 3" }, "X")).toBe("Gesha Lote 3");
  });
  it("falls back when the name is blank, deletedAt is set, or the coffee is missing", () => {
    expect(coffeeDisplayName({ name: "" }, "Café eliminado")).toBe("Café eliminado");
    expect(coffeeDisplayName({ name: "Still here", deletedAt: new Date() }, "X")).toBe("X");
    expect(coffeeDisplayName(null, "X")).toBe("X");
    expect(coffeeDisplayName(undefined, "X")).toBe("X");
  });
});

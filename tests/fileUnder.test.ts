import { describe, it, expect } from "vitest";
import { searchFlavors, shouldOfferFileUnder } from "@/lib/flavorSearch";

describe("shouldOfferFileUnder", () => {
  it("offers the row for words with only fuzzy hits", () => {
    expect(shouldOfferFileUnder(searchFlavors("lulo"), "lulo")).toBe(true);
  });
  it("does not offer it for exact matches", () => {
    expect(shouldOfferFileUnder(searchFlavors("chocolate"), "chocolate")).toBe(false);
  });
  it("does not offer it for prefix matches", () => {
    expect(shouldOfferFileUnder(searchFlavors("cítr"), "cítr")).toBe(false);
  });
  it("needs at least 3 characters", () => {
    expect(shouldOfferFileUnder([], "lu")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  deltasVsReference,
  formatSignedDelta,
  pickDisplayedScore,
  referenceDelta,
} from "@/lib/referenceDelta";

// The reference sample is display-only context (PRODUCT.md "el puntaje
// necesita contexto"): a Δ never changes a score, and it must vanish rather
// than invent a number when either side is unscored.

const rows = [
  { id: "a", score: 84.5 },
  { id: "b", score: 86 },
  { id: "c", score: 82.25 },
  { id: "d", score: null },
];

describe("deltasVsReference", () => {
  it("is all-null without a reference", () => {
    const m = deltasVsReference(rows, null);
    expect([...m.values()]).toEqual([null, null, null, null]);
  });

  it("is all-null when the reference itself is unscored", () => {
    const m = deltasVsReference(rows, "d");
    expect([...m.values()]).toEqual([null, null, null, null]);
  });

  it("is all-null when the reference id is not among the rows", () => {
    const m = deltasVsReference(rows, "zzz");
    expect([...m.values()]).toEqual([null, null, null, null]);
  });

  it("subtracts the reference score and blanks the reference row", () => {
    const m = deltasVsReference(rows, "a");
    expect(m.get("a")).toBeNull();
    expect(m.get("b")).toBeCloseTo(1.5);
    expect(m.get("c")).toBeCloseTo(-2.25);
    expect(m.get("d")).toBeNull();
  });
});

describe("referenceDelta", () => {
  it("returns null when either side is missing", () => {
    expect(referenceDelta(null, 80)).toBeNull();
    expect(referenceDelta(80, null)).toBeNull();
    expect(referenceDelta(81.25, 80)).toBeCloseTo(1.25);
  });
});

describe("formatSignedDelta", () => {
  it("signs, pads and uses a real minus sign", () => {
    expect(formatSignedDelta(1.5)).toBe("+1.50");
    expect(formatSignedDelta(-2.25)).toBe("\u22122.25");
  });

  it("never renders negative zero", () => {
    expect(formatSignedDelta(0)).toBe("0.00");
    expect(formatSignedDelta(0.001)).toBe("0.00");
    expect(formatSignedDelta(-0.004)).toBe("0.00");
  });
});

describe("pickDisplayedScore", () => {
  it("mirrors the ranking's community-first rule", () => {
    expect(pickDisplayedScore(84, 86, true)).toBe(86);
    expect(pickDisplayedScore(84, null, true)).toBe(84);
    expect(pickDisplayedScore(84, 86, false)).toBe(84);
    expect(pickDisplayedScore(null, null, true)).toBeNull();
  });
});

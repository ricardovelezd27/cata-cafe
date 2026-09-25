import { describe, expect, it } from "vitest";
import {
  REFERENCE_PIN_VALUE,
  isPinnedModule,
  isReferencePinned,
  orderReferenceFirst,
  pinReferenceAffective,
} from "@/lib/referenceRules";
import { calcIndividualScore } from "@/lib/scoring";
import { stepMissing } from "@/lib/completeness";
import { AFFECTIVE_ATTRIBUTES, CUPPING_STEPS } from "@/lib/constants";

// The reference is the calibration anchor: it is cupped first and every
// cupper gives it exactly 79.00 (all eight qualities at 5, no cup penalties).

const samples = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

describe("orderReferenceFirst", () => {
  it("moves the reference to the front and keeps the rest in order", () => {
    expect(orderReferenceFirst(samples, "b").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(orderReferenceFirst(samples, "c").map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for null or an unknown reference", () => {
    expect(orderReferenceFirst(samples, null).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(orderReferenceFirst(samples, "zzz").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const copy = [...samples];
    orderReferenceFirst(samples, "c");
    expect(samples).toEqual(copy);
  });
});

describe("pinReferenceAffective", () => {
  it("pins every affective rating to 5 and clears the cups", () => {
    const pinned = pinReferenceAffective(
      { fragancia_af_final: 8, tazas_no_uniformes: [true, false], tazas_defectuosas: [true, false], defecto_tipo: ["fenol"], fragancia_int: 10 },
      2,
    );
    for (const attr of AFFECTIVE_ATTRIBUTES) {
      expect(pinned[`${attr.id}_final`]).toBe(REFERENCE_PIN_VALUE);
    }
    expect(pinned.tazas_no_uniformes).toEqual([false, false]);
    expect(pinned.tazas_defectuosas).toEqual([false, false]);
    expect(pinned.defecto_tipo).toEqual([]);
    // Descriptive fields are the cupper's — untouched.
    expect(pinned.fragancia_int).toBe(10);
  });

  it("scores exactly 79.00 whatever the cup count", () => {
    expect(calcIndividualScore(pinReferenceAffective({}, 2), 2)).toBe(79);
    expect(calcIndividualScore(pinReferenceAffective({ tazas_defectuosas: [true, true, true, true, true] }, 5), 5)).toBe(79);
  });

  it("satisfies the affective completeness guard on every step", () => {
    const pinned = pinReferenceAffective({}, 2);
    for (const step of CUPPING_STEPS) {
      expect(
        stepMissing({ affective: pinned, descriptive: {}, combined: {} }, step, "affective"),
      ).toEqual([]);
    }
  });

  it("reports whether data is already pinned", () => {
    expect(isReferencePinned({})).toBe(false);
    expect(isReferencePinned(pinReferenceAffective({}, 2))).toBe(true);
    expect(isReferencePinned({ ...pinReferenceAffective({}, 2), tazas_defectuosas: [true, false] })).toBe(false);
  });
});

describe("isPinnedModule", () => {
  it("pins affective and combined, never descriptive", () => {
    expect(isPinnedModule("affective")).toBe(true);
    expect(isPinnedModule("combined")).toBe(true);
    expect(isPinnedModule("descriptive")).toBe(false);
  });
});

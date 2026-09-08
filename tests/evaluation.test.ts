import { describe, expect, it } from "vitest";
import { computeEvaluationDerived, moduleKeyForFormat } from "@/lib/evaluation";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

const neutral = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 5]));

describe("computeEvaluationDerived (server-side derivation)", () => {
  it("routes the payload to the column that matches the session format", () => {
    expect(moduleKeyForFormat("descriptive")).toBe("descriptive");
    expect(moduleKeyForFormat("affective")).toBe("affective");
    expect(moduleKeyForFormat("combined")).toBe("combined");
    // Unknown/legacy formats coerce to combined, like asSessionFormat does.
    expect(moduleKeyForFormat("whatever")).toBe("combined");

    expect("affectiveData" in computeEvaluationDerived("affective", neutral, 5)).toBe(true);
    expect("descriptiveData" in computeEvaluationDerived("descriptive", neutral, 5)).toBe(true);
  });

  it("clamps cup arrays to the session's cup count and coerces non-booleans to false", () => {
    const data = {
      ...neutral,
      tazas_no_uniformes: [true, "yes", 1, true, true, true, true, true],
      tazas_defectuosas: [null, true],
    };
    const derived = computeEvaluationDerived("combined", data, 5);
    expect(derived.nonUniformCups).toEqual([true, false, false, true, true]);
    expect(derived.defectiveCups).toEqual([false, true]);
    // Only 3 non-uniform + 1 defective survive → 79 − 6 − 4 = 69
    expect(derived.individualScore).toBe(69);
  });

  it("never lets a client skip the ≥5-cup penalties by passing its own cupsPerSample", () => {
    // The action passes the SESSION's cupsPerSample (5), so penalties apply even
    // if the client claimed 1 cup.
    const data = { ...neutral, tazas_defectuosas: [true] };
    expect(computeEvaluationDerived("combined", data, 5).individualScore).toBe(75);
  });

  it("descriptive-only modules carry no raw score", () => {
    expect(computeEvaluationDerived("descriptive", neutral, 5).rawScore).toBeNull();
  });
});

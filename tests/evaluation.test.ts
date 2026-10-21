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

describe("nota_express (quick note) travels inside the module JSON", () => {
  const NOTE = "floral, té negro, final largo";
  it.each([
    ["descriptive", "descriptiveData"],
    ["affective", "affectiveData"],
    ["combined", "combinedData"],
  ] as const)("lands in the %s column and survives derivation", (format, column) => {
    const derived = computeEvaluationDerived(
      moduleKeyForFormat(format),
      { ...neutral, nota_express: NOTE },
      1,
    ) as Record<string, unknown>;
    const stored = derived[column] as Record<string, unknown>;
    expect(stored.nota_express).toBe(NOTE);
    // It is a key, never a column: nothing else on the row carries it.
    expect("nota_express" in derived).toBe(false);
  });

  it("does not change the derived scores", () => {
    const a = computeEvaluationDerived("affective", neutral, 1);
    const b = computeEvaluationDerived("affective", { ...neutral, nota_express: NOTE }, 1);
    expect(b.individualScore).toBe(a.individualScore);
    expect(b.affectiveSum).toBe(a.affectiveSum);
  });
});

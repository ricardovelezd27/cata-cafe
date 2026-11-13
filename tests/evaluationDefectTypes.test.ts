import { describe, expect, it } from "vitest";
import { computeEvaluationDerived, tryComputeEvaluationDerived } from "@/lib/evaluation";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { cupDefectTypes } from "@/lib/validate";
import { pinReferenceAffective } from "@/lib/referenceRules";

// S10 WP1b: the per-cup defect type (module JSON key `tazas_defecto_tipo`) and
// what computeEvaluationDerived (the ONE derivation of the live save and the
// offline replay) stores for it. TODO(kim-validar:A3)

const neutral = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 5]));
const KEY = "tazas_defecto_tipo";

function derive(extra: Record<string, unknown>, cups: number) {
  return computeEvaluationDerived("affective", { ...neutral, ...extra }, cups);
}
const stored = (d: ReturnType<typeof derive>) => d.affectiveData as Record<string, unknown>;

describe("cupDefectTypes (validator)", () => {
  it("returns exactly `cups` entries: pads short, cuts long, non-array -> all null", () => {
    expect(cupDefectTypes(["moldy"], 3)).toEqual(["moldy", null, null]);
    expect(cupDefectTypes(["moldy", "potato", "phenolic", "moldy"], 2)).toEqual(["moldy", "potato"]);
    expect(cupDefectTypes("moldy", 2)).toEqual([null, null]);
    expect(cupDefectTypes(undefined, 0)).toEqual([]);
  });
  it("turns anything that is not one of the three defect ids into null", () => {
    expect(cupDefectTypes(["fenol", 3, {}, "MOLDY", null, "potato"], 6)).toEqual([
      null, null, null, null, null, "potato",
    ]);
  });
});

describe("computeEvaluationDerived with per-cup defect types", () => {
  it("key ABSENT: a legacy blob is stored exactly as posted (flags and distinct list)", () => {
    const d = derive(
      { tazas_no_uniformes: [false, false, false], tazas_defectuosas: [false, true, false], defecto_tipo: ["phenolic"] },
      3,
    );
    expect(d.defectiveCups).toEqual([false, true, false]);
    // not forced non-uniform, no per-cup key invented
    expect(d.nonUniformCups).toEqual([false, false, false]);
    expect(d.defectTypes).toEqual(["phenolic"]);
    expect(KEY in stored(d)).toBe(false);
    // 79 - 4 (defective only, as before)
    expect(d.individualScore).toBe(75);
  });

  it("key ABSENT and a flagged cup with no type at all still counts (legacy)", () => {
    const d = derive({ tazas_defectuosas: [true, false] }, 2);
    expect(d.defectiveCups).toEqual([true, false]);
    expect(d.defectTypes).toEqual([]);
  });

  it("key PRESENT: typed defective cups count, are forced non-uniform, and the distinct list is derived in SENSORY_DEFECTS order", () => {
    const d = derive(
      {
        tazas_defectuosas: [true, false, true, true],
        tazas_no_uniformes: [false, false, false, false],
        [KEY]: ["phenolic", null, "moldy", "phenolic"],
        defecto_tipo: ["garbage"],
      },
      4,
    );
    expect(d.defectiveCups).toEqual([true, false, true, true]);
    expect(d.nonUniformCups).toEqual([true, false, true, true]);
    expect(stored(d)[KEY]).toEqual(["phenolic", null, "moldy", "phenolic"]);
    // order of SENSORY_DEFECTS = potato, moldy, phenolic
    expect(d.defectTypes).toEqual(["moldy", "phenolic"]);
    expect(stored(d).defecto_tipo).toEqual(["moldy", "phenolic"]);
    // 79 - 3 defective x 4 - 3 non-uniform x 2 = 61
    expect(d.individualScore).toBe(61);
  });

  it("key PRESENT: a flagged cup with NO type STAYS defective (sin especificar), forced non-uniform", () => {
    const d = derive({ tazas_defectuosas: [true, true], [KEY]: ["potato", null] }, 2);
    expect(d.defectiveCups).toEqual([true, true]);
    expect(d.nonUniformCups).toEqual([true, true]);
    expect(stored(d)[KEY]).toEqual(["potato", null]);
    expect(d.defectTypes).toEqual(["potato"]);
  });

  it("key PRESENT: a type on an UNFLAGGED cup is cleared to null", () => {
    const d = derive({ tazas_defectuosas: [false, true], [KEY]: ["moldy", "moldy"] }, 2);
    expect(d.defectiveCups).toEqual([false, true]);
    expect(stored(d)[KEY]).toEqual([null, "moldy"]);
  });

  it("key PRESENT: an over-long array is cut to the session's cups; garbage is null", () => {
    const d = derive(
      { tazas_defectuosas: [true, true, true, true], [KEY]: ["moldy", "no-such", 7, "potato", "moldy", "moldy"] },
      3,
    );
    expect((stored(d)[KEY] as unknown[]).length).toBe(3);
    expect(stored(d)[KEY]).toEqual(["moldy", null, null]);
    expect(d.defectiveCups).toEqual([true, true, true]);
  });

  it("key PRESENT with a non-array value: every cup untyped but flagged cups stay defective", () => {
    const d = derive({ tazas_defectuosas: [true, true], [KEY]: "moldy" }, 2);
    expect(d.defectiveCups).toEqual([true, true]);
    expect(stored(d)[KEY]).toEqual([null, null]);
    expect(d.defectTypes).toEqual([]);
  });

  it("ONE cup: a typed defect counts (4), non-uniform stays false", () => {
    const d = derive({ tazas_defectuosas: [true], tazas_no_uniformes: [true], [KEY]: ["phenolic"] }, 1);
    expect(d.defectiveCups).toEqual([true]);
    expect(d.nonUniformCups).toEqual([false]);
    expect(d.individualScore).toBe(75);
  });

  it("a typed cup is always a defective cup (an untyped flagged cup is defective too)", () => {
    const d = derive(
      { tazas_defectuosas: [true, true, false, true], [KEY]: [null, "potato", "moldy", "phenolic"] },
      4,
    );
    const types = stored(d)[KEY] as (string | null)[];
    expect(d.defectiveCups).toEqual([true, true, false, true]);
    types.forEach((t, i) => { if (t !== null) expect(d.defectiveCups[i]).toBe(true); });
  });

  it("the offline replay derivation (tryComputeEvaluationDerived) applies the same rule", () => {
    const data = { ...neutral, tazas_defectuosas: [true, true], [KEY]: ["moldy", null] };
    const live = computeEvaluationDerived("affective", data, 2);
    const replay = tryComputeEvaluationDerived("affective", data, 2);
    expect(replay).toEqual(live);
    expect(replay?.defectiveCups).toEqual([true, true]);
  });
});

describe("pinReferenceAffective clears the per-cup defect types too", () => {
  it("overwrites tazas_defecto_tipo with nulls", () => {
    const pinned = pinReferenceAffective(
      { tazas_defectuosas: [true, false], tazas_no_uniformes: [true, false], [KEY]: ["moldy", null], defecto_tipo: ["moldy"] },
      2,
    );
    expect(pinned[KEY]).toEqual([null, null]);
    expect(pinned.tazas_defectuosas).toEqual([false, false]);
    expect(pinned.defecto_tipo).toEqual([]);
    expect(computeEvaluationDerived("affective", pinned, 2).individualScore).toBe(79);
  });
});

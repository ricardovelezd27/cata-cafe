import { describe, expect, it } from "vitest";
import { applyDefectChoice, applyNonUniformToggle, defectTally, formCupState } from "@/lib/cupDefects";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

const KEY = "tazas_defecto_tipo";
const neutral = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 5]));

describe("defectTally (reads both shapes)", () => {
  it("new shape: counts by type, a flagged cup with a null type is unspecified", () => {
    const t = defectTally(
      { tazas_defectuosas: [true, true, true, false], [KEY]: ["moldy", "moldy", null, "potato"] },
      4,
    );
    expect(t).toEqual({ byType: { potato: 0, moldy: 2, phenolic: 0 }, unspecified: 1, total: 3 });
  });
  it("legacy shape (key absent): every flagged cup is unspecified, even with a legacy distinct list", () => {
    const t = defectTally({ tazas_defectuosas: [true, false, true], defecto_tipo: ["phenolic"] }, 3);
    expect(t).toEqual({ byType: { potato: 0, moldy: 0, phenolic: 0 }, unspecified: 2, total: 2 });
  });
  it("clamps to the cups, ignores types on unflagged cups, tolerates missing data", () => {
    expect(defectTally({ tazas_defectuosas: [true, true, true], [KEY]: ["moldy", "moldy", "moldy"] }, 2).total).toBe(2);
    expect(defectTally({ tazas_defectuosas: [false], [KEY]: ["moldy"] }, 1).total).toBe(0);
    expect(defectTally(null, 3).total).toBe(0);
    expect(defectTally({}, 3)).toEqual({ byType: { potato: 0, moldy: 0, phenolic: 0 }, unspecified: 0, total: 0 });
  });
});

describe("form helpers", () => {
  it("choosing a type marks the cup defective and non-uniform (2+ cups) and derives the list", () => {
    const d = applyDefectChoice({}, 3, 1, "phenolic");
    expect(d.tazas_defectuosas).toEqual([false, true, false]);
    expect(d.tazas_no_uniformes).toEqual([false, true, false]);
    expect(d[KEY]).toEqual([null, "phenolic", null]);
    expect(d.defecto_tipo).toEqual(["phenolic"]);
  });
  it("with ONE cup a type marks it defective and non-uniform stays false", () => {
    const d = applyDefectChoice({}, 1, 0, "moldy");
    expect(d.tazas_defectuosas).toEqual([true]);
    expect(d.tazas_no_uniformes).toEqual([false]);
  });
  it("changing the type replaces it; removing the mark clears flag and type but keeps non-uniform", () => {
    let d = applyDefectChoice({}, 2, 0, "moldy");
    d = applyDefectChoice(d, 2, 0, "potato");
    expect(d[KEY]).toEqual(["potato", null]);
    expect(d.defecto_tipo).toEqual(["potato"]);
    d = applyDefectChoice(d, 2, 0, null);
    expect(d.tazas_defectuosas).toEqual([false, false]);
    expect(d[KEY]).toEqual([null, null]);
    expect(d.defecto_tipo).toEqual([]);
    expect(d.tazas_no_uniformes).toEqual([true, false]);
  });
  it("unmarking a non-uniform cup also clears its defect and type", () => {
    let d = applyDefectChoice({}, 2, 1, "moldy");
    d = applyNonUniformToggle(d, 2, 1);
    expect(d.tazas_no_uniformes).toEqual([false, false]);
    expect(d.tazas_defectuosas).toEqual([false, false]);
    expect(d[KEY]).toEqual([null, null]);
  });
  it("a non-uniform toggle does nothing with one cup", () => {
    const d = { a: 1 };
    expect(applyNonUniformToggle(d, 1, 0)).toBe(d);
  });
  it("a LEGACY draft is not silently dropped: the single legacy type seeds its flagged cups", () => {
    const legacy = { tazas_defectuosas: [true, false], tazas_no_uniformes: [true, false], defecto_tipo: ["moldy"] };
    expect(formCupState(legacy, 2).types).toEqual(["moldy", null]);
    const d = applyNonUniformToggle(legacy, 2, 1);
    const derived = computeEvaluationDerived("affective", { ...neutral, ...d }, 2);
    expect(derived.defectiveCups).toEqual([true, false]);
  });
  it("a legacy draft with two legacy types leaves the flagged cups untyped (the form asks for them)", () => {
    const legacy = { tazas_defectuosas: [true, true], defecto_tipo: ["moldy", "potato"] };
    expect(formCupState(legacy, 2).types).toEqual([null, null]);
  });
  it("what the form produces is accepted unchanged by the server derivation", () => {
    let d: Record<string, unknown> = { ...neutral };
    d = applyDefectChoice(d, 4, 2, "potato");
    d = applyNonUniformToggle(d, 4, 0);
    const derived = computeEvaluationDerived("affective", d, 4);
    expect(derived.defectiveCups).toEqual(d.tazas_defectuosas);
    expect(derived.nonUniformCups).toEqual(d.tazas_no_uniformes);
    expect(derived.defectTypes).toEqual(["potato"]);
  });
});

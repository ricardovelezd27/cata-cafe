import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import {
  clearCooledValue,
  clearPartialKeys,
  cooledPair,
  hasPartialKeys,
  inicialKey,
  isAffectiveDeclaredPartial,
  isNotEvaluated,
  neKey,
  notEvaluatedIds,
  sanitizeCooledValues,
  setCooledValue,
  setNotEvaluated,
} from "@/lib/affectivePartial";
import {
  calcIndividualScore,
  computeGroupAggregate,
  hasIndividualScore,
  isAffectiveComplete,
} from "@/lib/scoring";
import { computeEvaluationDerived, tryComputeEvaluationDerived } from "@/lib/evaluation";
import { isReferencePinned, pinReferenceAffective } from "@/lib/referenceRules";
import { stepMissing, type SampleModules } from "@/lib/completeness";
import { deriveMyEvaluation, isEvaluationComplete, canShowMyScore } from "@/lib/evaluationState";
import { isEvaluationComplete as closeRowComplete } from "@/lib/closeRules";

// S10 WP3b (Kim C4 "no evaluado", A5 "as it cooled"). TODO(kim-validar:C4) TODO(kim-validar:A5)
const IDS = AFFECTIVE_ATTRIBUTES.map((a) => a.id);
const all = (v: number): Record<string, unknown> => Object.fromEntries(IDS.map((id) => [`${id}_final`, v]));
const marked = (data: Record<string, unknown>, ...ids: string[]) => {
  const out = { ...data };
  for (const id of ids) {
    delete out[`${id}_final`];
    out[neKey(id)] = true;
  }
  return out;
};

describe("isAffectiveDeclaredPartial: truth table over rated / marked / neither", () => {
  it("all eight rated is complete, not a partial", () => {
    expect(isAffectiveComplete(all(6))).toBe(true);
    expect(isAffectiveDeclaredPartial(all(6))).toBe(false);
  });

  it("seven rated + one marked is a declared partial (and not complete)", () => {
    const d = marked(all(6), "acidez_af");
    expect(isAffectiveDeclaredPartial(d)).toBe(true);
    expect(isAffectiveComplete(d)).toBe(false);
  });

  it("one rated + seven marked is a declared partial", () => {
    const d = marked(all(6), ...IDS.slice(1));
    expect(isAffectiveDeclaredPartial(d)).toBe(true);
  });

  it("a section that is neither rated nor marked keeps the evaluation as incomplete as ever", () => {
    const d = { ...all(6) };
    delete d["acidez_af_final"];
    expect(isAffectiveDeclaredPartial(d)).toBe(false);
    // ... even with another section marked
    expect(isAffectiveDeclaredPartial(marked(d, "aroma_af"))).toBe(false);
  });

  it("eight marked and nothing rated is not a partial (nothing to average)", () => {
    expect(isAffectiveDeclaredPartial(marked(all(6), ...IDS))).toBe(false);
  });

  it("only the literal boolean true counts as a marker", () => {
    for (const bad of ["true", 1, "1", null, false, {}, []]) {
      const d: Record<string, unknown> = { ...all(6) };
      delete d["acidez_af_final"];
      d[neKey("acidez_af")] = bad;
      expect(isAffectiveDeclaredPartial(d), String(bad)).toBe(false);
    }
  });

  it("an empty / missing blob is not a partial", () => {
    expect(isAffectiveDeclaredPartial({})).toBe(false);
    expect(isAffectiveDeclaredPartial(null)).toBe(false);
    expect(isAffectiveDeclaredPartial(undefined)).toBe(false);
  });

  it("reads the rating like the scorer: `<id>_final`, else the bare `<id>`", () => {
    const d: Record<string, unknown> = Object.fromEntries(IDS.map((id) => [id, 5]));
    delete d["sabor_af"];
    d[neKey("sabor_af")] = true;
    expect(isAffectiveDeclaredPartial(d)).toBe(true);
  });

  it("notEvaluatedIds lists the marked sections in attribute order", () => {
    expect(notEvaluatedIds(marked(all(6), "dulzor_af", "aroma_af"))).toEqual(["aroma_af", "dulzor_af"]);
    expect(isNotEvaluated(marked(all(6), "dulzor_af"), "dulzor_af")).toBe(true);
    expect(isNotEvaluated(all(6), "dulzor_af")).toBe(false);
  });
});

describe("hasIndividualScore: a declared partial has no total, an old incomplete row keeps today's behaviour", () => {
  it("complete: yes; empty: no; declared partial: no", () => {
    expect(hasIndividualScore(all(6))).toBe(true);
    expect(hasIndividualScore({})).toBe(false);
    expect(hasIndividualScore(marked(all(6), "aroma_af"))).toBe(false);
  });

  it("an unmarked incomplete evaluation is unchanged (still has the 5-filled score it always had)", () => {
    const d = { ...all(6) };
    delete d["aroma_af_final"];
    expect(hasIndividualScore(d)).toBe(true);
    expect(typeof calcIndividualScore(d, 5)).toBe("number");
  });
});

describe("derivation (computeEvaluationDerived)", () => {
  const cups = 3;

  it("a declared partial stores NULL raw / individual / sum scores, never a 5-filled one", () => {
    const f = computeEvaluationDerived("affective", marked(all(7), "dulzor_af"), cups);
    expect(f.rawScore).toBeNull();
    expect(f.individualScore).toBeNull();
    expect(f.affectiveSum).toBeNull();
    expect(f.cups).toBe(cups);
  });

  it("the marker deletes the section's stale ratings (base, _final and _inicial)", () => {
    const f = computeEvaluationDerived(
      "affective",
      { ...all(6), dulzor_af: 4, dulzor_af_inicial: 3, [neKey("dulzor_af")]: true },
      cups,
    );
    const stored = f.affectiveData as Record<string, unknown>;
    expect("dulzor_af_final" in stored).toBe(false);
    expect("dulzor_af" in stored).toBe(false);
    expect("dulzor_af_inicial" in stored).toBe(false);
    expect(stored["dulzor_af_ne"]).toBe(true);
    expect(f.individualScore).toBeNull();
  });

  it("any other _ne value is dropped (only the literal true is stored)", () => {
    const f = computeEvaluationDerived("affective", { ...all(6), aroma_af_ne: "true", sabor_af_ne: 1, acidez_af_ne: false }, cups);
    const stored = f.affectiveData as Record<string, unknown>;
    expect("aroma_af_ne" in stored).toBe(false);
    expect("sabor_af_ne" in stored).toBe(false);
    expect("acidez_af_ne" in stored).toBe(false);
    expect(f.individualScore).not.toBeNull();
  });

  it("a complete evaluation is unchanged byte for byte (keys, order and scores)", () => {
    const data = { ...all(6), fragancia_af_notas: "x", mercado: "propio" };
    const f = computeEvaluationDerived("affective", data, cups);
    const stored = f.affectiveData as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual([...Object.keys(data), "tazas_no_uniformes", "tazas_defectuosas", "defecto_tipo"]);
    expect(f.rawScore).toBeCloseTo(0.65625 * 48 + 52.75, 9);
    expect(f.individualScore).toBe(calcIndividualScore(stored, cups));
  });

  it("an unmarked incomplete evaluation is derived exactly as before (5-filled)", () => {
    const d = { ...all(6) };
    delete d["aroma_af_final"];
    const f = computeEvaluationDerived("affective", d, cups);
    expect(f.rawScore).toBeCloseTo(0.65625 * 47 + 52.75, 9);
    expect(typeof f.individualScore).toBe("number");
  });

  it("works for the combined module and never touches a descriptive module", () => {
    const c = computeEvaluationDerived("combined", marked(all(6), "aroma_af"), cups);
    expect(c.rawScore).toBeNull();
    expect((c.combinedData as Record<string, unknown>)["aroma_af_ne"]).toBe(true);
    const d = computeEvaluationDerived("descriptive", { aroma_af_ne: true, x: 1 }, cups);
    expect((d.descriptiveData as Record<string, unknown>)["aroma_af_ne"]).toBe(true);
    expect(d.rawScore).toBeNull();
  });

  it("offline replay path: tryComputeEvaluationDerived derives the same partial", () => {
    const f = tryComputeEvaluationDerived("affective", marked(all(7), "sabor_af"), cups);
    expect(f).not.toBeNull();
    expect(f!.individualScore).toBeNull();
    expect(f!.rawScore).toBeNull();
  });

  it("the legacy-draft rewrite path (same derivation) gives a partial a NULL score too", () => {
    // lib/legacyDrafts.ts recomputes through tryComputeEvaluationDerived with the stored module.
    const stored = marked(all(5), "sabor_af", "dulzor_af");
    const f = tryComputeEvaluationDerived("combined", stored, 2);
    expect(f!.individualScore).toBeNull();
    expect(f!.cups).toBe(2);
  });
});

describe("_inicial (the value before it cooled) is display-only", () => {
  it("is clamped to 1..9 and rounded; a non-number is removed", () => {
    const base = { ...all(8), cups: 1 };
    expect(sanitizeCooledValues({ ...base, aroma_af_inicial: 99 })["aroma_af_inicial"]).toBe(9);
    expect(sanitizeCooledValues({ ...base, aroma_af_inicial: 0 })["aroma_af_inicial"]).toBe(1);
    expect(sanitizeCooledValues({ ...base, aroma_af_inicial: 6.6 })["aroma_af_inicial"]).toBe(7);
    for (const bad of ["7", null, NaN, Infinity, {}, [], true]) {
      expect("aroma_af_inicial" in sanitizeCooledValues({ ...base, aroma_af_inicial: bad }), String(bad)).toBe(false);
    }
  });

  it("is dropped when it equals `_final`, or when there is no `_final`", () => {
    expect("aroma_af_inicial" in sanitizeCooledValues({ aroma_af_final: 7, aroma_af_inicial: 7 })).toBe(false);
    expect("aroma_af_inicial" in sanitizeCooledValues({ aroma_af_inicial: 7 })).toBe(false);
    expect(sanitizeCooledValues({ aroma_af_final: 8, aroma_af_inicial: 7 })["aroma_af_inicial"]).toBe(7);
  });

  it("PROPERTY: changing any _inicial never changes rawScore / individualScore / sum", () => {
    const rng = (() => {
      let s = 12345;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    for (let i = 0; i < 200; i++) {
      const data: Record<string, unknown> = {};
      for (const id of IDS) data[`${id}_final`] = 1 + Math.floor(rng() * 9);
      if (rng() < 0.3) {
        const m = IDS[Math.floor(rng() * IDS.length)];
        delete data[`${m}_final`];
        data[neKey(m)] = true;
      }
      const cups = 1 + Math.floor(rng() * 6);
      const before = computeEvaluationDerived("affective", data, cups);
      const withInicial: Record<string, unknown> = { ...data };
      for (const id of IDS) if (rng() < 0.7) withInicial[inicialKey(id)] = 1 + Math.floor(rng() * 9);
      const after = computeEvaluationDerived("affective", withInicial, cups);
      expect(after.rawScore).toBe(before.rawScore);
      expect(after.individualScore).toBe(before.individualScore);
      expect(after.affectiveSum).toBe(before.affectiveSum);
    }
  });

  it("cooledPair shows 'from -> to' only when the two differ", () => {
    expect(cooledPair({ aroma_af_final: 8, aroma_af_inicial: 7 }, "aroma_af")).toEqual({ from: 7, to: 8 });
    expect(cooledPair({ aroma_af_final: 8, aroma_af_inicial: 8 }, "aroma_af")).toBeNull();
    expect(cooledPair({ aroma_af_final: 8 }, "aroma_af")).toBeNull();
    expect(cooledPair(null, "aroma_af")).toBeNull();
  });
});

describe("form transitions", () => {
  it("'No evaluado' on clears the section; off re-opens it empty", () => {
    const on = setNotEvaluated({ ...all(6), aroma_af_inicial: 4 }, "aroma_af", true);
    expect(on["aroma_af_ne"]).toBe(true);
    expect("aroma_af_final" in on).toBe(false);
    expect("aroma_af_inicial" in on).toBe(false);
    const off = setNotEvaluated(on, "aroma_af", false);
    expect("aroma_af_ne" in off).toBe(false);
    expect("aroma_af_final" in off).toBe(false);
  });

  it("the cooled value moves the current value to _inicial; 'Quitar' keeps the new _final", () => {
    const first = setCooledValue(all(7), "aroma_af", 8);
    expect(first["aroma_af_inicial"]).toBe(7);
    expect(first["aroma_af_final"]).toBe(8);
    expect(cooledPair(first, "aroma_af")).toEqual({ from: 7, to: 8 });
    const removed = clearCooledValue(first, "aroma_af");
    expect("aroma_af_inicial" in removed).toBe(false);
    expect(removed["aroma_af_final"]).toBe(8);
  });

  it("picking the cooled value again keeps the FIRST value as _inicial", () => {
    const a = setCooledValue(all(7), "aroma_af", 8);
    const b = setCooledValue(a, "aroma_af", 5);
    expect(b["aroma_af_inicial"]).toBe(7);
    expect(b["aroma_af_final"]).toBe(5);
    // back to the first value: nothing changed, so no pair
    const c = setCooledValue(a, "aroma_af", 7);
    expect("aroma_af_inicial" in c).toBe(false);
  });
});

describe("reference pin clears the new keys", () => {
  it("pinReferenceAffective removes every _ne and _inicial", () => {
    const pinned = pinReferenceAffective(
      { ...marked(all(6), "aroma_af"), dulzor_af_inicial: 3, sabor_af_ne: true },
      3,
    );
    expect(hasPartialKeys(pinned)).toBe(false);
    expect(IDS.every((id) => pinned[`${id}_final`] === 5)).toBe(true);
    expect(isReferencePinned(pinned)).toBe(true);
  });

  it("a pinned-looking blob that still carries a marker is NOT pinned (so it gets rewritten)", () => {
    const pinned = pinReferenceAffective({}, 2);
    expect(isReferencePinned({ ...pinned, aroma_af_ne: true })).toBe(false);
    expect(isReferencePinned({ ...pinned, aroma_af_inicial: 4 })).toBe(false);
    expect(clearPartialKeys({ ...pinned, aroma_af_ne: true })).toEqual(pinned);
  });
});

describe("finished (completeness, evaluationState, close rules)", () => {
  const modules = (affective: Record<string, unknown>): SampleModules => ({ affective, descriptive: {}, combined: {} });

  it("a section marked 'no evaluado' is not missing; an unmarked unrated one still is", () => {
    expect(stepMissing(modules({ aroma_af_ne: true }), "aroma", "affective")).toEqual([]);
    expect(stepMissing(modules({}), "aroma", "affective")).toEqual(["aroma_af"]);
    const combined: SampleModules = {
      affective: {},
      descriptive: {},
      combined: { aroma_int: 3, aroma_desc: ["x"], aroma_af_ne: true },
    };
    expect(stepMissing(combined, "aroma", "combined")).toEqual([]);
    // the descriptive half is still required in a combined session
    expect(stepMissing({ ...combined, combined: { aroma_af_ne: true } }, "aroma", "combined")).toEqual(["aroma_af"]);
  });

  it("isEvaluationComplete: complete OR declared partial; an unmarked incomplete one is NOT", () => {
    expect(isEvaluationComplete("affective", all(6))).toBe(true);
    expect(isEvaluationComplete("affective", marked(all(6), "aroma_af"))).toBe(true);
    const incomplete = { ...all(6) };
    delete incomplete["aroma_af_final"];
    expect(isEvaluationComplete("affective", incomplete)).toBe(false);
    expect(isEvaluationComplete("combined", marked(all(6), "aroma_af"))).toBe(true);
  });

  it("a finished partial draft reads as complete in the viewer's state and in the close rules", () => {
    const partial = marked(all(6), "aroma_af");
    const my = deriveMyEvaluation("affective", { isDraft: true, data: partial });
    expect(my.complete).toBe(true);
    expect(canShowMyScore(my)).toBe(true); // callers still gate the number on hasIndividualScore
    expect(
      closeRowComplete(
        { isDraft: true, cupperId: "u", descriptiveData: {}, affectiveData: partial, combinedData: {} } as never,
        "affective",
      ),
    ).toBe(true);
  });
});

describe("computeGroupAggregate: totals ignore a partial, attribute averages use each attribute's own denominator", () => {
  const complete = { data: all(6), cups: 2 };
  const partial = { data: marked(all(8), "sabor_af"), cups: 2 };

  it("the total, included count and deductions are those of the complete evaluations only", () => {
    const alone = computeGroupAggregate([complete], 2);
    const both = computeGroupAggregate([complete, { ...partial, nonUniformCups: [true, true], defectiveCups: [true, true] }], 2);
    expect(both.included).toBe(1);
    expect(both.submitted).toBe(2);
    expect(both.communityScore).toBe(alone.communityScore);
    expect(both.avgRawScore).toBe(alone.avgRawScore);
    expect(both.totalCups).toBe(alone.totalCups);
    expect(both.totalNonUniform).toBe(0);
    expect(both.totalDefective).toBe(0);
    expect(both.scoreSd).toBeNull();
  });

  it("per-attribute averages: each attribute over the evaluations that rated it", () => {
    const g = computeGroupAggregate([complete, partial], 2);
    expect(g.attrAverages["Fragancia"]).toBe(7); // (6 + 8) / 2
    expect(g.attrAverages["Sabor"]).toBe(6); // only the complete one rated it
  });

  it("a sample with only a partial still has attribute averages (and no total)", () => {
    const g = computeGroupAggregate([partial], 2);
    expect(g.included).toBe(0);
    expect(g.communityScore).toBeNull();
    expect(g.attrAverages["Fragancia"]).toBe(8);
    expect("Sabor" in g.attrAverages).toBe(false);
  });

  it("an old incomplete evaluation with no marker changes nothing", () => {
    const old = { ...all(2) };
    delete old["impresion_global_final"];
    const base = computeGroupAggregate([complete, partial], 2);
    const withOld = computeGroupAggregate([complete, partial, { data: old, cups: 2 }], 2);
    expect(withOld.attrAverages).toEqual(base.attrAverages);
    expect(withOld.communityScore).toBe(base.communityScore);
    expect(withOld.included).toBe(base.included);
  });

  it("the v1 branch is untouched: no partial in its averages", () => {
    const v1 = computeGroupAggregate([complete, partial], 5, { rule: "v1" });
    expect(v1.attrAverages["Fragancia"]).toBe(6);
    expect(v1.included).toBe(1);
    const v1Only = computeGroupAggregate([partial], 5, { rule: "v1" });
    expect(v1Only.attrAverages).toEqual({});
  });

  it("complete-only input gives the same attribute averages as before (all eight keys, ÷ included)", () => {
    const g = computeGroupAggregate([{ data: all(5), cups: 2 }, { data: all(8), cups: 2 }], 2);
    for (const a of AFFECTIVE_ATTRIBUTES) expect(g.attrAverages[a.label]).toBe(6.5);
  });
});

import { describe, expect, it } from "vitest";
import {
  REFERENCE_PIN_VALUE,
  isPinnedModule,
  isReferencePinned,
  orderReferenceFirst,
  pinReferenceAffective,
  planReferenceRepin,
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

// S6 CP-C2 — re-pin when the owner chooses the reference MID-SESSION. The
// plan is what setReferenceSample writes inside its transaction.
describe("planReferenceRepin", () => {
  const scored = {
    fragancia_af_final: 8, aroma_af_final: 7, sabor_af_final: 6, regusto_af_final: 7,
    acidez_af_final: 8, dulzor_af_final: 7, cuerpo_af_final: 6, general_af_final: 8,
    tazas_no_uniformes: [true, false, false, false, false],
    tazas_defectuosas: [false, false, true, false, false],
    defecto_tipo: ["fenol"],
    fragancia_int: 11,
    notas: "cítrico",
  };

  it("rewrites every unpinned row of the new reference to the 79.00 anchor", () => {
    const plan = planReferenceRepin(
      [
        { id: "e1", isDraft: false, affectiveData: scored, combinedData: {} },
        { id: "e2", isDraft: true, affectiveData: { ...scored, aroma_af_final: 3 }, combinedData: {} },
      ],
      "affective",
      5,
    );
    expect(plan.map((p) => p.id)).toEqual(["e1", "e2"]);
    for (const { data } of plan) {
      expect(data.individualScore).toBe(79);
      expect(data.nonUniformCups).toEqual([false, false, false, false, false]);
      expect(data.defectiveCups).toEqual([false, false, false, false, false]);
      expect(data.defectTypes).toEqual([]);
      const json = data.affectiveData as Record<string, unknown>;
      expect(isReferencePinned(json)).toBe(true);
      // Descriptive side and notes belong to the cupper — untouched.
      expect(json.fragancia_int).toBe(11);
      expect(json.notas).toBe("cítrico");
    }
  });

  it("echoes isDraft unchanged so SET names the column the trigger watches", () => {
    const plan = planReferenceRepin(
      [
        { id: "sub", isDraft: false, affectiveData: scored, combinedData: {} },
        { id: "dr", isDraft: true, affectiveData: scored, combinedData: {} },
      ],
      "affective",
      5,
    );
    expect(plan.find((p) => p.id === "sub")?.data.isDraft).toBe(false);
    expect(plan.find((p) => p.id === "dr")?.data.isDraft).toBe(true);
    // Never flips a draft to submitted or back.
    expect(plan.every((p) => "isDraft" in p.data)).toBe(true);
  });

  it("reads the combined column for combined sessions", () => {
    const plan = planReferenceRepin(
      [{ id: "c1", isDraft: false, affectiveData: {}, combinedData: scored }],
      "combined",
      5,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].data.combinedData).toBeDefined();
    expect(plan[0].data.affectiveData).toBeUndefined();
    expect(plan[0].data.individualScore).toBe(79);
  });

  it("skips rows that are already pinned (no-op rewrite, no trigger churn)", () => {
    const plan = planReferenceRepin(
      [
        { id: "ok", isDraft: false, affectiveData: pinReferenceAffective({ fragancia_int: 4 }, 5), combinedData: {} },
        { id: "fix", isDraft: false, affectiveData: scored, combinedData: {} },
      ],
      "affective",
      5,
    );
    expect(plan.map((p) => p.id)).toEqual(["fix"]);
  });

  it("all rows already pinned -> empty plan", () => {
    const pinned = pinReferenceAffective({ fragancia_int: 4 }, 5);
    const plan = planReferenceRepin(
      [
        { id: "a", isDraft: false, affectiveData: pinned, combinedData: {} },
        { id: "b", isDraft: true, affectiveData: pinned, combinedData: {} },
      ],
      "affective",
      5,
    );
    expect(plan).toEqual([]);
  });

  it("is empty for descriptive sessions and for malformed JSON it still pins", () => {
    expect(planReferenceRepin([{ id: "d", isDraft: false, affectiveData: scored, combinedData: {} }], "descriptive", 5)).toEqual([]);
    const plan = planReferenceRepin(
      [{ id: "n", isDraft: false, affectiveData: null, combinedData: {} }],
      "affective",
      2,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].data.individualScore).toBe(79);
  });
});

describe("pinReferenceAffective keeps the quick note", () => {
  it("spreads unknown keys such as nota_express through the pin", () => {
    const pinned = pinReferenceAffective(
      { fragancia_af_final: 8, nota_express: "referencia limpia", tazas_defectuosas: [true] },
      1,
    );
    expect(pinned.nota_express).toBe("referencia limpia");
    expect(pinned.fragancia_af_final).toBe(REFERENCE_PIN_VALUE);
    expect(pinned.tazas_defectuosas).toEqual([false]);
  });
});

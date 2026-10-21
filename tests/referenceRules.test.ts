import { describe, expect, it } from "vitest";
import {
  MAX_REFERENCES,
  REFERENCE_PIN_VALUE,
  activeReferenceId,
  compactReferenceRanks,
  isPinnedModule,
  isReferencePinned,
  nextReferenceOrder,
  orderByReferenceIds,
  orderReferenceFirst,
  pinReferenceAffective,
  orderReferencesFirst,
  planAddReference,
  planReferenceRepin,
  planRemoveActive,
  referenceBadgeText,
  referenceTag,
  referencesOf,
  resolveCompareReference,
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

// ─── Multi-reference (S6): references accumulate, only the active is pinned ───

const ranked = (...ranks: (number | null)[]) =>
  ranks.map((r, i) => ({ id: "abcdef"[i], referenceRank: r }));

describe("multi-reference ordering", () => {
  it("orders all references first by rank, the rest keep their order", () => {
    // D was named first (R1), B second (R2)
    const s = ranked(null, 2, null, 1, null);
    expect(orderReferencesFirst(s).map((x) => x.id)).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("is stable with no references and does not mutate", () => {
    const s = ranked(null, null, null);
    expect(orderReferencesFirst(s).map((x) => x.id)).toEqual(["a", "b", "c"]);
    const copy = [...s];
    orderReferencesFirst(ranked(null, 1, null));
    expect(s).toEqual(copy);
  });

  it("active reference = highest rank; tags are R<n>", () => {
    expect(activeReferenceId(ranked(null, null))).toBeNull();
    expect(activeReferenceId(ranked(null, 1, null))).toBe("b");
    expect(activeReferenceId(ranked(null, 2, null, 1))).toBe("b");
    expect(referencesOf(ranked(2, null, 1)).map((x) => x.id)).toEqual(["c", "a"]);
    expect(referenceTag(2)).toBe("R2");
    expect(referenceTag(null)).toBeNull();
  });
});

describe("referenceBadgeText", () => {
  it("numbers the badge only when there are several references", () => {
    expect(referenceBadgeText("Referencia", 1, 1)).toBe("Referencia");
    expect(referenceBadgeText("Referencia", 2, 2)).toBe("Referencia 2");
    expect(referenceBadgeText("Referencia", null, 2)).toBe("Referencia");
  });
});

describe("planAddReference / planRemoveActive", () => {
  it("first reference gets rank 1", () => {
    expect(planAddReference(ranked(null, null, null), "b")).toEqual({
      kind: "add",
      rank: 1,
      activeId: "b",
    });
  });

  it("a second reference ACCUMULATES: rank 2, becomes active, R1 untouched", () => {
    expect(planAddReference(ranked(1, null, null), "c")).toEqual({
      kind: "add",
      rank: 2,
      activeId: "c",
    });
  });

  it("naming an existing reference is a no-op that keeps the active one", () => {
    expect(planAddReference(ranked(1, 2, null), "a")).toEqual({ kind: "noop", activeId: "b" });
  });

  it("refuses beyond the practical maximum", () => {
    const full = ranked(1, 2, 3, null);
    expect(MAX_REFERENCES).toBe(3);
    expect(planAddReference(full, "d")).toEqual({ kind: "full" });
  });

  it("removing clears only the active; the previous one is active again", () => {
    expect(planRemoveActive(ranked(1, 2, null))).toEqual({ removeId: "b", activeId: "a" });
    expect(planRemoveActive(ranked(null, 1, null))).toEqual({ removeId: "b", activeId: null });
    expect(planRemoveActive(ranked(null, null))).toEqual({ removeId: null, activeId: null });
  });

  it("compacts ranks to 1..n after a reference row is deleted", () => {
    expect(compactReferenceRanks(ranked(null, 2, 3))).toEqual([
      { id: "b", rank: 1 },
      { id: "c", rank: 2 },
    ]);
    expect(compactReferenceRanks(ranked(1, 2))).toEqual([]);
  });
});

describe("only the active reference is locked", () => {
  // The lock is keyed on the session's referenceSampleId (= active). After a
  // second reference is added, saving the FIRST one must no longer be forced
  // back to 5s: the cupper can change it, and untouched data stays pinned.
  it("previous reference keeps its pinned data but is not re-pinned on save", () => {
    const s = ranked(1, 2);
    const active = activeReferenceId(s);
    const isLocked = (id: string) => id === active;
    expect(isLocked("a")).toBe(false);
    expect(isLocked("b")).toBe(true);
    const old = pinReferenceAffective({}, 5);
    expect(isReferencePinned(old)).toBe(true); // data survives the unlock
    const edited = { ...old, [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: 7 };
    expect(isReferencePinned(edited)).toBe(false); // an unlocked save is not rewritten
  });
});

describe("resolveCompareReference", () => {
  it("defaults to the active reference, honours a valid pick, ignores a stale one", () => {
    const s = ranked(1, 2, null);
    expect(resolveCompareReference(s, null)).toBe("b");
    expect(resolveCompareReference(s, "a")).toBe("a");
    expect(resolveCompareReference(s, "c")).toBe("b");
    expect(resolveCompareReference(ranked(null, null), "a")).toBeNull();
  });
});

describe("client mirror of the reference order", () => {
  it("appends a new active, truncates on removal, clears on null", () => {
    expect(nextReferenceOrder([], "a")).toEqual(["a"]);
    expect(nextReferenceOrder(["a"], "d")).toEqual(["a", "d"]);
    expect(nextReferenceOrder(["a", "d"], "a")).toEqual(["a"]);
    expect(nextReferenceOrder(["a", "d"], null)).toEqual([]);
  });

  it("orders by the id list, then the rest", () => {
    const s = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(orderByReferenceIds(s, ["d", "b"]).map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
    expect(orderByReferenceIds(s, ["zzz"]).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

import { describe, expect, it } from "vitest";
import { sessionMissing, stepMissing } from "@/lib/completeness";
import { AFFECTIVE_ATTRIBUTES, CUPPING_STEPS, DESCRIPTIVE_STEPS, STEP_ATTRIBUTES } from "@/lib/constants";
import { EXPRESS_NOTE_KEY } from "@/lib/expressSession";

// The "Notas rápidas" text is free text under a JSON key. Completeness only
// counts scored/required fields, so the key must be invisible to it: an
// otherwise empty sample stays "all missing", a complete one stays complete.

const empty = () => ({ affective: {}, descriptive: {}, combined: {} });
const withNote = (text: string) => ({
  affective: { [EXPRESS_NOTE_KEY]: text },
  descriptive: { [EXPRESS_NOTE_KEY]: text },
  combined: { [EXPRESS_NOTE_KEY]: text },
});
const completeAffective = () => ({
  ...empty(),
  affective: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 7])),
});
const completeDescriptive = () => {
  const descriptive: Record<string, unknown> = { gustos: ["dulce"] };
  for (const step of DESCRIPTIVE_STEPS) {
    for (const attr of STEP_ATTRIBUTES[step]) {
      if (!attr.descriptiveId) continue;
      descriptive[`${attr.descriptiveId}_int`] = 3;
      descriptive[`${attr.descriptiveId}_desc`] = ["floral"];
    }
  }
  return { ...empty(), descriptive };
};

describe("completeness ignores the quick note", () => {
  it("a note alone does not make any step complete", () => {
    for (const step of CUPPING_STEPS) {
      expect(stepMissing(withNote("rico"), step, "affective")).toEqual(
        stepMissing(empty(), step, "affective"),
      );
      expect(stepMissing(withNote("rico"), step, "combined")).toEqual(
        stepMissing(empty(), step, "combined"),
      );
    }
    for (const step of DESCRIPTIVE_STEPS) {
      expect(stepMissing(withNote("rico"), step, "descriptive")).toEqual(
        stepMissing(empty(), step, "descriptive"),
      );
    }
  });

  it("a complete sample stays complete with or without the note", () => {
    const aff = completeAffective();
    const affNoted = { ...aff, affective: { ...aff.affective, [EXPRESS_NOTE_KEY]: "x" } };
    for (const step of CUPPING_STEPS) {
      expect(stepMissing(aff, step, "affective")).toEqual([]);
      expect(stepMissing(affNoted, step, "affective")).toEqual([]);
    }
    const desc = completeDescriptive();
    const descNoted = { ...desc, descriptive: { ...desc.descriptive, [EXPRESS_NOTE_KEY]: "x" } };
    for (const step of DESCRIPTIVE_STEPS) {
      expect(stepMissing(desc, step, "descriptive")).toEqual([]);
      expect(stepMissing(descNoted, step, "descriptive")).toEqual([]);
    }
  });

  it("sessionMissing reports the same gaps with the note present", () => {
    const samples = [
      { label: "A", ...completeAffective() },
      { label: "B", ...withNote("solo una nota") },
    ];
    const gaps = sessionMissing(samples, CUPPING_STEPS, "affective");
    expect(gaps.map((g) => g.sampleLabel)).toEqual(["B"]);
    expect(gaps[0].sections.length).toBe(AFFECTIVE_ATTRIBUTES.length);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  countRepinOverwrites,
  planReferenceRepin,
  planRemoveActive,
  REFERENCE_PIN_VALUE,
} from "@/lib/referenceRules";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

// S8-22 B-05: dropping the active reference re-pins the earlier one.
describe("re-activated earlier reference (B-05)", () => {
  it("planRemoveActive names the re-activated reference for re-pinning", () => {
    const plan = planRemoveActive([
      { id: "r1", referenceRank: 1 },
      { id: "r2", referenceRank: 2 },
      { id: "x", referenceRank: null },
    ]);
    expect(plan).toEqual({ removeId: "r2", activeId: "r1", repinId: "r1" });
  });

  it("removing the only reference re-pins nothing", () => {
    expect(planRemoveActive([{ id: "r1", referenceRank: 1 }]).repinId).toBeNull();
  });

  it("rows entered while R1 was unlocked are rewritten to the 79.00 anchor", () => {
    const drifted = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 8]));
    const pinned = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, REFERENCE_PIN_VALUE]));
    const plan = planReferenceRepin(
      [
        { id: "e1", isDraft: false, affectiveData: drifted, combinedData: {} },
        { id: "e2", isDraft: false, affectiveData: pinned, combinedData: {} },
      ],
      "affective",
      5,
    );
    expect(plan.map((p) => p.id)).toEqual(["e1"]);
    expect(plan[0].data.individualScore).toBe(79);
  });

  // S8-27: the confirmation rule. Re-activation needs the owner's OK exactly
  // when pinning again would rewrite at least one stored evaluation.
  it("countRepinOverwrites: 0 when nothing is stored or everything is already pinned", () => {
    const pinned = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, REFERENCE_PIN_VALUE]));
    expect(countRepinOverwrites([], "affective", 5)).toBe(0);
    expect(
      countRepinOverwrites([{ id: "e", isDraft: false, affectiveData: pinned, combinedData: {} }], "affective", 5),
    ).toBe(0);
  });

  it("countRepinOverwrites counts only the drifted rows (draft or submitted)", () => {
    const drifted = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 8]));
    const pinned = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, REFERENCE_PIN_VALUE]));
    expect(
      countRepinOverwrites(
        [
          { id: "a", isDraft: false, affectiveData: drifted, combinedData: {} },
          { id: "b", isDraft: true, affectiveData: drifted, combinedData: {} },
          { id: "c", isDraft: false, affectiveData: pinned, combinedData: {} },
        ],
        "affective",
        5,
      ),
    ).toBe(2);
  });

  it("countRepinOverwrites is 0 for descriptive sessions (nothing is pinned)", () => {
    const drifted = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 8]));
    expect(
      countRepinOverwrites([{ id: "a", isDraft: false, affectiveData: drifted, combinedData: {} }], "descriptive", 5),
    ).toBe(0);
  });

  it("setReferenceSample(null) sets the re-pin target from the plan", () => {
    const src = readFileSync("app/actions/sessions.ts", "utf8");
    expect(src).toContain("repinTarget = plan.repinId;");
  });
});

// S10 WP6 fix round (2): which explanation a reference gets, per format x mode.
import { describe, expect, it } from "vitest";
import { referenceExplanation, shouldPinReference } from "@/lib/referenceRules";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

describe("referenceExplanation", () => {
  it("affective and combined: anchor is pinned, free is free", () => {
    for (const moduleKey of ["affective", "combined"]) {
      expect(referenceExplanation({ mode: "anchor", moduleKey })).toBe("pinned");
      expect(referenceExplanation({ mode: "free", moduleKey })).toBe("free");
    }
  });
  it("descriptive says nothing about a pin, in either mode", () => {
    expect(referenceExplanation({ mode: "anchor", moduleKey: "descriptive" })).toBe("descriptive");
    expect(referenceExplanation({ mode: "free", moduleKey: "descriptive" })).toBe("descriptive");
  });
  it("an unknown mode reads as anchor, like the pin", () => {
    expect(referenceExplanation({ mode: "weird", moduleKey: "affective" })).toBe("pinned");
  });
  it("is 'pinned' exactly when shouldPinReference pins the active reference", () => {
    for (const mode of ["anchor", "free", "x"]) {
      for (const moduleKey of ["descriptive", "affective", "combined"]) {
        expect(referenceExplanation({ mode, moduleKey }) === "pinned").toBe(
          shouldPinReference({ mode, moduleKey, isActiveReference: true }),
        );
      }
    }
  });
});

describe("the descriptive wording carries no pin", () => {
  it("no 79.00, no fixed/pinned/CVA wording in the descriptive strings (es and en)", () => {
    const pick = (m: typeof es) => {
      const g = m as unknown as { session: { newForm: { referenceMode: Record<string, string> }; edit: Record<string, string> }; cupping?: unknown; groupSession?: unknown };
      return [g.session.newForm.referenceMode.descriptiveHelp, g.session.edit.referenceHelperDescriptive, (m as unknown as { group: Record<string, string> }).group.referenceAddHintDescriptive];
    };
    for (const m of [es, en]) {
      for (const text of pick(m)) {
        expect(typeof text).toBe("string");
        expect(text).not.toMatch(/79|CVA|fij|fixed|pinned|ancla|anchor/i);
      }
    }
  });
});

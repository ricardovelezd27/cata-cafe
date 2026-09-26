import { describe, expect, it } from "vitest";
import {
  canShowMyScore,
  deriveMyEvaluation,
  isEvaluationComplete,
  summarizeMyProgress,
} from "@/lib/evaluationState";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { DESCRIPTOR_STAGES } from "@/lib/descriptors";

function allAffective(value: number): Record<string, unknown> {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value]));
}
function allIntensities(value: number): Record<string, unknown> {
  return Object.fromEntries(DESCRIPTOR_STAGES.map((s) => [`${s.id}_int`, value]));
}

describe("isEvaluationComplete", () => {
  it("combined: complete only when all 8 affective ratings are set", () => {
    // Mirrors the 2026-09-26 draft: steps 1–3 rated, step 4 (acidez) intensity
    // entered but quality missing → still incomplete.
    const midStep4 = { ...allIntensities(12), ...allAffective(7) };
    delete midStep4.acidez_af_final;
    delete midStep4.dulzor_af_final;
    delete midStep4.sensacion_af_final;
    delete midStep4.impresion_global_final;
    expect(isEvaluationComplete("combined", midStep4)).toBe(false);
    expect(isEvaluationComplete("combined", allAffective(7))).toBe(true);
  });

  it("affective: one missing or zero rating → incomplete", () => {
    const oneMissing = allAffective(6);
    delete oneMissing.impresion_global_final;
    expect(isEvaluationComplete("affective", oneMissing)).toBe(false);
    expect(isEvaluationComplete("affective", { ...allAffective(6), aroma_af_final: 0 })).toBe(false);
    expect(isEvaluationComplete("affective", allAffective(6))).toBe(true);
    expect(isEvaluationComplete("affective", {})).toBe(false);
  });

  it("descriptive: every intensity slider must be set", () => {
    const oneMissing = allIntensities(9);
    delete oneMissing.sensacion_int;
    expect(isEvaluationComplete("descriptive", oneMissing)).toBe(false);
    expect(isEvaluationComplete("descriptive", allIntensities(9))).toBe(true);
    expect(isEvaluationComplete("descriptive", {})).toBe(false);
  });
});

describe("deriveMyEvaluation / canShowMyScore", () => {
  it("no row → none, never scored", () => {
    const my = deriveMyEvaluation("combined", null);
    expect(my).toEqual({ status: "none", complete: false });
    expect(canShowMyScore(my)).toBe(false);
  });

  it("incomplete draft → no score; complete draft → score", () => {
    const partial = deriveMyEvaluation("combined", { isDraft: true, data: { aroma_af_final: 7 } });
    expect(partial).toEqual({ status: "draft", complete: false });
    expect(canShowMyScore(partial)).toBe(false);

    const full = deriveMyEvaluation("combined", { isDraft: true, data: allAffective(7) });
    expect(full).toEqual({ status: "draft", complete: true });
    expect(canShowMyScore(full)).toBe(true);
  });

  it("submitted rows always score, even if a rating is missing (cupper's choice)", () => {
    const my = deriveMyEvaluation("affective", { isDraft: false, data: { aroma_af_final: 7 } });
    expect(my).toEqual({ status: "submitted", complete: false });
    expect(canShowMyScore(my)).toBe(true);
  });
});

describe("summarizeMyProgress", () => {
  it("counts complete rows and detects all-submitted", () => {
    const p = summarizeMyProgress([
      { status: "submitted", complete: true },
      { status: "draft", complete: true },
      { status: "draft", complete: false },
      { status: "none", complete: false },
    ]);
    expect(p).toEqual({ complete: 2, total: 4, allSubmitted: false });
    expect(
      summarizeMyProgress([
        { status: "submitted", complete: true },
        { status: "submitted", complete: false },
      ]).allSubmitted,
    ).toBe(true);
    expect(summarizeMyProgress([]).allSubmitted).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  calcCommunityScore,
  calcIndividualBreakdown,
  calcIndividualScore,
  calcRawScore,
  isAffectiveComplete,
} from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

// S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d, rounded to 0.25 (CLAUDE.md "Scoring System").
function allAttrs(value: number): Record<string, unknown> {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value]));
}

describe("individual CVA score", () => {
  it("neutral 5 on every attribute scores 79.00", () => {
    expect(calcRawScore(allAttrs(5))).toBeCloseTo(79, 5);
    expect(calcIndividualScore(allAttrs(5), 5)).toBe(79);
  });

  it("9 on every attribute scores exactly 100", () => {
    expect(calcIndividualScore(allAttrs(9), 5)).toBe(100);
  });

  it("applies −2 per non-uniform and −4 per defective cup when cupsPerSample ≥ 5", () => {
    const data = {
      ...allAttrs(5),
      tazas_no_uniformes: [true, false, false, false, false],
      tazas_defectuosas: [false, true, false, false, false],
    };
    const b = calcIndividualBreakdown(data, 5);
    expect(b.uniformityTracked).toBe(true);
    expect(b.u).toBe(1);
    expect(b.d).toBe(1);
    expect(b.score).toBe(73);
  });

  it("ignores cup penalties below 5 cups per sample", () => {
    const data = {
      ...allAttrs(5),
      tazas_no_uniformes: [true, true, true],
      tazas_defectuosas: [true, true, true],
    };
    const b = calcIndividualBreakdown(data, 3);
    expect(b.uniformityTracked).toBe(false);
    expect(b.score).toBe(79);
  });

  it("rounds to the nearest quarter point once, after penalties", () => {
    // 7 everywhere → 0.65625 × 56 + 52.75 = 89.5
    expect(calcIndividualScore(allAttrs(7), 5)).toBe(89.5);
    // mixed values that land off-grid: 8×5 + one 6 → Σ=41 → 79.65625 → 79.75
    const data = { ...allAttrs(5), fragancia_af_final: 6 };
    expect(calcIndividualScore(data, 5)).toBe(79.75);
  });

  it("treats an evaluation as complete only when all 8 attributes are > 0", () => {
    expect(isAffectiveComplete(allAttrs(5))).toBe(true);
    expect(isAffectiveComplete({ ...allAttrs(5), aroma_af_final: 0 })).toBe(false);
    expect(isAffectiveComplete({})).toBe(false);
  });
});

describe("community score (display-only mirror of the DB trigger)", () => {
  it("matches the CLAUDE.md verification case: 2 participants × 5 cups, 1 non-uniform cup → −1.0", () => {
    const score = calcCommunityScore({
      avgRawScore: 80,
      totalNonUniform: 1,
      totalDefective: 0,
      totalCups: 10,
    });
    expect(score).toBe(79);
  });

  it("charges 30/totalCups per defective cup", () => {
    expect(
      calcCommunityScore({ avgRawScore: 80, totalNonUniform: 0, totalDefective: 1, totalCups: 10 }),
    ).toBe(77);
  });

  it("returns 0 when there is nothing to average", () => {
    expect(calcCommunityScore({ avgRawScore: 0, totalNonUniform: 0, totalDefective: 0, totalCups: 10 })).toBe(0);
    expect(calcCommunityScore({ avgRawScore: 80, totalNonUniform: 0, totalDefective: 0, totalCups: 0 })).toBe(0);
  });
});

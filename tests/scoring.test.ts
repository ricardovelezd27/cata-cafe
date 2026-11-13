import { describe, expect, it } from "vitest";
import {
  calcCommunityScore,
  calcIndividualBreakdown,
  calcIndividualScore,
  calcRawScore,
  computeGroupAggregate,
  cupDeduction,
  evaluationCupCounts,
  isAffectiveComplete,
  type GroupEvalInput,
} from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { evaluationScoreRule, sampleScoreRule } from "@/lib/scoreRule";

// S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d, rounded to 0.25 (CLAUDE.md "Scoring System"),
// the deduction shared across everyone's cups and diluted beyond five (lib/scoring.ts cupDeduction).
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

  it("applies −2 per non-uniform and −4 per defective cup (5 cups)", () => {
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

  it("deducts below five cups too: 3 cups all defective (and so non-uniform) = −18", () => {
    const data = {
      ...allAttrs(5),
      tazas_no_uniformes: [true, true, true],
      tazas_defectuosas: [true, true, true],
    };
    const b = calcIndividualBreakdown(data, 3);
    expect(b.uniformityTracked).toBe(true);
    expect(b.uniformityPenalty).toBe(6);
    expect(b.defectPenalty).toBe(12);
    expect(b.score).toBe(61);
  });

  it("with one cup uniformity is not evaluated: a defective cup costs 4, a non-uniform flag costs 0", () => {
    const defective = calcIndividualBreakdown(
      { ...allAttrs(5), tazas_no_uniformes: [true], tazas_defectuosas: [true] },
      1,
    );
    expect(defective.uniformityTracked).toBe(false);
    expect([defective.u, defective.d, defective.score]).toEqual([0, 1, 75]);
    expect(calcIndividualScore({ ...allAttrs(5), tazas_no_uniformes: [true] }, 1)).toBe(79);
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

  it("charges 4 × 5/max(5, cups) per defective cup (+2 for the non-uniform flag it also carries)", () => {
    expect(
      calcCommunityScore({ avgRawScore: 80, totalNonUniform: 0, totalDefective: 1, totalCups: 10 }),
    ).toBe(78);
    expect(
      calcCommunityScore({ avgRawScore: 80, totalNonUniform: 1, totalDefective: 1, totalCups: 10 }),
    ).toBe(77);
  });

  it("returns 0 when there is nothing to average; no pooled cups means no deduction", () => {
    expect(calcCommunityScore({ avgRawScore: 0, totalNonUniform: 0, totalDefective: 0, totalCups: 10 })).toBe(0);
    expect(calcCommunityScore({ avgRawScore: 80, totalNonUniform: 0, totalDefective: 0, totalCups: 0 })).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// The spec's "Comprobaciones" (docs/product/cata-descentralizada-puntaje.md §3).
// A defective cup is flagged non-uniform too, the way the form stores it.
// ---------------------------------------------------------------------------
function flagsFor(cups: number, nonUniformOnly: number, defective: number) {
  return {
    tazas_defectuosas: Array.from({ length: cups }, (_, c) => c < defective),
    tazas_no_uniformes: Array.from({ length: cups }, (_, c) => c < defective + nonUniformOnly),
  };
}

function mine(cups: number, nonUniformOnly: number, defective: number): number {
  const data = { ...allAttrs(5), ...flagsFor(cups, nonUniformOnly, defective) };
  return 79 - (calcIndividualScore(data, cups) as number);
}

function session(people: number, cups: number, nonUniformOnly: number, defective: number): number {
  const evals: GroupEvalInput[] = Array.from({ length: people }, (_, i) => {
    const f = i === 0 ? flagsFor(cups, nonUniformOnly, defective) : flagsFor(cups, 0, 0);
    return {
      data: { ...allAttrs(5), ...f },
      nonUniformCups: f.tazas_no_uniformes,
      defectiveCups: f.tazas_defectuosas,
      cups,
    };
  });
  const agg = computeGroupAggregate(evals, cups);
  return 79 - (agg.communityScore as number);
}

describe("spec comprobaciones: one rule, every scope", () => {
  const table: { name: string; mine: [number, number, number]; markerLoses: number }[] = [
    { name: "1 person, 5 cups, 1 defective", mine: [5, 0, 1], markerLoses: 6 },
    { name: "1 person, 2 cups, 1 defective", mine: [2, 0, 1], markerLoses: 6 },
    { name: "1 person, 2 cups, both defective", mine: [2, 0, 2], markerLoses: 12 },
    { name: "1 person, 1 cup, defective (no uniformity)", mine: [1, 0, 1], markerLoses: 4 },
    { name: "1 person, 3 cups, 1 only non-uniform", mine: [3, 1, 0], markerLoses: 2 },
  ];
  for (const row of table) {
    it(`${row.name}: −${row.markerLoses} for me and for a session of one`, () => {
      expect(mine(...row.mine)).toBe(row.markerLoses);
      expect(session(1, ...row.mine)).toBe(row.markerLoses);
    });
  }

  it("2 people × 2 cups (4 cups), 1 defective: marker −6, session −6 (4 cups: not shared)", () => {
    expect(mine(2, 0, 1)).toBe(6);
    expect(session(2, 2, 0, 1)).toBe(6);
  });

  it("4 people × 2 cups (8 cups), 1 defective: marker −6, session −3.75 (6 × 5/8)", () => {
    expect(mine(2, 0, 1)).toBe(6);
    expect(session(4, 2, 0, 1)).toBe(3.75);
  });

  it("2 people × 5 cups (10 cups), 1 only non-uniform: marker −2, session −1", () => {
    expect(mine(5, 1, 0)).toBe(2);
    expect(session(2, 5, 1, 0)).toBe(1);
  });

  it("the group aggregate exposes the pooled deduction it applied", () => {
    const evals: GroupEvalInput[] = Array.from({ length: 4 }, (_, i) => {
      const f = i === 0 ? flagsFor(2, 0, 1) : flagsFor(2, 0, 0);
      return { data: allAttrs(5), nonUniformCups: f.tazas_no_uniformes, defectiveCups: f.tazas_defectuosas };
    });
    const agg = computeGroupAggregate(evals, 2);
    expect(agg.totalCups).toBe(8);
    expect(agg.totalNonUniform).toBe(1);
    expect(agg.totalDefective).toBe(1);
    expect(agg.deductionFactor).toBe(5 / 8);
    expect(agg.uniformityPenalty).toBe(2 * (5 / 8));
    expect(agg.defectPenalty).toBe(4 * (5 / 8));
  });

  it("per-evaluation cups override the session's cups and are pooled", () => {
    const one = flagsFor(1, 0, 0);
    const two = flagsFor(2, 0, 1);
    const agg = computeGroupAggregate(
      [
        { data: allAttrs(5), nonUniformCups: one.tazas_no_uniformes, defectiveCups: one.tazas_defectuosas, cups: 1 },
        { data: allAttrs(5), nonUniformCups: two.tazas_no_uniformes, defectiveCups: two.tazas_defectuosas, cups: 2 },
      ],
      5,
    );
    expect(agg.totalCups).toBe(3);
    expect(agg.totalNonUniform).toBe(1);
    expect(agg.totalDefective).toBe(1);
    expect(agg.communityScore).toBe(73);
  });
});

describe("evaluationCupCounts", () => {
  it("clamps counts to the evaluation's cups and ignores uniformity at one cup", () => {
    expect(evaluationCupCounts([true, true, true], [true, true, true], 2)).toEqual({ u: 2, d: 2 });
    expect(evaluationCupCounts([true], [true], 1)).toEqual({ u: 0, d: 1 });
    expect(evaluationCupCounts([true, false], [false, false], 2)).toEqual({ u: 1, d: 0 });
    expect(evaluationCupCounts(undefined, undefined, 5)).toEqual({ u: 0, d: 0 });
  });

  it("non-finite, zero or negative cups give 0 and 0", () => {
    for (const cups of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      expect(evaluationCupCounts([true, true], [true, true], cups)).toEqual({ u: 0, d: 0 });
    }
  });
});

describe("cupDeduction", () => {
  it("is flat up to five cups and diluted by 5 / cups beyond", () => {
    expect(cupDeduction({ cups: 1, nonUniform: 0, defective: 1 }).total).toBe(4);
    expect(cupDeduction({ cups: 5, nonUniform: 1, defective: 1 })).toMatchObject({ factor: 1, total: 6 });
    expect(cupDeduction({ cups: 10, nonUniform: 1, defective: 1 })).toMatchObject({ factor: 0.5, total: 3 });
    expect(cupDeduction({ cups: 40, nonUniform: 1, defective: 1 }).total).toBe(0.75);
  });

  it("clamps negatives and non-finite values to 0", () => {
    expect(cupDeduction({ cups: -1, nonUniform: -2, defective: Number.NaN })).toMatchObject({
      cups: 0,
      nonUniform: 0,
      defective: 0,
      total: 0,
    });
  });

  it("property: a flagged cup never costs more than 6 points, flags longer than the cups included", () => {
    let seed = 20261113;
    const rnd = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    for (let n = 0; n < 3000; n++) {
      const cups = int(1, 12);
      const len = int(0, cups + 4); // arrays may be LONGER than the cups
      // defective implies non-uniform, the way the form stores it
      const defective = Array.from({ length: len }, () => rnd() < 0.3);
      const nonUniform = defective.map((d) => d || rnd() < 0.3);
      const { u, d } = evaluationCupCounts(nonUniform, defective, cups);
      expect(u).toBeLessThanOrEqual(cups);
      expect(d).toBeLessThanOrEqual(cups);
      const ded = cupDeduction({ cups, nonUniform: u, defective: d });
      const flagged = Math.max(u, d);
      if (flagged > 0) expect(ded.total / flagged).toBeLessThanOrEqual(6 + 1e-9);
      // pooled over several evaluations the bound holds as well
      const people = int(1, 6);
      const pooled = cupDeduction({ cups: cups * people, nonUniform: u * people, defective: d * people });
      if (flagged > 0) expect(pooled.total / (flagged * people)).toBeLessThanOrEqual(6 + 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule versions: past results render unchanged (lib/scoreRule.ts).
// "v1" must reproduce what main computed before this change.
// ---------------------------------------------------------------------------
describe("rule v1 (before 2026-11) reproduces the old numbers", () => {
  const v1 = { rule: "v1" as const };

  it("3 cups, everything flagged: no deduction (79), as main", () => {
    const data = {
      ...allAttrs(5),
      tazas_no_uniformes: [true, true, true],
      tazas_defectuosas: [true, true, true],
    };
    expect(calcIndividualScore(data, 3, v1)).toBe(79);
    expect(calcIndividualBreakdown(data, 3, v1)).toMatchObject({ uniformityTracked: false, u: 0, d: 0, rule: "v1" });
  });

  it("5 cups, 1 non-uniform + 1 defective (arrays independent): 73, as main", () => {
    const data = {
      ...allAttrs(5),
      tazas_no_uniformes: [true, false, false, false, false],
      tazas_defectuosas: [false, true, false, false, false],
    };
    expect(calcIndividualScore(data, 5, v1)).toBe(73);
  });

  it("group 2 x 5 cups with one defective-only cup: 30/total_cups = 3, so 76", () => {
    const evals: GroupEvalInput[] = [0, 1].map((i) => ({
      data: allAttrs(5),
      nonUniformCups: [false, false, false, false, false],
      defectiveCups: [i === 0, false, false, false, false],
    }));
    const agg = computeGroupAggregate(evals, 5, v1);
    expect(agg.communityScore).toBe(76);
    expect(agg.defectPenalty).toBe(3);
    expect(agg.totalCups).toBe(10);
  });

  it("group under five cups is the plain average, flags ignored", () => {
    const evals: GroupEvalInput[] = [0, 1].map((i) => ({
      data: allAttrs(5),
      nonUniformCups: [true, true],
      defectiveCups: [i === 0, false],
    }));
    const agg = computeGroupAggregate(evals, 2, v1);
    expect(agg.communityScore).toBe(79);
    expect([agg.totalNonUniform, agg.totalDefective, agg.uniformityPenalty, agg.defectPenalty]).toEqual([0, 0, 0, 0]);
    // the same data under the current rule deducts
    expect(computeGroupAggregate(evals, 2).communityScore).toBeLessThan(79);
  });

  it("a stored row with cups NULL renders the SAME individual score as before; with cups 2 it gets -6", () => {
    const data = { ...allAttrs(5), ...flagsFor(2, 0, 1) };
    const stored = (cups: number | null) => calcIndividualScore(data, 2, { rule: evaluationScoreRule(cups, true) });
    expect(stored(null)).toBe(79); // what main showed for this row
    expect(stored(2)).toBe(73);
  });
});

describe("rule selection helpers", () => {
  it("evaluationScoreRule: v1 only for a STORED row whose cups is null", () => {
    expect(evaluationScoreRule(null, true)).toBe("v1");
    expect(evaluationScoreRule(undefined, true)).toBe("v1");
    expect(evaluationScoreRule(2, true)).toBe("v2");
    expect(evaluationScoreRule(0, true)).toBe("v2");
    expect(evaluationScoreRule(null, false)).toBe("v2");
    expect(evaluationScoreRule(undefined, false)).toBe("v2");
    expect(evaluationScoreRule(5, false)).toBe("v2");
  });

  it("sampleScoreRule: the aggregate row decides; with no row, all-cups-NULL evaluations mean v1", () => {
    // a stored row wins over the evaluations
    expect(sampleScoreRule({ ruleVersion: 1 })).toBe("v1");
    expect(sampleScoreRule({ ruleVersion: 2 })).toBe("v2");
    expect(sampleScoreRule({ ruleVersion: 1 }, [5])).toBe("v1");
    expect(sampleScoreRule({ ruleVersion: 2 }, [null])).toBe("v2");
    // no row: no evaluations -> v2
    expect(sampleScoreRule(null)).toBe("v2");
    expect(sampleScoreRule(undefined, [])).toBe("v2");
    // no row: every stored evaluation has cups NULL -> v1
    expect(sampleScoreRule(null, [null])).toBe("v1");
    expect(sampleScoreRule(undefined, [null, undefined, null])).toBe("v1");
    // no row: at least one new-rule evaluation -> v2
    expect(sampleScoreRule(null, [null, 5])).toBe("v2");
    expect(sampleScoreRule(null, [5])).toBe("v2");
    expect(sampleScoreRule(null, [0])).toBe("v2");
  });

  it("computeGroupAggregate: the SD uses each evaluation's own rule (mixed sample)", () => {
    const base = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 5]));
    const flagged = { ...base, tazas_defectuosas: [true, false], tazas_no_uniformes: [true, false] };
    // 2 cups: v1 ignores the flags (below five cups), v2 deducts 6.
    const mixed = computeGroupAggregate(
      [
        { data: flagged, nonUniformCups: [true, false], defectiveCups: [true, false], cups: 2, rule: "v2" },
        { data: flagged, nonUniformCups: [true, false], defectiveCups: [true, false], rule: "v1" },
      ],
      2,
    );
    // individual scores 73 (v2) and 79 (v1): population SD = 3
    expect(mixed.scoreSd).toBe(3);
    // without per-evaluation rules the aggregate's rule applies to both
    const uniform = computeGroupAggregate(
      [
        { data: flagged, nonUniformCups: [true, false], defectiveCups: [true, false], cups: 2 },
        { data: flagged, nonUniformCups: [true, false], defectiveCups: [true, false], cups: 2 },
      ],
      2,
    );
    expect(uniform.scoreSd).toBe(0);
  });
});

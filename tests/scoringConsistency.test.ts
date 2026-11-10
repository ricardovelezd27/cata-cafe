import { describe, expect, it } from "vitest";
import {
  MIN_CUPS_FOR_PENALTIES,
  calcCommunityScore,
  calcIndividualScore,
  computeGroupAggregate,
  penaltiesApply,
  type GroupEvalInput,
} from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

/**
 * S8-04 (F-grupal-1). Pure TS port of the arithmetic in
 * recompute_aggregate_score() (prisma/sql/rls_and_triggers.sql, PHASE 23):
 *
 *   v_total_cups := cups_per_sample * participant_count
 *   IF cups_per_sample >= 5 AND v_total_cups > 0 THEN
 *     uniformity := non_uniform * (10 / total_cups); defect := defective * (30 / total_cups)
 *   community := GREATEST(0, LEAST(100, ROUND((COALESCE(avg_raw,0) - u - d) * 4) / 4))
 *
 * If the SQL changes, change this port in the same commit: this test is what
 * keeps the stored score (trigger) and the displayed score (TypeScript) equal.
 */
function sqlCommunityScore(
  avgRaw: number | null,
  nonUniform: number,
  defective: number,
  cupsPerSample: number,
  cuppers: number,
): number {
  const totalCups = cupsPerSample * cuppers;
  let up = 0;
  let dp = 0;
  if (cupsPerSample >= 5 && totalCups > 0) {
    up = nonUniform * (10 / totalCups);
    dp = defective * (30 / totalCups);
  }
  return Math.max(0, Math.min(100, Math.round(((avgRaw ?? 0) - up - dp) * 4) / 4));
}

function attrs(value: number): Record<string, unknown> {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value]));
}

// 7 everywhere + one 8 would be off-grid; 0.65625 * 8 * 7 + 52.75 = 89.5. We
// want raw 80.00 exactly: need sum such that 0.65625*sum = 27.25 -> not integer,
// so build the cases from 5s (79.00) and compare both sides on whatever raw is.
function evalsFor(
  cuppers: number,
  cups: number,
  flags: { nonUniform?: number; defective?: number } = {},
): GroupEvalInput[] {
  return Array.from({ length: cuppers }, (_, i) => ({
    data: attrs(5),
    nonUniformCups: Array.from({ length: cups }, (_, c) => i === 0 && c < (flags.nonUniform ?? 0)),
    defectiveCups: Array.from({ length: cups }, (_, c) => i === 0 && c < (flags.defective ?? 0)),
  }));
}

function bothSides(cuppers: number, cups: number, flags: { nonUniform?: number; defective?: number }) {
  const evals = evalsFor(cuppers, cups, flags);
  const agg = computeGroupAggregate(evals, cups);
  // The trigger counts raw flag totals from the stored arrays, whatever the cups.
  const rawNu = evals.reduce((a, e) => a + (e.nonUniformCups ?? []).filter(Boolean).length, 0);
  const rawDef = evals.reduce((a, e) => a + (e.defectiveCups ?? []).filter(Boolean).length, 0);
  const sql = sqlCommunityScore(agg.avgRawScore, rawNu, rawDef, cups, cuppers);
  const display = calcCommunityScore({
    avgRawScore: agg.avgRawScore ?? 0,
    totalNonUniform: rawNu,
    totalDefective: rawDef,
    totalCups: cups * cuppers,
    cupsPerSample: cups,
  });
  return { agg, sql, display };
}

describe("penaltiesApply", () => {
  it("is false below 5 cups and true from 5", () => {
    expect(MIN_CUPS_FOR_PENALTIES).toBe(5);
    expect([0, 1, 2, 4].map(penaltiesApply)).toEqual([false, false, false, false]);
    expect([5, 6, 10].map(penaltiesApply)).toEqual([true, true, true]);
    expect(penaltiesApply(Number.NaN)).toBe(false);
  });
});

describe("trigger arithmetic == TypeScript, per cup count (F-grupal-1)", () => {
  it("2 cuppers x 2 cups, one non-uniform cup: no deduction on either side", () => {
    const { agg, sql, display } = bothSides(2, 2, { nonUniform: 1 });
    expect(agg.avgRawScore).toBe(79);
    expect(sql).toBe(79);
    expect(display).toBe(79);
    expect(agg.communityScore).toBe(79);
  });

  it("2 x 2 with one defective cup: still no deduction", () => {
    const { agg, sql, display } = bothSides(2, 2, { defective: 1 });
    expect([sql, display, agg.communityScore]).toEqual([79, 79, 79]);
  });

  it("1 cup, flagged: no deduction", () => {
    const { agg, sql, display } = bothSides(1, 1, { defective: 1 });
    expect([sql, display, agg.communityScore]).toEqual([79, 79, 79]);
  });

  it("4 cups is still below the gate", () => {
    const { agg, sql, display } = bothSides(3, 4, { nonUniform: 2, defective: 1 });
    expect([sql, display, agg.communityScore]).toEqual([79, 79, 79]);
  });

  it("CLAUDE.md verification: 2 cuppers x 5 cups, one non-uniform cup = -1.0", () => {
    const { agg, sql, display } = bothSides(2, 5, { nonUniform: 1 });
    expect(sql).toBe(78);
    expect(display).toBe(78);
    expect(agg.communityScore).toBe(78);
    expect(agg.totalNonUniform).toBe(1);
  });

  it("5 cups, defective only: 30/total_cups per defective cup", () => {
    const { agg, sql, display } = bothSides(2, 5, { defective: 1 });
    expect(sql).toBe(76);
    expect([display, agg.communityScore]).toEqual([76, 76]);
  });

  it("the calcCommunityScore fixture from the formula: avg 80, 10 cups, one non-uniform cup", () => {
    expect(sqlCommunityScore(80, 1, 0, 5, 2)).toBe(79);
    expect(
      calcCommunityScore({ avgRawScore: 80, totalNonUniform: 1, totalDefective: 0, totalCups: 10, cupsPerSample: 5 }),
    ).toBe(79);
    // Same totals at 2 cups per sample: nothing deducted, 2x2 raw 80 stays 80.
    expect(sqlCommunityScore(80, 1, 0, 2, 2)).toBe(80);
    expect(
      calcCommunityScore({ avgRawScore: 80, totalNonUniform: 1, totalDefective: 0, totalCups: 4, cupsPerSample: 2 }),
    ).toBe(80);
  });

  it("zero evaluations: SQL stores 0, computeGroupAggregate reports null (display handles it)", () => {
    const agg = computeGroupAggregate([], 5);
    expect(agg.communityScore).toBeNull();
    expect(sqlCommunityScore(null, 0, 0, 5, 0)).toBe(0);
  });

  it("clamps at 0 on both sides", () => {
    expect(sqlCommunityScore(1, 0, 10, 5, 1)).toBe(0);
    expect(
      calcCommunityScore({ avgRawScore: 1, totalNonUniform: 0, totalDefective: 10, totalCups: 5, cupsPerSample: 5 }),
    ).toBe(0);
  });

  it("individual score uses the same gate", () => {
    const data = { ...attrs(5), tazas_no_uniformes: [true, true], tazas_defectuosas: [true, false] };
    expect(calcIndividualScore(data, 2)).toBe(79);
    const five = {
      ...attrs(5),
      tazas_no_uniformes: [true, false, false, false, false],
      tazas_defectuosas: [false, false, false, false, false],
    };
    expect(calcIndividualScore(five, 5)).toBe(77);
  });
});

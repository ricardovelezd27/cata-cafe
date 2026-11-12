import { describe, expect, it } from "vitest";
import {
  roundToQuarter,
  calcCommunityScore,
  calcIndividualScore,
  computeGroupAggregate,
  type GroupEvalInput,
} from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

/**
 * S10 WP1a. Pure TS port of the arithmetic in recompute_aggregate_score()
 * (prisma/sql/rls_and_triggers.sql, PHASE 26), in the SAME operation order:
 *
 *   per evaluation:  cups = GREATEST(COALESCE(e.cups, session_cups), 0)
 *                    nu   = cups >= 2 ? LEAST(count(nonUniformCups), cups) : 0
 *                    df   = LEAST(count(defectiveCups), cups)
 *   pooled over the INCLUDED evaluations: total_cups, total_nu, total_df
 *   factor    := 5.0 / GREATEST(5, total_cups)
 *   uniform.  := 2.0 * total_nu * factor
 *   defect    := 4.0 * total_df * factor
 *   community := GREATEST(0, LEAST(100, ROUND((COALESCE(avg_raw,0) - u - d)::numeric * 4) / 4))
 *
 * If the SQL changes, change this port in the same commit: this test (and
 * tests/db/aggregate.dbtest.ts against the real trigger) is what keeps the
 * stored score and the displayed score equal.
 */
type SqlEval = {
  rawScore: number;
  /** evaluations."cups"; null = a row older than the backfill. */
  cups: number | null;
  nonUniform: boolean[];
  defective: boolean[];
  complete?: boolean;
};

function sqlAggregate(evals: SqlEval[], sessionCups: number) {
  const rows = evals.map((e) => {
    const cups = Math.max(e.cups ?? sessionCups, 0);
    const count = (a: boolean[]) => a.filter((v) => v === true).length;
    const nu = (e.cups ?? sessionCups) >= 2 ? Math.min(count(e.nonUniform), e.cups ?? sessionCups) : 0;
    const df = Math.min(count(e.defective), cups);
    return { rawScore: e.rawScore, cups, nu, df, inc: e.complete !== false };
  });
  const inc = rows.filter((r) => r.inc);
  const avgRaw = inc.length ? inc.reduce((a, r) => a + r.rawScore, 0) / inc.length : null;
  const totalNu = inc.reduce((a, r) => a + r.nu, 0);
  const totalDf = inc.reduce((a, r) => a + r.df, 0);
  const totalCups = inc.reduce((a, r) => a + r.cups, 0);
  let uniformity = 0;
  let defect = 0;
  if (totalCups > 0) {
    const factor = 5.0 / Math.max(5, totalCups);
    uniformity = 2.0 * totalNu * factor;
    defect = 4.0 * totalDf * factor;
  }
  // `(x)::numeric` keeps 15 significant digits before ROUND (float8_numeric).
  const asNumeric = Number(((avgRaw ?? 0) - uniformity - defect).toPrecision(15));
  const community = Math.max(0, Math.min(100, Math.round(asNumeric * 4) / 4));
  return { community, totalNu, totalDf, totalCups, uniformity, defect, included: inc.length };
}

function attrs(value: number): Record<string, unknown> {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value]));
}
const rawOf = (value: number) => 0.65625 * value * AFFECTIVE_ATTRIBUTES.length + 52.75;

/** A cupper's flags: `nu` cups flagged non-uniform only, `df` flagged defective
 *  (a defective cup is ALSO flagged non-uniform, the way the form stores it). */
function flags(cups: number, nu: number, df: number) {
  const defective = Array.from({ length: cups }, (_, c) => c < df);
  const nonUniform = Array.from({ length: cups }, (_, c) => c < df + nu);
  return { nonUniform, defective };
}

type Cupper = { value: number; cups: number; nu: number; df: number; cupsNull?: boolean };

function bothSides(cuppers: Cupper[], sessionCups: number) {
  const evals: GroupEvalInput[] = cuppers.map((p) => {
    const f = flags(p.cups, p.nu, p.df);
    return {
      data: { ...attrs(p.value), tazas_no_uniformes: f.nonUniform, tazas_defectuosas: f.defective },
      nonUniformCups: f.nonUniform,
      defectiveCups: f.defective,
      cups: p.cupsNull ? undefined : p.cups,
    };
  });
  const ts = computeGroupAggregate(evals, sessionCups);
  const sql = sqlAggregate(
    cuppers.map((p) => {
      const f = flags(p.cups, p.nu, p.df);
      return { rawScore: rawOf(p.value), cups: p.cupsNull ? null : p.cups, ...f };
    }),
    sessionCups,
  );
  return { ts, sql };
}

describe("trigger arithmetic == TypeScript, per cup count", () => {
  it("2 cuppers x 5 cups, one non-uniform-only cup: -2 x 5/10 = -1 (CLAUDE.md verification)", () => {
    const { ts, sql } = bothSides(
      [
        { value: 5, cups: 5, nu: 1, df: 0 },
        { value: 5, cups: 5, nu: 0, df: 0 },
      ],
      5,
    );
    expect(sql.community).toBe(78);
    expect(ts.communityScore).toBe(78);
    expect(ts.uniformityPenalty).toBe(1);
    expect(ts.deductionFactor).toBe(0.5);
  });

  it("5 cups, one defective cup (also non-uniform) = 6, not 8: the double count is gone", () => {
    const { ts, sql } = bothSides([{ value: 5, cups: 5, nu: 0, df: 1 }], 5);
    expect(ts.totalNonUniform).toBe(1);
    expect(ts.totalDefective).toBe(1);
    expect(ts.uniformityPenalty + ts.defectPenalty).toBe(6);
    expect([sql.community, ts.communityScore]).toEqual([73, 73]);
  });

  it("2 cups, one defective: 6 flat (it used to be 20 with the stored group score)", () => {
    const { ts, sql } = bothSides([{ value: 5, cups: 2, nu: 0, df: 1 }], 2);
    expect([sql.community, ts.communityScore]).toEqual([73, 73]);
  });

  it("1 cup, defective: 4 (uniformity does not exist), and a non-uniform flag on one cup is ignored", () => {
    const one = bothSides([{ value: 5, cups: 1, nu: 0, df: 1 }], 1);
    expect([one.sql.community, one.ts.communityScore]).toEqual([75, 75]);
    const ignored = bothSides([{ value: 5, cups: 1, nu: 1, df: 0 }], 1);
    expect([ignored.sql.community, ignored.ts.communityScore]).toEqual([79, 79]);
    expect(ignored.ts.totalNonUniform).toBe(0);
  });

  it("4 cuppers x 2 cups, one defective: the group deduction is shared, 6 x 5/8 = 3.75", () => {
    const { ts, sql } = bothSides(
      [
        { value: 5, cups: 2, nu: 0, df: 1 },
        { value: 5, cups: 2, nu: 0, df: 0 },
        { value: 5, cups: 2, nu: 0, df: 0 },
        { value: 5, cups: 2, nu: 0, df: 0 },
      ],
      2,
    );
    expect(ts.totalCups).toBe(8);
    expect(ts.uniformityPenalty + ts.defectPenalty).toBe(3.75);
    expect([sql.community, ts.communityScore]).toEqual([75.25, 75.25]);
  });

  it("a NULL evaluations.cups falls back to the session's cups on both sides", () => {
    const { ts, sql } = bothSides(
      [
        { value: 5, cups: 2, nu: 0, df: 1, cupsNull: true },
        { value: 5, cups: 2, nu: 0, df: 0, cupsNull: true },
      ],
      2,
    );
    expect(ts.totalCups).toBe(4);
    expect([sql.community, ts.communityScore]).toEqual([73, 73]);
  });

  it("zero evaluations: SQL stores 0, computeGroupAggregate reports null (display handles it)", () => {
    const agg = computeGroupAggregate([], 5);
    expect(agg.communityScore).toBeNull();
    expect(sqlAggregate([], 5).community).toBe(0);
  });

  it("clamps at 0 on both sides", () => {
    expect(sqlAggregate([{ rawScore: 1, cups: 5, nonUniform: Array(5).fill(true), defective: Array(5).fill(true) }], 5).community).toBe(0);
    expect(
      calcCommunityScore({ avgRawScore: 1, totalNonUniform: 5, totalDefective: 5, totalCups: 5 }),
    ).toBe(0);
  });

  it("individual score: the same flat deduction at any cup count", () => {
    const f = flags(2, 0, 1);
    const data = { ...attrs(5), tazas_no_uniformes: f.nonUniform, tazas_defectuosas: f.defective };
    expect(calcIndividualScore(data, 2)).toBe(73);
    const five = { ...attrs(5), ...flags(5, 1, 0) };
    expect(calcIndividualScore({ ...five, tazas_no_uniformes: five.nonUniform, tazas_defectuosas: five.defective }, 5)).toBe(77);
  });
});

// Audit B-04: an exact tie that the double stores one bit short. Postgres
// repairs it with its 15-digit numeric cast and rounds up; plain Math.round
// rounded down, so the page showed 0.25 less than the stored score.
describe("quarter rounding on tie values (B-04)", () => {
  it("7 cuppers x 5 cups, raw 65.875, 1 non-uniform-only + 2 defective cups = 64 on both sides", () => {
    // flags: 1 non-uniform-only + 2 defective (each also non-uniform) = u 3, d 2;
    // 35 pooled cups -> factor 1/7 -> 6/7 + 8/7 = 2 -> exactly 63.875 in decimal
    const x = 65.875 - 2 * 3 * (5 / 35) - 4 * 2 * (5 / 35);
    expect(x).not.toBe(63.875); // the double misses the tie
    expect(Math.round(x * 4) / 4).toBe(63.75); // what plain Math.round would show
    expect(roundToQuarter(x)).toBe(64);
    expect(
      calcCommunityScore({ avgRawScore: 65.875, totalNonUniform: 3, totalDefective: 2, totalCups: 35 }),
    ).toBe(64);
    const vals = [3, 3, 3, 3, 2, 2, 2, 2]; // sum 20 -> raw 65.875
    expect(0.65625 * 20 + 52.75).toBe(65.875);
    const sql = sqlAggregate(
      [
        { rawScore: 65.875, cups: 5, nonUniform: [true, false, false, false, false], defective: [false, false, false, false, false] },
        { rawScore: 65.875, cups: 5, nonUniform: [true, false, false, false, false], defective: [true, false, false, false, false] },
        { rawScore: 65.875, cups: 5, nonUniform: [false, true, false, false, false], defective: [false, true, false, false, false] },
        ...Array.from({ length: 4 }, () => ({ rawScore: 65.875, cups: 5, nonUniform: [], defective: [] })),
      ],
      5,
    );
    expect(vals.reduce((a, b) => a + b, 0)).toBe(20);
    expect([sql.totalNu, sql.totalDf, sql.community]).toEqual([3, 2, 64]);
  });

  it("leaves ordinary values alone", () => {
    for (const [x, want] of [[79, 79], [80.1, 80], [80.13, 80.25], [84.375, 84.5], [0, 0], [100, 100]] as const) {
      expect(roundToQuarter(x)).toBe(want);
    }
  });

  it("TS equals the SQL port over a grid of cups 1-10, cuppers, sums and flags (totals included)", () => {
    let checked = 0;
    for (let cups = 1; cups <= 10; cups++) {
      for (let cuppers = 1; cuppers <= 4; cuppers++) {
        for (let value = 2; value <= 9; value += 1) {
          for (let nu = 0; nu <= Math.min(3, cups); nu++) {
            for (let df = 0; df <= Math.min(2, cups - nu); df++) {
              // the first cupper carries the flags, the rest are clean
              const group: Cupper[] = Array.from({ length: cuppers }, (_, i) => ({
                value: i === 0 ? value : 5,
                cups,
                nu: i === 0 ? nu : 0,
                df: i === 0 ? df : 0,
              }));
              const { ts, sql } = bothSides(group, cups);
              const where = `cups=${cups} cuppers=${cuppers} value=${value} nu=${nu} df=${df}`;
              if (ts.communityScore !== sql.community) throw new Error(`score ${where}: ${ts.communityScore} vs ${sql.community}`);
              if (ts.totalCups !== sql.totalCups) throw new Error(`totalCups ${where}`);
              if (ts.totalNonUniform !== sql.totalNu) throw new Error(`totalNonUniform ${where}`);
              if (ts.totalDefective !== sql.totalDf) throw new Error(`totalDefective ${where}`);
              if (ts.uniformityPenalty !== sql.uniformity) throw new Error(`uniformityPenalty ${where}`);
              if (ts.defectPenalty !== sql.defect) throw new Error(`defectPenalty ${where}`);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });
});

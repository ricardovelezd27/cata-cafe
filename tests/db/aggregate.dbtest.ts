// Group 1 (audit B-04 / S10 WP1a): the REAL trigger trg_recompute_aggregate
// (PHASE 26) versus the TypeScript twin (computeGroupAggregate / calcCommunityScore):
// score, totals AND penalties, at every cup count.
import { beforeEach, describe, expect, it } from "vitest";
import { computeGroupAggregate, type GroupEvalInput } from "@/lib/scoring";
import { refireAggregates } from "@/lib/aggregates";
import {
  affectiveData,
  makeEvaluation,
  makeSession,
  makeUser,
  prisma,
  resetDb,
  storedAggregate,
} from "./support/db";

beforeEach(resetDb);

type Case = {
  cups: number;
  cuppers: { values: number | number[]; nonUniform: boolean[]; defective: boolean[]; omit?: number }[];
};

/** Flags the way the form stores them: a defective cup is ALSO non-uniform. */
function flagged(cups: number, nonUniformOnly: number, defective: number) {
  return {
    defective: Array.from({ length: cups }, (_, c) => c < defective),
    nonUniform: Array.from({ length: cups }, (_, c) => c < defective + nonUniformOnly),
  };
}
const clean = (cups: number) => flagged(cups, 0, 0);

function tsSide(c: Case) {
  const evals: GroupEvalInput[] = c.cuppers.map((p) => {
    const data = affectiveData(p.values) as Record<string, unknown>;
    if (p.omit !== undefined) delete data[Object.keys(data)[p.omit]];
    return {
      data: { ...data, tazas_no_uniformes: p.nonUniform.slice(0, c.cups), tazas_defectuosas: p.defective.slice(0, c.cups) },
      nonUniformCups: p.nonUniform.slice(0, c.cups),
      defectiveCups: p.defective.slice(0, c.cups),
      cups: c.cups,
    };
  });
  return computeGroupAggregate(evals, c.cups);
}

async function dbSide(c: Case) {
  const owner = await makeUser();
  const users = await Promise.all(c.cuppers.map(() => makeUser()));
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    cupsPerSample: c.cups,
    participants: users,
    samples: [{}],
  });
  for (let i = 0; i < users.length; i++) {
    const p = c.cuppers[i];
    const data = affectiveData(p.values) as Record<string, unknown>;
    if (p.omit !== undefined) delete data[Object.keys(data)[p.omit]];
    await makeEvaluation({
      sampleId: s.samples[0].id,
      sessionId: s.id,
      cupperId: users[i],
      cupsPerSample: c.cups,
      data,
      nonUniform: p.nonUniform,
      defective: p.defective,
    });
  }
  return { agg: await storedAggregate(s.samples[0].id), session: s, users };
}

describe("aggregate trigger vs computeGroupAggregate", () => {
  it("2 cuppers x 5 cups with one non-uniform cup: -1.0", async () => {
    const c: Case = {
      cups: 5,
      cuppers: [
        { values: 6, nonUniform: [true, false, false, false, false], defective: [] },
        { values: 6, nonUniform: [], defective: [] },
      ],
    };
    const { agg } = await dbSide(c);
    const ts = tsSide(c);
    // raw = 0.65625 * 48 + 52.75 = 84.25; penalty = 1 * (10 / 10)
    expect(agg?.avgRawScore).toBeCloseTo(84.25, 6);
    expect(agg?.uniformityPenalty).toBeCloseTo(1, 6);
    expect(agg?.communityScore).toBe(83.25);
    expect(ts.communityScore).toBe(83.25);
    expect(agg?.participantCount).toBe(2);
    expect(agg?.totalCups).toBe(10);
    expect(agg?.totalNonUniform).toBe(1);
  });

  it("under five cups the deduction is flat and shared: 3 cups x 2 cuppers, 6 pooled cups", async () => {
    const c: Case = {
      cups: 3,
      cuppers: [
        { values: 7, nonUniform: [true, true, false], defective: [false, true, false] },
        { values: 5, nonUniform: [true], defective: [] },
      ],
    };
    const { agg } = await dbSide(c);
    const ts = tsSide(c);
    // u = 2 + 1, d = 1 over 6 pooled cups: factor 5/6, 2*3*5/6 = 5 and 4*1*5/6 = 3.33
    expect(agg?.totalCups).toBe(6);
    expect(agg?.totalNonUniform).toBe(3);
    expect(agg?.totalDefective).toBe(1);
    expect(agg?.uniformityPenalty).toBeCloseTo(5, 9);
    expect(agg?.defectPenalty).toBeCloseTo(10 / 3, 9);
    // avg of 0.65625*56+52.75=89.5 and 0.65625*40+52.75=79 -> 84.25, minus 8.33 -> 75.92 -> 76
    expect(agg?.communityScore).toBe(76);
    expect(ts.communityScore).toBe(76);
  });

  it("audit tie case (7 cuppers, 5 cups, sum 20, 1 non-uniform-only + 2 defective cups): 64 on both sides", async () => {
    const vals = [3, 3, 3, 3, 2, 2, 2, 2]; // sum 20
    const c: Case = {
      cups: 5,
      cuppers: [
        { values: vals, nonUniform: [true], defective: [] },
        { values: vals, nonUniform: [true], defective: [true] },
        { values: vals, nonUniform: [false, true], defective: [false, true] },
        ...Array.from({ length: 4 }, () => ({ values: vals, nonUniform: [] as boolean[], defective: [] as boolean[] })),
      ],
    };
    const { agg } = await dbSide(c);
    const ts = tsSide(c);
    // 1 non-uniform-only + 2 defective cups (each also non-uniform): u 3, d 2 over 35 cups
    expect(agg?.totalNonUniform).toBe(3);
    expect(agg?.totalDefective).toBe(2);
    expect(agg?.communityScore).toBe(64);
    expect(ts.communityScore).toBe(64);
  });

  it("an excluded participant changes the stored score after the refire", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [a, b] });
    const sample = s.samples[0];
    await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: a, values: 8 });
    await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: b, values: 4 });
    const before = await storedAggregate(sample.id);
    expect(before?.participantCount).toBe(2);
    expect(before?.communityScore).toBe(84.25); // (94.75 + 73.75) / 2

    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: s.id, userId: b } },
      data: { excludedFromResults: true },
    });
    // the trigger fires on evaluations, not on participants: re-fire like the app does
    await refireAggregates(s.id);
    const after = await storedAggregate(sample.id);
    expect(after?.participantCount).toBe(1);
    expect(after?.communityScore).toBe(94.75);
    expect(after?.communityScore).not.toBe(before?.communityScore);
  });

  // The spec's "Comprobaciones": trigger == TypeScript on every one, with the
  // absolute deduction pinned (all sections 5, so the base is exactly 79).
  const specCases: { name: string; c: Case; loses: number }[] = [
    {
      name: "1 person, 5 cups, 1 defective: -6",
      c: { cups: 5, cuppers: [{ values: 5, ...flagged(5, 0, 1) }] },
      loses: 6,
    },
    {
      name: "1 person, 2 cups, 1 defective: -6",
      c: { cups: 2, cuppers: [{ values: 5, ...flagged(2, 0, 1) }] },
      loses: 6,
    },
    {
      name: "1 person, 2 cups, both defective: -12",
      c: { cups: 2, cuppers: [{ values: 5, ...flagged(2, 0, 2) }] },
      loses: 12,
    },
    {
      name: "1 person, 1 cup, defective: -4 (no uniformity)",
      c: { cups: 1, cuppers: [{ values: 5, ...flagged(1, 0, 1) }] },
      loses: 4,
    },
    {
      name: "1 person, 3 cups, 1 only non-uniform: -2",
      c: { cups: 3, cuppers: [{ values: 5, ...flagged(3, 1, 0) }] },
      loses: 2,
    },
    {
      name: "2 people x 2 cups (4 cups), 1 defective: -6 (not shared)",
      c: { cups: 2, cuppers: [{ values: 5, ...flagged(2, 0, 1) }, { values: 5, ...clean(2) }] },
      loses: 6,
    },
    {
      name: "4 people x 2 cups (8 cups), 1 defective: -3.75 (6 x 5/8)",
      c: {
        cups: 2,
        cuppers: [
          { values: 5, ...flagged(2, 0, 1) },
          { values: 5, ...clean(2) },
          { values: 5, ...clean(2) },
          { values: 5, ...clean(2) },
        ],
      },
      loses: 3.75,
    },
    {
      name: "2 people x 5 cups (10 cups), 1 only non-uniform: -1",
      c: { cups: 5, cuppers: [{ values: 5, ...flagged(5, 1, 0) }, { values: 5, ...clean(5) }] },
      loses: 1,
    },
  ];
  for (const sc of specCases) {
    it(`spec case ${sc.name}`, async () => {
      const { agg } = await dbSide(sc.c);
      const ts = tsSide(sc.c);
      expect(79 - (agg?.communityScore ?? 0)).toBe(sc.loses);
      expect(ts.communityScore).toBe(agg?.communityScore);
      expect(ts.totalCups).toBe(agg?.totalCups);
      expect(ts.totalNonUniform).toBe(agg?.totalNonUniform);
      expect(ts.totalDefective).toBe(agg?.totalDefective);
      expect(ts.uniformityPenalty).toBeCloseTo(agg?.uniformityPenalty ?? NaN, 9);
      expect(ts.defectPenalty).toBeCloseTo(agg?.defectPenalty ?? NaN, 9);
    });
  }

  it("every cup count 1-8: one defective cup, alone and in a pair, trigger == TypeScript", async () => {
    for (let cups = 1; cups <= 8; cups++) {
      for (const people of [1, 2, 3]) {
        const c: Case = {
          cups,
          cuppers: Array.from({ length: people }, (_, i) => ({
            values: i === 0 ? 7 : 5,
            ...(i === 0 ? flagged(cups, 1, 1) : clean(cups)),
          })),
        };
        await resetDb();
        const { agg } = await dbSide(c);
        const ts = tsSide(c);
        const where = `cups=${cups} people=${people}`;
        expect(agg?.totalCups, where).toBe(cups * people);
        expect(ts.communityScore, where).toBe(agg?.communityScore);
        expect(ts.totalNonUniform, where).toBe(agg?.totalNonUniform);
        expect(ts.totalDefective, where).toBe(agg?.totalDefective);
        expect(ts.uniformityPenalty, where).toBeCloseTo(agg?.uniformityPenalty ?? NaN, 9);
        expect(ts.defectPenalty, where).toBeCloseTo(agg?.defectPenalty ?? NaN, 9);
        // never more than 6 per flagged cup, never more than 4 for a lone cup
        const flaggedCups = cups >= 2 ? 2 : 1;
        expect((agg!.uniformityPenalty + agg!.defectPenalty) / flaggedCups).toBeLessThanOrEqual(6 + 1e-9);
      }
    }
  }, 120_000);

  it("an excluded participant's cups and flags leave the pool after the refire", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, participants: [a, b] });
    const sample = s.samples[0];
    await makeEvaluation({
      sampleId: sample.id, sessionId: s.id, cupperId: a, cupsPerSample: 2, values: 5,
      nonUniform: [true, false], defective: [true, false],
    });
    await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: b, cupsPerSample: 2, values: 5 });
    const before = await storedAggregate(sample.id);
    expect([before?.totalCups, before?.totalDefective, before?.communityScore]).toEqual([4, 1, 73]);

    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: s.id, userId: a } },
      data: { excludedFromResults: true },
    });
    await refireAggregates(s.id);
    const after = await storedAggregate(sample.id);
    expect([after?.participantCount, after?.totalCups, after?.totalDefective, after?.totalNonUniform]).toEqual([1, 2, 0, 0]);
    expect(after?.communityScore).toBe(79);
  });

  it("a legacy row with evaluations.cups NULL falls back to the session's cups", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, participants: [a, b] });
    const sample = s.samples[0];
    await makeEvaluation({
      sampleId: sample.id, sessionId: s.id, cupperId: a, cupsPerSample: 2, values: 5,
      nonUniform: [true, false], defective: [true, false], overrides: { cups: null },
    });
    await makeEvaluation({
      sampleId: sample.id, sessionId: s.id, cupperId: b, cupsPerSample: 2, values: 5, overrides: { cups: null },
    });
    const nulls = await prisma.evaluation.count({ where: { sessionId: s.id, cups: null } });
    expect(nulls).toBe(2);
    const agg = await storedAggregate(sample.id);
    expect([agg?.totalCups, agg?.totalDefective, agg?.totalNonUniform]).toEqual([4, 1, 1]);
    expect(agg?.communityScore).toBe(73);
    // and it equals TypeScript with cups left to the session's value
    const ts = computeGroupAggregate(
      [
        { data: affectiveData(5), nonUniformCups: [true, false], defectiveCups: [true, false] },
        { data: affectiveData(5), nonUniformCups: [false, false], defectiveCups: [false, false] },
      ],
      2,
    );
    expect(ts.communityScore).toBe(agg?.communityScore);
  });

  it("flag arrays longer than the evaluation's cups are clamped on both sides", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, participants: [a] });
    const sample = s.samples[0];
    await makeEvaluation({
      sampleId: sample.id, sessionId: s.id, cupperId: a, cupsPerSample: 2, values: 5,
      overrides: {
        nonUniformCups: [true, true, true, true, true],
        defectiveCups: [true, true, true, true, true],
      },
    });
    const agg = await storedAggregate(sample.id);
    // clamped to 2 cups: u 2, d 2 -> 2*2 + 4*2 = 12, never 6 per flag of the longer array
    expect([agg?.totalCups, agg?.totalNonUniform, agg?.totalDefective]).toEqual([2, 2, 2]);
    expect(agg?.communityScore).toBe(67);
    const ts = computeGroupAggregate(
      [
        {
          data: affectiveData(5),
          nonUniformCups: [true, true, true, true, true],
          defectiveCups: [true, true, true, true, true],
          cups: 2,
        },
      ],
      2,
    );
    expect(ts.communityScore).toBe(67);
    expect(ts.totalNonUniform).toBe(2);
    expect(ts.totalDefective).toBe(2);
  });

  it("an evaluation's own cups, not the session's, size the pool", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 5, participants: [a, b] });
    const sample = s.samples[0];
    await makeEvaluation({
      sampleId: sample.id, sessionId: s.id, cupperId: a, cupsPerSample: 5, values: 5,
      nonUniform: [true, false], defective: [true, false], overrides: { cups: 2 },
    });
    await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: b, cupsPerSample: 5, values: 5, overrides: { cups: 1 } });
    const agg = await storedAggregate(sample.id);
    expect([agg?.totalCups, agg?.totalDefective, agg?.totalNonUniform, agg?.cupsPerSample]).toEqual([3, 1, 1, 5]);
    expect(agg?.communityScore).toBe(73);
  });

  it("drafts never count; submitting later does", async () => {
    const owner = await makeUser();
    const a = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [a] });
    const ev = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: a, values: 8, draft: true });
    expect(await storedAggregate(s.samples[0].id)).toBeNull();
    await prisma.evaluation.update({ where: { id: ev.id }, data: { isDraft: false, submittedAt: new Date() } });
    expect((await storedAggregate(s.samples[0].id))?.participantCount).toBe(1);
  });

  it("generated grid (~320 cases): trigger and TypeScript never differ", async () => {
    // mulberry32: deterministic, so a failure is reproducible from the case index
    let seed = 20261112;
    const rnd = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

    const owner = await makeUser();
    const pool = await Promise.all(Array.from({ length: 9 }, () => makeUser()));
    const diffs: string[] = [];
    let total = 0;

    for (const cups of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const nSamples = 40;
      const s = await makeSession({
        ownerId: owner,
        isGroup: true,
        cupsPerSample: cups,
        participants: pool,
        samples: Array.from({ length: nSamples }, () => ({})),
      });
      const cases: Case[] = [];
      for (let k = 0; k < nSamples; k++) {
        const n = int(1, 9);
        const flat = rnd() < 0.3; // flat values make ties on the 0.25 grid likely
        const cuppers: Case["cuppers"] = [];
        for (let i = 0; i < n; i++) {
          const values = flat ? int(2, 8) : Array.from({ length: 8 }, () => int(1, 9));
          const flags = () => Array.from({ length: cups }, () => rnd() < 0.2);
          const defective = flags().map((d) => d && rnd() < 0.5);
          // a defective cup is also non-uniform (the cup grid enforces it)
          const nonUniform = flags().map((u, j) => u || defective[j]);
          cuppers.push({ values, nonUniform, defective, omit: rnd() < 0.08 ? int(0, 7) : undefined });
        }
        cases.push({ cups, cuppers });
        await prisma.evaluation.createMany({
          data: await Promise.all(
            cuppers.map(async (p, i) => {
              const { computeEvaluationDerived } = await import("@/lib/evaluation");
              const data = affectiveData(p.values) as Record<string, unknown>;
              if (p.omit !== undefined) delete data[Object.keys(data)[p.omit]];
              const f = computeEvaluationDerived("affective", { ...data, tazas_no_uniformes: p.nonUniform, tazas_defectuosas: p.defective }, cups);
              return {
                sessionSampleId: s.samples[k].id,
                sessionId: s.id,
                cupperId: pool[i],
                ...(f as unknown as Record<string, never>),
                isDraft: false,
                submittedAt: new Date(),
              };
            }),
          ),
        });
      }
      for (let k = 0; k < nSamples; k++) {
        total++;
        const agg = await storedAggregate(s.samples[k].id);
        const ts = tsSide(cases[k]);
        if (ts.included === 0) {
          // TS says null, the trigger stores 0 with participantCount 0: same meaning
          if (agg?.participantCount !== 0) diffs.push(`cups=${cups} k=${k}: included 0 vs ${agg?.participantCount}`);
          continue;
        }
        const ok =
          agg?.communityScore === ts.communityScore &&
          agg?.participantCount === ts.included &&
          agg?.submittedCount === ts.submitted &&
          Math.abs((agg?.avgRawScore ?? 0) - (ts.avgRawScore ?? 0)) < 0.006 &&
          agg?.totalCups === ts.totalCups &&
          agg?.totalNonUniform === ts.totalNonUniform &&
          agg?.totalDefective === ts.totalDefective &&
          Math.abs((agg?.uniformityPenalty ?? 0) - ts.uniformityPenalty) < 1e-9 &&
          Math.abs((agg?.defectPenalty ?? 0) - ts.defectPenalty) < 1e-9;
        if (!ok) {
          diffs.push(
            `cups=${cups} k=${k} cuppers=${JSON.stringify(cases[k].cuppers)}: db=${agg?.communityScore} ts=${ts.communityScore}`,
          );
        }
      }
    }
    expect(total).toBe(320);
    expect(diffs).toEqual([]);
  }, 300_000);
});

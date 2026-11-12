// Group 1 (audit B-04 / S8-04): the REAL trigger trg_recompute_aggregate versus
// the TypeScript twin (computeGroupAggregate / calcCommunityScore).
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

function tsSide(c: Case) {
  const evals: GroupEvalInput[] = c.cuppers.map((p) => {
    const data = affectiveData(p.values) as Record<string, unknown>;
    if (p.omit !== undefined) delete data[Object.keys(data)[p.omit]];
    return {
      data: { ...data, tazas_no_uniformes: p.nonUniform.slice(0, c.cups), tazas_defectuosas: p.defective.slice(0, c.cups) },
      nonUniformCups: p.nonUniform.slice(0, c.cups),
      defectiveCups: p.defective.slice(0, c.cups),
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

  it("under five cups: no deductions on either side", async () => {
    const c: Case = {
      cups: 3,
      cuppers: [
        { values: 7, nonUniform: [true, true, false], defective: [false, true, false] },
        { values: 5, nonUniform: [true], defective: [] },
      ],
    };
    const { agg } = await dbSide(c);
    const ts = tsSide(c);
    expect(agg?.uniformityPenalty).toBe(0);
    expect(agg?.defectPenalty).toBe(0);
    expect(ts.totalNonUniform).toBe(0);
    // stored totals still count the flags (display only); the score ignores them
    expect(agg?.communityScore).toBe(ts.communityScore);
    // avg of 0.65625*56+52.75=89.5 and 0.65625*40+52.75=79 -> 84.25
    expect(agg?.communityScore).toBe(84.25);
  });

  it("audit tie case (7 cuppers, 5 cups, sum 20, 1 non-uniform + 2 defective): 64 on both sides", async () => {
    const vals = [3, 3, 3, 3, 2, 2, 2, 2]; // sum 20
    const c: Case = {
      cups: 5,
      cuppers: [
        { values: vals, nonUniform: [true], defective: [] },
        { values: vals, nonUniform: [], defective: [true] },
        { values: vals, nonUniform: [], defective: [false, true] },
        ...Array.from({ length: 4 }, () => ({ values: vals, nonUniform: [] as boolean[], defective: [] as boolean[] })),
      ],
    };
    const { agg } = await dbSide(c);
    const ts = tsSide(c);
    expect(agg?.totalNonUniform).toBe(1);
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
          (cups < 5 || (agg?.totalNonUniform === ts.totalNonUniform && agg?.totalDefective === ts.totalDefective));
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

// Group 6: writeEvaluationOrdered (S8-18) -- the conditional update that orders
// concurrent / replayed evaluation writes by clientTs, run against Postgres.
import { beforeEach, describe, expect, it } from "vitest";
import { writeEvaluationOrdered, type EvaluationWriteDb } from "@/lib/evaluationWrite";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { affectiveData, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(resetDb);

const db = prisma as unknown as EvaluationWriteDb;

function fields(v: number) {
  return computeEvaluationDerived("affective", { ...affectiveData(v), tazas_no_uniformes: [], tazas_defectuosas: [] }, 5);
}

async function setup() {
  const owner = await makeUser();
  const s = await makeSession({ ownerId: owner, samples: [{}] });
  return { owner, sessionId: s.id, sampleId: s.samples[0].id };
}

async function row(sampleId: string, cupperId: string) {
  return prisma.evaluation.findUniqueOrThrow({
    where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId } },
  });
}
const rating = (r: { affectiveData: unknown }) => (r.affectiveData as Record<string, number>).fragancia_af_final;

describe("writeEvaluationOrdered", () => {
  it("creates the row on the first write and stores the stamp", async () => {
    const { owner, sessionId, sampleId } = await setup();
    const t = Date.now() - 20_000;
    const r = await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(6), clientTs: t });
    expect(r.applied).toBe(true);
    const e = await row(sampleId, owner);
    expect(e.lastClientWriteAt?.getTime()).toBe(t);
    expect(e.isDraft).toBe(true);
    expect(rating(e)).toBe(6);
  });

  it("an older clientTs arriving after a newer one is ignored", async () => {
    const { owner, sessionId, sampleId } = await setup();
    const older = Date.now() - 60_000;
    const newer = Date.now() - 10_000;
    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(8), clientTs: newer });
    const r = await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(3), clientTs: older });
    expect(r.applied).toBe(false);
    const e = await row(sampleId, owner);
    expect(rating(e)).toBe(8);
    expect(e.lastClientWriteAt?.getTime()).toBe(newer);
  });

  it("a newer write applies; an equal stamp is idempotent and applies", async () => {
    const { owner, sessionId, sampleId } = await setup();
    const t1 = Date.now() - 50_000;
    const t2 = Date.now() - 40_000;
    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(4), clientTs: t1 });
    expect((await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(5), clientTs: t2 })).applied).toBe(true);
    expect(rating(await row(sampleId, owner))).toBe(5);
    expect((await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(7), clientTs: t2 })).applied).toBe(true);
    expect(rating(await row(sampleId, owner))).toBe(7);
  });

  it("without a clientTs (legacy bundle) the write always applies and leaves the stamp alone", async () => {
    const { owner, sessionId, sampleId } = await setup();
    const t = Date.now() - 30_000;
    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(8), clientTs: t });
    for (const bad of [undefined, null, "yesterday", -5, 1.5, Date.now() + 3_600_000]) {
      const r = await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(2), clientTs: bad });
      expect(r.applied).toBe(true);
    }
    const e = await row(sampleId, owner);
    expect(rating(e)).toBe(2);
    expect(e.lastClientWriteAt?.getTime()).toBe(t);
  });

  it("an edit of a SUBMITTED row re-fires the aggregate trigger in the same write", async () => {
    const { owner, sessionId, sampleId } = await setup();
    const t1 = Date.now() - 50_000;
    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(4), clientTs: t1 });
    await prisma.evaluation.updateMany({ where: { sessionSampleId: sampleId }, data: { isDraft: false, submittedAt: new Date() } });
    const before = await storedAggregate(sampleId);
    expect(before?.communityScore).toBe(0.65625 * 32 + 52.75 /* 73.75 */);

    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(8), clientTs: t1 + 1000 });
    const after = await storedAggregate(sampleId);
    expect(after?.communityScore).toBe(94.75);
    // and an older stamp leaves the stored aggregate alone too
    await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId, cupperId: owner, fields: fields(1), clientTs: t1 });
    expect((await storedAggregate(sampleId))?.communityScore).toBe(94.75);
  });

  it("two concurrent writes (any arrival order) never lose the newer one", async () => {
    const { owner, sessionId } = await setup();
    const sessionRow = await makeSession({ ownerId: owner, samples: Array.from({ length: 30 }, () => ({})) });
    const now = Date.now();
    for (let i = 0; i < sessionRow.samples.length; i++) {
      const sampleId = sessionRow.samples[i].id;
      const older = now - 60_000;
      const newer = now - 5_000;
      // half the iterations start from an existing draft, half from no row (both create paths)
      if (i % 2 === 0) {
        await writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId: sessionRow.id, cupperId: owner, fields: fields(5), clientTs: now - 90_000 });
      }
      const a = () => writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId: sessionRow.id, cupperId: owner, fields: fields(2), clientTs: older });
      const b = () => writeEvaluationOrdered(db, { sessionSampleId: sampleId, sessionId: sessionRow.id, cupperId: owner, fields: fields(9), clientTs: newer });
      const results = await Promise.all(i % 3 === 0 ? [a(), b()] : [b(), a()]);
      expect(results.every((r) => typeof r.id === "string")).toBe(true);
      const e = await row(sampleId, owner);
      expect(rating(e)).toBe(9);
      expect(e.lastClientWriteAt?.getTime()).toBe(newer);
      expect(await prisma.evaluation.count({ where: { sessionSampleId: sampleId } })).toBe(1);
    }
    void sessionId;
  });
});

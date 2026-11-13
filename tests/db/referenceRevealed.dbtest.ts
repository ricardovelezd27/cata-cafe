// S10 WP3a review H1: a reference change that would PIN (rewrite the ratings of)
// an already revealed sample is refused, in anchor mode, on every path.
// Real actions against Postgres; only auth, next and the Supabase admin client are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: h.userId, is_anonymous: false }),
  requireRegisteredUser: async () => ({ id: h.userId, is_anonymous: false }),
  requireUserExpecting: async () => ({ id: h.userId, is_anonymous: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: {} } }) }));

import { removeSessionSample, setReferenceSample } from "@/app/actions/sessions";
import { makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(resetDb);

async function setup(mode: "anchor" | "free" = "anchor") {
  const owner = await makeUser({ name: "Dueña" });
  const s = await makeSession({
    ownerId: owner,
    isGroup: false,
    cupsPerSample: 2,
    samples: [{ revealed: true }, {}, {}],
  });
  await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceMode: mode } });
  h.userId = owner;
  const [A, B, C] = s.samples;
  return { owner, s, A, B, C };
}

async function ratings(sampleId: string, cupperId: string) {
  const e = await prisma.evaluation.findUniqueOrThrow({
    where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId } },
  });
  return { data: e.affectiveData, score: e.individualScore };
}

describe("reference_revealed (anchor mode)", () => {
  it("marking a revealed sample as the reference is refused; ratings and aggregate unchanged", async () => {
    const { owner, s, A } = await setup();
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 8 });
    const before = await ratings(A.id, owner);
    const aggBefore = await storedAggregate(A.id);

    const r = await setReferenceSample(s.id, A.id, true);
    expect(r).toEqual({ ok: false, error: "reference_revealed" });

    expect(await ratings(A.id, owner)).toEqual(before);
    const aggAfter = await storedAggregate(A.id);
    expect(aggAfter?.communityScore).toBe(aggBefore?.communityScore);
    expect(aggAfter?.computedAt.getTime()).toBe(aggBefore?.computedAt.getTime());
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { referenceSampleId: true } });
    expect(row.referenceSampleId).toBeNull();
    const sample = await prisma.sessionSample.findUniqueOrThrow({ where: { id: A.id }, select: { referenceRank: true } });
    expect(sample.referenceRank).toBeNull();
  });

  it("a blind sample can still be marked", async () => {
    const { s, B } = await setup();
    const r = await setReferenceSample(s.id, B.id, true);
    expect(r.ok).toBe(true);
  });

  async function twoReferences() {
    const ctx = await setup();
    const { s, A, B } = ctx;
    // A (revealed) is the earlier reference, B the active one.
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    await prisma.sessionSample.update({ where: { id: B.id }, data: { referenceRank: 2 } });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: B.id } });
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: ctx.owner, cupsPerSample: 2, values: 8 });
    return ctx;
  }

  it("removing the active reference when the earlier one is revealed is refused", async () => {
    const { owner, s, A, B } = await twoReferences();
    const before = await ratings(A.id, owner);
    const r = await setReferenceSample(s.id, null, true);
    expect(r).toEqual({ ok: false, error: "reference_revealed" });
    expect(await ratings(A.id, owner)).toEqual(before);
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { referenceSampleId: true } });
    expect(row.referenceSampleId).toBe(B.id);
  });

  it("deleting the active reference's sample when the earlier one is revealed is refused; nothing deleted", async () => {
    const { owner, s, A, B } = await twoReferences();
    const before = await ratings(A.id, owner);
    const r = await removeSessionSample(B.id);
    expect(r).toEqual({ ok: false, error: "reference_revealed" });
    expect(await prisma.sessionSample.count({ where: { sessionId: s.id } })).toBe(3);
    expect(await ratings(A.id, owner)).toEqual(before);
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { referenceSampleId: true } });
    expect(row.referenceSampleId).toBe(B.id);
  });
});

describe("nothing to rewrite: the organiser is never stuck (round 3)", () => {
  // A (revealed) is the earlier reference, B the active one, and A's stored rows are
  // EXACTLY the anchor state (all eight ratings 5, no cup marks): pinning would change nothing.
  async function anchoredEarlier() {
    const ctx = await setup();
    const { s, A, B, owner } = ctx;
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    await prisma.sessionSample.update({ where: { id: B.id }, data: { referenceRank: 2 } });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: B.id } });
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 5, nonUniform: [false, false], defective: [false, false] });
    const row = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
    });
    const agg = await storedAggregate(A.id);
    return { ...ctx, row, agg };
  }

  it("removing the active reference succeeds when the revealed earlier one is already at the anchor; rows byte-identical, no aggregate rewritten", async () => {
    const { s, A, owner, row, agg } = await anchoredEarlier();
    const r = await setReferenceSample(s.id, null);
    expect(r).toEqual({ ok: true, data: { referenceSampleId: A.id } });
    const after = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
    });
    expect(after).toEqual(row);
    const aggAfter = await storedAggregate(A.id);
    expect(aggAfter?.computedAt.getTime()).toBe(agg?.computedAt.getTime());
    expect(aggAfter?.communityScore).toBe(agg?.communityScore);
  });

  it("deleting the active reference's sample succeeds in the same situation", async () => {
    const { s, A, B, owner, row, agg } = await anchoredEarlier();
    const r = await removeSessionSample(B.id);
    expect(r).toEqual({ ok: true });
    expect(await prisma.sessionSample.count({ where: { sessionId: s.id } })).toBe(2);
    const sess = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { referenceSampleId: true } });
    expect(sess.referenceSampleId).toBe(A.id);
    const after = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
    });
    expect(after).toEqual(row);
    const aggAfter = await storedAggregate(A.id);
    expect(aggAfter?.computedAt.getTime()).toBe(agg?.computedAt.getTime());
  });
});

describe("free mode is unaffected", () => {
  it("a revealed sample can be the reference and nothing is rewritten", async () => {
    const { owner, s, A } = await setup("free");
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 8 });
    const before = await ratings(A.id, owner);
    const r = await setReferenceSample(s.id, A.id);
    expect(r.ok).toBe(true);
    expect(await ratings(A.id, owner)).toEqual(before);
  });
});

// S10 WP8, third review H1(c): the optional `expectedUserId` on the live cup-page
// writes and on the offline replay, against a real Postgres. A tab rendered for
// guest A must never write A's scores as guest B (B replaced A's cookie from
// another tab), nor as nobody. Only external boundaries are mocked: the cookie
// (Supabase server client) and Next's cache/after hooks. `@/lib/auth`,
// `lib/sessionAuth`, the actions and Prisma are the real code.
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = { id: string; email: string | null; is_anonymous: boolean } | null;
const cookie: { user: FakeUser } = { user: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookie.user }, error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { upsertEvaluation } from "@/app/actions/sessions";
import { submitAllEvaluations } from "@/app/actions/community";
import { replayEvaluation } from "@/app/actions/offline";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

const signedInAs = (id: string | null) => {
  cookie.user = id === null ? null : { id, email: null, is_anonymous: true };
};

async function groupWithTwo() {
  const owner = await makeUser();
  const a = await makeUser({ anonymous: true, name: "Ana" });
  const b = await makeUser({ anonymous: true, name: "Beto" });
  const s = await makeSession({ ownerId: owner, isGroup: true, participants: [a, b], samples: [{}] });
  return { owner, a, b, sessionId: s.id, sampleId: s.samples[0].id };
}

const input = (sampleId: string, sessionId: string, extra: Record<string, unknown> = {}) => ({
  sessionSampleId: sampleId,
  sessionId,
  moduleKey: "affective" as const,
  data: { ...affectiveData(7), tazas_no_uniformes: [], tazas_defectuosas: [] },
  cupsPerSample: 5,
  ...extra,
});

const evalCount = (sampleId: string) => prisma.evaluation.count({ where: { sessionSampleId: sampleId } });

beforeEach(async () => {
  await resetDb();
  signedInAs(null);
});

describe("upsertEvaluation expectedUserId", () => {
  it("a mismatching expectedUserId writes no row and answers identity_changed", async () => {
    const { a, b, sessionId, sampleId } = await groupWithTwo();
    signedInAs(b); // another tab signed B in; this tab still shows A
    const r = await upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }));
    expect(r).toEqual({ ok: false, error: "identity_changed" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("a mismatch changes no existing row either", async () => {
    const { a, b, sessionId, sampleId } = await groupWithTwo();
    await makeEvaluation({ sampleId, sessionId, cupperId: b, values: 4, draft: true });
    signedInAs(b);
    await upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }));
    const row = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId: b } },
    });
    expect((row.affectiveData as Record<string, number>).fragancia_af_final).toBe(4);
    expect(await evalCount(sampleId)).toBe(1);
  });

  it("nobody signed in + an expectation = identity_changed, not a throw", async () => {
    const { a, sessionId, sampleId } = await groupWithTwo();
    signedInAs(null);
    const r = await upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }));
    expect(r).toEqual({ ok: false, error: "identity_changed" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("an absent expectedUserId writes as before (for whoever is signed in)", async () => {
    const { b, sessionId, sampleId } = await groupWithTwo();
    signedInAs(b);
    const r = await upsertEvaluation(input(sampleId, sessionId));
    expect(r.ok).toBe(true);
    const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId } });
    expect(rows.map((x) => x.cupperId)).toEqual([b]);
  });

  it("without an expectation and nobody signed in it still throws not_authenticated", async () => {
    const { sessionId, sampleId } = await groupWithTwo();
    signedInAs(null);
    await expect(upsertEvaluation(input(sampleId, sessionId))).rejects.toThrow("not_authenticated");
  });

  it("a matching expectedUserId writes", async () => {
    const { a, sessionId, sampleId } = await groupWithTwo();
    signedInAs(a);
    const r = await upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }));
    expect(r.ok).toBe(true);
    const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId } });
    expect(rows.map((x) => x.cupperId)).toEqual([a]);
  });
});

describe("submitAllEvaluations expectedUserId", () => {
  it("a mismatch submits nothing (A's and B's drafts both stay drafts)", async () => {
    const { a, b, sessionId, sampleId } = await groupWithTwo();
    await makeEvaluation({ sampleId, sessionId, cupperId: a, draft: true });
    await makeEvaluation({ sampleId, sessionId, cupperId: b, draft: true });
    signedInAs(b);
    const r = await submitAllEvaluations(sessionId, a);
    expect(r).toEqual({ ok: false, error: "identity_changed" });
    const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId } });
    expect(rows.every((x) => x.isDraft)).toBe(true);
  });

  it("an absent argument submits the signed-in user's drafts as before", async () => {
    const { a, b, sessionId, sampleId } = await groupWithTwo();
    await makeEvaluation({ sampleId, sessionId, cupperId: a, draft: true });
    await makeEvaluation({ sampleId, sessionId, cupperId: b, draft: true });
    signedInAs(b);
    const r = await submitAllEvaluations(sessionId);
    expect(r.ok).toBe(true);
    const byUser = Object.fromEntries(
      (await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId } })).map((x) => [x.cupperId, x.isDraft]),
    );
    expect(byUser[b]).toBe(false);
    expect(byUser[a]).toBe(true);
  });

  it("a matching id submits", async () => {
    const { a, sessionId, sampleId } = await groupWithTwo();
    await makeEvaluation({ sampleId, sessionId, cupperId: a, draft: true });
    signedInAs(a);
    const r = await submitAllEvaluations(sessionId, a);
    expect(r.ok).toBe(true);
    const row = await prisma.evaluation.findFirstOrThrow({ where: { sessionSampleId: sampleId, cupperId: a } });
    expect(row.isDraft).toBe(false);
  });
});

describe("replayEvaluation expectedUserId", () => {
  const replay = (sampleId: string, extra: Record<string, unknown> = {}) =>
    replayEvaluation({
      sessionSampleId: sampleId,
      moduleKey: "affective",
      data: { ...affectiveData(7), tazas_no_uniformes: [], tazas_defectuosas: [] },
      cupsPerSample: 5,
      ...extra,
    });

  it("a mismatch answers pending and writes nothing", async () => {
    const { a, b, sampleId } = await groupWithTwo();
    signedInAs(b);
    expect(await replay(sampleId, { expectedUserId: a })).toEqual({ status: "pending" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("nobody signed in + an expectation answers pending (no throw, no attempt burnt)", async () => {
    const { a, sampleId } = await groupWithTwo();
    signedInAs(null);
    expect(await replay(sampleId, { expectedUserId: a })).toEqual({ status: "pending" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("an absent argument writes as before", async () => {
    const { b, sampleId } = await groupWithTwo();
    signedInAs(b);
    expect(await replay(sampleId)).toEqual({ status: "synced" });
    const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId } });
    expect(rows.map((x) => x.cupperId)).toEqual([b]);
  });

  it("without an expectation and nobody signed in it still throws not_authenticated", async () => {
    const { sampleId } = await groupWithTwo();
    signedInAs(null);
    await expect(replay(sampleId)).rejects.toThrow("not_authenticated");
  });

  it("a matching id writes", async () => {
    const { a, sampleId } = await groupWithTwo();
    signedInAs(a);
    expect(await replay(sampleId, { expectedUserId: a })).toEqual({ status: "synced" });
    expect(await evalCount(sampleId)).toBe(1);
  });
});

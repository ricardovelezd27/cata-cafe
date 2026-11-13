// S10 WP8, third and fourth review: the optional `expectedUserId` on the live
// cup-page writes and on the offline replay, against a real Postgres. A tab
// rendered for guest A must never write A's scores as guest B (B replaced A's
// cookie from another tab). "Nobody signed in" and "the auth lookup failed" are
// NOT an identity change: they answer what main answers (not_authenticated; a
// replay answers pending), and write nothing. Only external boundaries are mocked: the cookie
// (Supabase server client) and Next's cache/after hooks. `@/lib/auth`,
// `lib/sessionAuth`, the actions and Prisma are the real code.
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = { id: string; email: string | null; is_anonymous: boolean } | null;
const cookie: { user: FakeUser; error: unknown } = { user: null, error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookie.user }, error: cookie.error }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { randomUUID } from "node:crypto";
import { upsertEvaluation, upsertExtrinsic, upsertPhysical } from "@/app/actions/sessions";
import { completeGuestOnboarding, finishSoloSession, submitAllEvaluations } from "@/app/actions/community";
import { joinSessionAsGuest } from "@/app/actions/join";
import { replayEvaluation, replayExtrinsic, replayPhysical } from "@/app/actions/offline";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

const signedInAs = (id: string | null) => {
  cookie.user = id === null ? null : { id, email: null, is_anonymous: true };
  cookie.error = null;
};
// The auth lookup itself failed (network drop, GoTrue 503): no user AND an error.
const authUnreachable = () => {
  cookie.user = null;
  cookie.error = { name: "AuthApiError", status: 503, message: "down" };
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

  it("nobody signed in + an expectation behaves as main: not_authenticated, nothing written", async () => {
    const { a, sessionId, sampleId } = await groupWithTwo();
    signedInAs(null);
    await expect(upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }))).rejects.toThrow(
      "not_authenticated",
    );
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("an unreachable auth lookup behaves as main (not identity_changed), nothing written", async () => {
    const { a, sessionId, sampleId } = await groupWithTwo();
    authUnreachable();
    await expect(upsertEvaluation(input(sampleId, sessionId, { expectedUserId: a }))).rejects.toThrow(
      "not_authenticated",
    );
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

  it("a different signed-in user answers identity_changed (distinct from pending) and writes nothing", async () => {
    const { a, b, sampleId } = await groupWithTwo();
    signedInAs(b);
    expect(await replay(sampleId, { expectedUserId: a })).toEqual({ status: "identity_changed" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("nobody signed in + an expectation answers pending (no throw, no attempt burnt)", async () => {
    const { a, sampleId } = await groupWithTwo();
    signedInAs(null);
    expect(await replay(sampleId, { expectedUserId: a })).toEqual({ status: "pending" });
    expect(await evalCount(sampleId)).toBe(0);
  });

  it("an unreachable auth lookup answers pending too", async () => {
    const { a, sampleId } = await groupWithTwo();
    authUnreachable();
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

// ─── the other writes: physical, extrinsic, finishSoloSession, onboarding ───

const profileCount = () => prisma.profile.count();

async function soloOwned() {
  const owner = await makeUser({ name: "Dueña" });
  const other = await makeUser({ anonymous: true, name: "Otro" });
  const s = await makeSession({ ownerId: owner, isGroup: false, samples: [{}] });
  return { owner, other, sessionId: s.id, sampleId: s.samples[0].id };
}

const physRows = (sampleId: string) => prisma.physicalEvaluation.count({ where: { sessionSampleId: sampleId } });
const extRows = (sampleId: string) => prisma.extrinsicData.count({ where: { sessionSampleId: sampleId } });

describe("upsertPhysical / upsertExtrinsic expectedUserId", () => {
  it("a different signed-in user: identity_changed, nothing written", async () => {
    const { owner, other, sampleId } = await soloOwned();
    signedInAs(other);
    expect(await upsertPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      ok: false,
      error: "identity_changed",
    });
    expect(await upsertExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      ok: false,
      error: "identity_changed",
    });
    expect(await physRows(sampleId)).toBe(0);
    expect(await extRows(sampleId)).toBe(0);
  });

  it("nobody signed in: what main answers (not_authenticated), nothing written", async () => {
    const { owner, sampleId } = await soloOwned();
    signedInAs(null);
    await expect(upsertPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).rejects.toThrow(
      "not_authenticated",
    );
    expect(await upsertExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      ok: false,
      error: "not_authenticated",
    });
    expect(await physRows(sampleId)).toBe(0);
    expect(await extRows(sampleId)).toBe(0);
  });

  it("an unreachable auth lookup: what main answers, never identity_changed, nothing written", async () => {
    const { owner, sampleId } = await soloOwned();
    authUnreachable();
    await expect(upsertPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).rejects.toThrow(
      "not_authenticated",
    );
    expect(await upsertExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      ok: false,
      error: "not_authenticated",
    });
    expect(await physRows(sampleId)).toBe(0);
    expect(await extRows(sampleId)).toBe(0);
  });

  it("a matching id writes both", async () => {
    const { owner, sampleId } = await soloOwned();
    signedInAs(owner);
    expect(await upsertPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      ok: true,
    });
    expect((await upsertExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).ok).toBe(true);
    expect(await physRows(sampleId)).toBe(1);
    expect(await extRows(sampleId)).toBe(1);
  });
});

describe("replayPhysical / replayExtrinsic expectedUserId", () => {
  it("a different user answers identity_changed; nobody and an unreachable lookup answer pending; nothing is written", async () => {
    const { owner, other, sampleId } = await soloOwned();
    signedInAs(other);
    expect(await replayPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      status: "identity_changed",
    });
    expect(await replayExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      status: "identity_changed",
    });
    for (const arrange of [() => signedInAs(null), () => authUnreachable()]) {
      arrange();
      expect(await replayPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
        status: "pending",
      });
      expect(await replayExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
        status: "pending",
      });
    }
    expect(await physRows(sampleId)).toBe(0);
    expect(await extRows(sampleId)).toBe(0);
  });

  it("a matching id writes", async () => {
    const { owner, sampleId } = await soloOwned();
    signedInAs(owner);
    expect(await replayPhysical({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      status: "synced",
    });
    expect(await replayExtrinsic({ sessionSampleId: sampleId, data: { a: 1 }, expectedUserId: owner })).toEqual({
      status: "synced",
    });
    expect(await physRows(sampleId)).toBe(1);
    expect(await extRows(sampleId)).toBe(1);
  });
});

describe("finishSoloSession / submitAllEvaluations: no profile upserted when they refuse", () => {
  const statusOf = async (id: string) => (await prisma.cuppingSession.findUniqueOrThrow({ where: { id } })).status;

  it("finishSoloSession: a different signed-in user", async () => {
    const { owner, sessionId } = await soloOwned();
    const ghost = randomUUID(); // signed in on the cookie, no profile row yet
    signedInAs(ghost);
    const before = await profileCount();
    expect(await finishSoloSession(sessionId, owner)).toEqual({ ok: false, error: "identity_changed" });
    expect(await statusOf(sessionId)).toBe("active");
    expect(await profileCount()).toBe(before);
    expect(await prisma.profile.findUnique({ where: { id: ghost } })).toBeNull();
  });

  it("finishSoloSession: nobody signed in / unreachable answer not_authenticated (as main)", async () => {
    const { owner, sessionId } = await soloOwned();
    const before = await profileCount();
    signedInAs(null);
    expect(await finishSoloSession(sessionId, owner)).toEqual({ ok: false, error: "not_authenticated" });
    authUnreachable();
    expect(await finishSoloSession(sessionId, owner)).toEqual({ ok: false, error: "not_authenticated" });
    expect(await statusOf(sessionId)).toBe("active");
    expect(await profileCount()).toBe(before);
  });

  it("submitAllEvaluations: all three refusals leave the profile table alone", async () => {
    const { owner, sessionId } = await soloOwned();
    const ghost = randomUUID();
    signedInAs(ghost);
    const before = await profileCount();
    expect(await submitAllEvaluations(sessionId, owner)).toEqual({ ok: false, error: "identity_changed" });
    signedInAs(null);
    expect(await submitAllEvaluations(sessionId, owner)).toEqual({ ok: false, error: "not_authenticated" });
    authUnreachable();
    expect(await submitAllEvaluations(sessionId, owner)).toEqual({ ok: false, error: "not_authenticated" });
    expect(await profileCount()).toBe(before);
  });
});

describe("joinSessionAsGuest expectedUserId (WP8b)", () => {
  async function inviteTo() {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, samples: [{}] });
    const token = "tok-" + randomUUID();
    await prisma.sessionInvite.create({ data: { sessionId: s.id, token, createdBy: owner } });
    return { sessionId: s.id, token };
  }
  const members = (sessionId: string) => prisma.sessionParticipant.count({ where: { sessionId } });

  it("a different signed-in user than the guest the form onboarded: identity_changed, nobody joined", async () => {
    const { sessionId, token } = await inviteTo();
    const mine = await makeUser({ anonymous: true, name: "Mine" });
    const other = await makeUser({ anonymous: true, name: "Other" });
    signedInAs(other); // the cookie flipped between onboarding and the join
    expect(await joinSessionAsGuest(token, "es", mine)).toEqual({ ok: false, error: "identity_changed" });
    expect(await members(sessionId)).toBe(0);
    const invite = await prisma.sessionInvite.findUniqueOrThrow({ where: { token } });
    expect(invite.useCount).toBe(0);
  });

  it("nobody signed in: not_authenticated as main, nobody joined", async () => {
    const { sessionId, token } = await inviteTo();
    const mine = await makeUser({ anonymous: true, name: "Mine" });
    signedInAs(null);
    expect(await joinSessionAsGuest(token, "es", mine)).toEqual({ ok: false, error: "not_authenticated" });
    expect(await members(sessionId)).toBe(0);
  });
});

describe("completeGuestOnboarding expectedUserId", () => {
  const nameOf = async (id: string) => (await prisma.profile.findUnique({ where: { id } }))?.displayName;

  it("a mismatch refuses and writes nothing", async () => {
    const mine = await makeUser({ anonymous: true, name: "Mine" });
    const other = await makeUser({ anonymous: true, name: "Other" });
    signedInAs(other); // another tab replaced the cookie after signInAnonymously
    expect(await completeGuestOnboarding("Nuevo", mine)).toEqual({ ok: false, error: "identity_changed" });
    expect(await nameOf(mine)).toBe("Mine");
    expect(await nameOf(other)).toBe("Other");
  });

  it("nobody signed in / unreachable: not_authenticated (a throw, as main), nothing written", async () => {
    const mine = await makeUser({ anonymous: true, name: "Mine" });
    signedInAs(null);
    await expect(completeGuestOnboarding("Nuevo", mine)).rejects.toThrow("not_authenticated");
    authUnreachable();
    await expect(completeGuestOnboarding("Nuevo", mine)).rejects.toThrow("not_authenticated");
    expect(await nameOf(mine)).toBe("Mine");
  });

  it("a matching id writes the name; an absent id behaves as before", async () => {
    const mine = await makeUser({ anonymous: true, name: "Mine" });
    signedInAs(mine);
    expect(await completeGuestOnboarding("Nuevo", mine)).toEqual({ ok: true });
    expect(await nameOf(mine)).toBe("Nuevo");
    expect(await completeGuestOnboarding("Otro nombre")).toEqual({ ok: true });
    expect(await nameOf(mine)).toBe("Otro nombre");
  });
});

// S10 WP3a (X3): a revealed sample of an OPEN session is frozen for ratings.
// Real actions against Postgres; only auth, next and the Supabase admin client are mocked.
//  - live autosave refuses (typed `sample_revealed`), the stored row is unchanged
//  - offline replay answers `closed` (the client keeps the note as closed_unsent)
//  - submitting an existing draft still works on a revealed sample
//  - a NOT revealed sample of the same session still accepts writes
//  - revealSample touches the session row so open cup pages hear about it
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

import { revealSample, submitAllEvaluations } from "@/app/actions/community";
import { upsertEvaluation } from "@/app/actions/sessions";
import { replayEvaluation, syncEvaluation } from "@/app/actions/offline";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

const key = (sampleId: string, cupperId: string) => ({
  sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId },
});

async function setup() {
  const owner = await makeUser({ name: "Dueña" });
  const s = await makeSession({
    ownerId: owner,
    isGroup: false,
    cupsPerSample: 2,
    samples: [{ revealed: true }, { revealed: false }],
  });
  h.userId = owner;
  return { owner, s, revealed: s.samples[0], blind: s.samples[1] };
}

const payload = (sessionId: string, sampleId: string, v: number) => ({
  sessionSampleId: sampleId,
  sessionId,
  moduleKey: "affective" as const,
  data: { ...affectiveData(v), tazas_no_uniformes: [false, false], tazas_defectuosas: [false, false] },
  cupsPerSample: 2,
});

describe("reveal freezes evaluation on an open session", () => {
  it("live autosave: refused with sample_revealed and the stored row is unchanged", async () => {
    const { owner, s, revealed } = await setup();
    await makeEvaluation({ sampleId: revealed.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 6, draft: true });
    const before = await prisma.evaluation.findUniqueOrThrow({ where: key(revealed.id, owner) });

    const r = await upsertEvaluation(payload(s.id, revealed.id, 9));
    expect(r).toEqual({ ok: false, error: "sample_revealed" });

    const after = await prisma.evaluation.findUniqueOrThrow({ where: key(revealed.id, owner) });
    expect(after.affectiveData).toEqual(before.affectiveData);
    expect(after.individualScore).toBe(before.individualScore);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("live autosave: a first write for a revealed sample creates nothing", async () => {
    const { owner, s, revealed } = await setup();
    const r = await upsertEvaluation(payload(s.id, revealed.id, 7));
    expect(r).toEqual({ ok: false, error: "sample_revealed" });
    expect(await prisma.evaluation.findUnique({ where: key(revealed.id, owner) })).toBeNull();
  });

  it("a NOT revealed sample of the same session still accepts writes", async () => {
    const { owner, s, blind } = await setup();
    const r = await upsertEvaluation(payload(s.id, blind.id, 7));
    expect(r.ok).toBe(true);
    const row = await prisma.evaluation.findUniqueOrThrow({ where: key(blind.id, owner) });
    expect((row.affectiveData as Record<string, number>).fragancia_af_final).toBe(7);
  });

  it("offline replay (and the legacy sync) answer closed and write nothing", async () => {
    const { owner, s, revealed } = await setup();
    await makeEvaluation({ sampleId: revealed.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 6, draft: true });
    const before = await prisma.evaluation.findUniqueOrThrow({ where: key(revealed.id, owner) });
    const input = {
      sessionSampleId: revealed.id,
      sessionId: s.id,
      moduleKey: "affective" as const,
      data: payload(s.id, revealed.id, 9).data,
      cupsPerSample: 2,
    };
    expect(await replayEvaluation(input)).toEqual({ status: "closed" });
    // Legacy contract for cached bundles maps closed to "discarded"; still nothing written.
    expect(await syncEvaluation(input)).toEqual({ status: "discarded" });
    const after = await prisma.evaluation.findUniqueOrThrow({ where: key(revealed.id, owner) });
    expect(after.affectiveData).toEqual(before.affectiveData);
  });

  it("offline replay for a not revealed sample still syncs", async () => {
    const { s, blind } = await setup();
    const r = await replayEvaluation({
      sessionSampleId: blind.id,
      sessionId: s.id,
      moduleKey: "affective",
      data: payload(s.id, blind.id, 8).data,
      cupsPerSample: 2,
    });
    expect(r.status).toBe("synced");
  });

  it("submitting an existing complete draft still works on a revealed sample", async () => {
    const { owner, s, revealed } = await setup();
    await makeEvaluation({ sampleId: revealed.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 6, draft: true });
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);
    const row = await prisma.evaluation.findUniqueOrThrow({ where: key(revealed.id, owner) });
    expect(row.isDraft).toBe(false);
    expect((row.affectiveData as Record<string, number>).fragancia_af_final).toBe(6);
  });

  it("revealSample reveals and touches the session row (realtime hook for open cup pages)", async () => {
    const { s, blind } = await setup();
    const before = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { updatedAt: true } });
    await new Promise((r) => setTimeout(r, 20));
    const r = await revealSample(blind.id);
    expect(r.ok).toBe(true);
    const sample = await prisma.sessionSample.findUniqueOrThrow({ where: { id: blind.id }, select: { revealed: true } });
    expect(sample.revealed).toBe(true);
    const after = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id }, select: { updatedAt: true } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    // And from now on the sample is frozen.
    expect(await upsertEvaluation(payload(s.id, blind.id, 9))).toEqual({ ok: false, error: "sample_revealed" });
  });
});

// S10 WP6 fix round (1): a submit queued behind a long exclusive holder of the session row
// answers the typed `busy_retry` after about 5 s (SET LOCAL lock_timeout in lib/sessionLock.ts)
// instead of hanging and failing as `unknown`; nothing is submitted; when the row is free it works.
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

import { submitAllEvaluations } from "@/app/actions/community";
import { updateSampleMetadata, upsertEvaluation } from "@/app/actions/sessions";
import { pinReferenceAffective } from "@/lib/referenceRules";
import { isLockTimeoutError } from "@/lib/lockTimeout";
import { affectiveData, makeCoffee, makeEvaluation, makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

beforeEach(resetDb);

describe("session-row lock timeout", () => {
  it("submitAllEvaluations: busy_retry in about 5 s while another connection holds the row, then ok when it is free", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const cupper = await makeUser({ name: "Catador" });
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      cupsPerSample: 2,
      participants: [cupper],
      samples: [{}, {}],
    });
    await makeEvaluation({
      sampleId: s.samples[0].id, sessionId: s.id, cupperId: cupper, cupsPerSample: 2, values: 7, draft: true,
      nonUniform: [false, false], defective: [false, false],
    });
    h.userId = cupper;

    const holder = await rawClient();
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM cupping_sessions WHERE id = $1 FOR UPDATE", [s.id]);
    const release = new Promise<void>((resolve) =>
      setTimeout(async () => {
        await holder.query("ROLLBACK");
        await holder.end();
        resolve();
      }, 8000),
    );

    const t0 = Date.now();
    const r = await submitAllEvaluations(s.id);
    const waited = Date.now() - t0;
    expect(r).toEqual({ ok: false, error: "busy_retry" });
    expect(waited).toBeGreaterThanOrEqual(4500);
    expect(waited).toBeLessThan(7000);
    const still = await prisma.evaluation.findMany({ where: { sessionId: s.id, cupperId: cupper } });
    expect(still.every((e) => e.isDraft)).toBe(true);

    await release;
    const ok = await submitAllEvaluations(s.id);
    expect(ok.ok).toBe(true);
    const after = await prisma.evaluation.findMany({ where: { sessionId: s.id, cupperId: cupper } });
    expect(after.every((e) => !e.isDraft)).toBe(true);
  }, 40_000);
});

describe("isLockTimeoutError", () => {
  it("recognises the SQLSTATE wherever the driver puts it, and nothing else", () => {
    expect(isLockTimeoutError({ code: "55P03" })).toBe(true);
    expect(isLockTimeoutError({ code: "P2010", meta: { code: "55P03" } })).toBe(true);
    expect(isLockTimeoutError(new Error("canceling statement due to lock timeout"))).toBe(true);
    expect(isLockTimeoutError({ cause: { code: "55P03" } })).toBe(true);
    expect(isLockTimeoutError({ code: "40P01" })).toBe(false);
    expect(isLockTimeoutError(new Error("boom"))).toBe(false);
    expect(isLockTimeoutError(null)).toBe(false);
  });
});

// Holds the session row FOR UPDATE from a second connection for `ms`; resolves once released.
async function holdSessionRow(sessionId: string, ms: number): Promise<{ released: Promise<void> }> {
  const holder = await rawClient();
  await holder.query("BEGIN");
  await holder.query("SELECT id FROM cupping_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
  const released = new Promise<void>((resolve) =>
    setTimeout(async () => {
      await holder.query("ROLLBACK");
      await holder.end();
      resolve();
    }, ms),
  );
  return { released };
}

describe("S10 WP6b: a busy session row leaves nothing half written", () => {
  it("updateSampleMetadata (own coffee): busy_retry changes neither the coffee, the sample nor originEditedAt; the retry saves once", async () => {
    const owner = await makeUser({ name: "Dueña" });
    h.userId = owner;
    const coffee = await makeCoffee(owner, "Huila");
    const s = await makeSession({ ownerId: owner, samples: [{ coffeeId: coffee.id }] });
    const sample = s.samples[0];

    const hold = await holdSessionRow(s.id, 8000);
    const r = await updateSampleMetadata(sample.id, { label: "Nueva etiqueta", name: "Huila 2", country: "Perú" });
    expect(r).toEqual({ ok: false, error: "busy_retry" });

    const coffeeAfter = await prisma.coffee.findUniqueOrThrow({ where: { id: coffee.id } });
    expect(coffeeAfter.name).toBe("Huila");
    expect(coffeeAfter.country).toBe(coffee.country);
    expect(coffeeAfter.originEditedAt).toBeNull();
    const sampleAfter = await prisma.sessionSample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(sampleAfter.label).toBe(sample.label);

    await hold.released;
    const ok = await updateSampleMetadata(sample.id, { label: "Nueva etiqueta", name: "Huila 2", country: "Perú" });
    expect(ok).toEqual({ ok: true, coffeeUpdated: true });
    const saved = await prisma.coffee.findUniqueOrThrow({ where: { id: coffee.id } });
    expect(saved.name).toBe("Huila 2");
    expect(saved.country).toBe("Perú");
    expect(saved.originEditedAt).not.toBeNull();
    expect((await prisma.sessionSample.findUniqueOrThrow({ where: { id: sample.id } })).label).toBe("Nueva etiqueta");
  }, 40_000);

  it("updateSampleMetadata (implicit coffee create): busy_retry creates no coffee and links nothing; the retry creates one", async () => {
    const owner = await makeUser({ name: "Dueña" });
    h.userId = owner;
    const s = await makeSession({ ownerId: owner, samples: [{}] });
    const sample = s.samples[0];

    const hold = await holdSessionRow(s.id, 8000);
    const r = await updateSampleMetadata(sample.id, { label: "Con café", name: "Nuevo café" });
    expect(r).toEqual({ ok: false, error: "busy_retry" });
    expect(await prisma.coffee.count({ where: { createdBy: owner } })).toBe(0);
    const after = await prisma.sessionSample.findUniqueOrThrow({ where: { id: sample.id } });
    expect(after.coffeeId).toBeNull();
    expect(after.label).toBe(sample.label);

    await hold.released;
    const ok = await updateSampleMetadata(sample.id, { label: "Con café", name: "Nuevo café" });
    expect(ok).toEqual({ ok: true, coffeeUpdated: true });
    expect(await prisma.coffee.count({ where: { createdBy: owner } })).toBe(1);
    expect((await prisma.sessionSample.findUniqueOrThrow({ where: { id: sample.id } })).coffeeId).not.toBeNull();
  }, 40_000);

  it("a pinned reference save: busy_retry in about 5 s, nothing written; the retry saves", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const cupper = await makeUser({ name: "Catador" });
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, participants: [cupper], samples: [{}, {}] });
    const ref = s.samples[0];
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: ref.id } });
    await prisma.sessionSample.update({ where: { id: ref.id }, data: { referenceRank: 1 } });
    h.userId = cupper;
    const save = () =>
      upsertEvaluation({
        sessionSampleId: ref.id,
        sessionId: s.id,
        moduleKey: "affective",
        cupsPerSample: 2,
        data: pinReferenceAffective(affectiveData(7), 2),
        pinnedView: true,
        clientTs: Date.now(),
      });

    const hold = await holdSessionRow(s.id, 8000);
    const t0 = Date.now();
    const r = await save();
    const waited = Date.now() - t0;
    expect(r).toEqual({ ok: false, error: "busy_retry" });
    expect(waited).toBeGreaterThanOrEqual(4500);
    expect(waited).toBeLessThan(7000);
    expect(await prisma.evaluation.count({ where: { sessionSampleId: ref.id, cupperId: cupper } })).toBe(0);

    await hold.released;
    const ok = await save();
    expect(ok.ok).toBe(true);
    expect(await prisma.evaluation.count({ where: { sessionSampleId: ref.id, cupperId: cupper } })).toBe(1);
  }, 40_000);
});

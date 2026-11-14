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
import { isLockTimeoutError } from "@/lib/lockTimeout";
import { makeEvaluation, makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

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

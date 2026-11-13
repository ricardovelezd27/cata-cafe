// S10 WP5b review round 3: cuppers saving the pinned reference while the owner changes it.
// ONE lock order (lib/sessionLock.ts): the session row first. Real actions, real Prisma,
// real Postgres + trigger. Cuppers run in parallel (an AsyncLocalStorage carries the
// signed-in user per call), several rounds per case.
//   (i)   the owner removes the reference            (ii) the owner moves it to B
//   (iii) the owner deletes the active reference's sample
//   (iv)  two parallel FIRST saves of a pinned sample -> both ok, one row
// Asserted: nothing fails with a deadlock or `unknown`, the stored ratings are right for the
// final reference state, and the stored aggregate equals computeGroupAggregate.
import { AsyncLocalStorage } from "node:async_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const als = new AsyncLocalStorage<string>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        const id = als.getStore();
        return { data: { user: id ? { id, email: `${id}@example.test`, is_anonymous: false } : null }, error: null };
      },
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { removeSessionSample, setReferenceSample, upsertEvaluation } from "@/app/actions/sessions";
import { computeGroupAggregate } from "@/lib/scoring";
import { evaluationScoreRule } from "@/lib/scoreRule";
import { REF_STASH_KEY, pinReferenceAffective } from "@/lib/referenceRules";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(resetDb);

const as = <T>(id: string, fn: () => Promise<T>) => als.run(id, fn);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROUNDS = 4;
const SAVES = 8;

const pinnedModule = pinReferenceAffective(affectiveData(7), 2);

async function setup(withRows: boolean) {
  const owner = await makeUser({ name: "Dueña" });
  const cuppers: string[] = [];
  for (let i = 0; i < 5; i++) cuppers.push(await makeUser({ name: `Catador ${i}` }));
  const s = await makeSession({ ownerId: owner, isGroup: true, participants: cuppers, cupsPerSample: 2, samples: [{}, {}] });
  const [A, B] = s.samples;
  if (withRows) {
    // cuppers 0-2 have SUBMITTED 7s on A (updating a submitted row); 3-4 have no row (first saves)
    for (const c of cuppers.slice(0, 3)) {
      await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: c, cupsPerSample: 2, values: 7 });
    }
  }
  return { owner, cuppers, s, A, B };
}

/** Failures that are NOT an acceptable race outcome. */
function bad(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2034" || /deadlock|40P01|25P02|current transaction is aborted/i.test(msg)) return `deadlock/abort: ${msg}`;
  if (msg === "unknown") return "unknown";
  return null;
}

async function cupperLoop(s: { id: string }, sampleId: string, cupper: string, errors: string[]) {
  for (let i = 0; i < SAVES; i++) {
    try {
      const r = await as(cupper, () =>
        upsertEvaluation({
          sessionSampleId: sampleId,
          sessionId: s.id,
          moduleKey: "affective",
          cupsPerSample: 2,
          data: { ...pinnedModule, notas_generales: `n${i}` },
          pinnedView: true,
        }),
      );
      if (!r.ok) errors.push(`save refused: ${r.error}`);
    } catch (e) {
      // a sample deleted under the save is an acceptable outcome (case iii)
      const code = (e as { code?: string } | null)?.code;
      const msg = e instanceof Error ? e.message : "";
      if (msg === "not_found_or_forbidden" || code === "P2003") continue;
      const b = bad(e);
      errors.push(b ?? `unexpected: ${msg}`);
    }
  }
}

async function expectAggregateMatches(sampleId: string) {
  const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId, isDraft: false } });
  if (rows.length === 0) return;
  const expected = computeGroupAggregate(
    rows.map((r) => ({
      data: r.affectiveData as Record<string, unknown>,
      nonUniformCups: r.nonUniformCups,
      defectiveCups: r.defectiveCups,
      cups: r.cups ?? undefined,
      rule: evaluationScoreRule(r.cups, true),
    })),
    2,
  );
  const stored = await storedAggregate(sampleId);
  expect(Number(stored?.communityScore)).toBeCloseTo(Number(expected.communityScore), 2);
}

const ratingOf = async (sampleId: string, cupperId: string) => {
  const r = await prisma.evaluation.findUniqueOrThrow({
    where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId } },
  });
  return r.affectiveData as Record<string, unknown>;
};

describe("a reference change racing the cuppers' saves", () => {
  it(
    "(i) the owner removes the reference",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        await resetDb();
        const { owner, cuppers, s, A } = await setup(true);
        await as(owner, () => setReferenceSample(s.id, A.id, true));
        const errors: string[] = [];
        const ownerRun = (async () => {
          await sleep(15);
          const r = await as(owner, () => setReferenceSample(s.id, null, true));
          if (!r.ok) errors.push(`owner: ${r.error}`);
        })();
        await Promise.all([ownerRun, ...cuppers.map((c) => cupperLoop(s, A.id, c, errors))]);
        expect(errors).toEqual([]);
        const sess = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
        expect(sess.referenceSampleId).toBeNull();
        for (const c of cuppers.slice(0, 3)) {
          const d = await ratingOf(A.id, c);
          expect(d.fragancia_af_final).toBe(7);
          expect(d[REF_STASH_KEY]).toBeUndefined();
        }
        await expectAggregateMatches(A.id);
      }
    },
    120_000,
  );

  it(
    "(ii) the owner moves the reference to B with saves in flight",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        await resetDb();
        const { owner, cuppers, s, A, B } = await setup(true);
        await as(owner, () => setReferenceSample(s.id, A.id, true));
        const errors: string[] = [];
        const ownerRun = (async () => {
          await sleep(15);
          const r = await as(owner, () => setReferenceSample(s.id, B.id, true));
          if (!r.ok) errors.push(`owner: ${r.error}`);
        })();
        await Promise.all([ownerRun, ...cuppers.map((c) => cupperLoop(s, A.id, c, errors))]);
        expect(errors).toEqual([]);
        const sess = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
        expect(sess.referenceSampleId).toBe(B.id);
        // A is an earlier, unlocked reference: the ratings the cuppers gave are back, never the stale 5s
        for (const c of cuppers.slice(0, 3)) {
          const d = await ratingOf(A.id, c);
          expect(d.fragancia_af_final).toBe(7);
          expect(d[REF_STASH_KEY]).toBeUndefined();
        }
        await expectAggregateMatches(A.id);
      }
    },
    120_000,
  );

  it(
    "(iii) the owner deletes the active reference's sample (first saves racing the delete)",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        await resetDb();
        const { owner, cuppers, s, A } = await setup(false);
        await as(owner, () => setReferenceSample(s.id, A.id, true));
        const errors: string[] = [];
        let ownerResult: string | null = null;
        const ownerRun = (async () => {
          await sleep(10);
          try {
            const r = await as(owner, () => removeSessionSample(A.id));
            ownerResult = r.ok ? "ok" : (r as { error: string }).error;
          } catch (e) {
            errors.push(`owner threw: ${bad(e) ?? (e instanceof Error ? e.message : String(e))}`);
          }
        })();
        await Promise.all([ownerRun, ...cuppers.map((c) => cupperLoop(s, A.id, c, errors))]);
        expect(errors).toEqual([]);
        // either the delete won (no evaluation yet) or the owner was refused because one landed first
        expect(["ok", "sample_has_evaluations"]).toContain(ownerResult);
        const remaining = await prisma.sessionSample.count({ where: { id: A.id } });
        expect(remaining).toBe(ownerResult === "ok" ? 0 : 1);
        if (remaining === 1) await expectAggregateMatches(A.id);
      }
    },
    120_000,
  );

  it("(iv) two parallel FIRST saves of a pinned sample: both ok, one row", async () => {
    const { owner, cuppers, s, A } = await setup(false);
    await as(owner, () => setReferenceSample(s.id, A.id, true));
    const save = () =>
      as(cuppers[0], () =>
        upsertEvaluation({
          sessionSampleId: A.id,
          sessionId: s.id,
          moduleKey: "affective",
          cupsPerSample: 2,
          data: affectiveData(8),
        }),
      );
    const results = await Promise.all([save(), save(), save()]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await prisma.evaluation.count({ where: { sessionSampleId: A.id, cupperId: cuppers[0] } })).toBe(1);
    const d = await ratingOf(A.id, cuppers[0]);
    expect(d.fragancia_af_final).toBe(5);
  });
});

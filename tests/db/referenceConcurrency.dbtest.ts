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

import {
  removeSessionSample,
  renameSessionSample,
  setReferenceSample,
  updateSampleMetadata,
  upsertEvaluation,
} from "@/app/actions/sessions";
import {
  finishSoloSession,
  refreshAggregateScores,
  revealSample,
  submitAllEvaluations,
} from "@/app/actions/community";
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
          // the real client's path: an ordered write (lib/evaluationWrite.ts)
          clientTs: Date.now() + i,
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

// ─── S10 WP6 part D: the lock-order follow-ups (third review of #136) ────────────────────
// Deterministic interleaves: a TEST-ONLY trigger sleeps inside the statement that holds the
// first lock, so the other transaction starts in the middle of it. Without the lock order
// the two transactions wait on each other and Postgres aborts one (40P01, ~1 s).
const SLEEP_MS = 700;

async function withSleepTrigger(
  table: "evaluations" | "session_samples",
  timing: "BEFORE" | "AFTER",
  op: "INSERT" | "UPDATE" | "DELETE",
  when: string,
  fn: () => Promise<void>,
) {
  const name = `aa_test_sleep_${table}`;
  await prisma.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION public.aa_test_sleep() RETURNS trigger LANGUAGE plpgsql AS
     $f$ BEGIN PERFORM pg_sleep(${SLEEP_MS / 1000});
       IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $f$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER ${name} ${timing} ${op} ON public.${table} FOR EACH ROW WHEN (${when})
     EXECUTE FUNCTION public.aa_test_sleep()`,
  );
  try {
    await fn();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON public.${table}`);
  }
}

type Outcome = { ok: boolean; error?: string };
const outcome = async (fn: () => Promise<unknown>): Promise<Outcome> => {
  try {
    const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
    if (r && typeof r === "object" && "ok" in r && r.ok === false) return { ok: false, error: r.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: bad(e) ?? (e instanceof Error ? e.message : String(e)) };
  }
};
const NOT_A_RACE_LOSS = (o: Outcome) => !o.error || !/deadlock|abort|unknown/i.test(o.error);

describe("lock order: session row first (S10 WP6 D)", () => {
  it(
    "D1 (a) 'Enviar' of an unsubmitted sample while the owner names it the reference (deterministic)",
    async () => {
      const { owner, cuppers, s, B } = await setup(false);
      await makeEvaluation({
        sampleId: B.id, sessionId: s.id, cupperId: cuppers[0], cupsPerSample: 2, values: 7, draft: true,
      });
      let submit: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      await withSleepTrigger(
        "evaluations", "AFTER", "UPDATE", `OLD."isDraft" = true AND NEW."isDraft" = false`,
        async () => {
          const a = as(cuppers[0], () => outcome(() => submitAllEvaluations(s.id))).then((r) => (submit = r));
          await sleep(200);
          const b = as(owner, () => outcome(() => setReferenceSample(s.id, B.id, true))).then((r) => (setRef = r));
          await Promise.all([a, b]);
        },
      );
      expect(submit).toEqual({ ok: true });
      expect(setRef).toEqual({ ok: true });
      const sess = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
      expect(sess.referenceSampleId).toBe(B.id);
      const row = await prisma.evaluation.findUniqueOrThrow({
        where: { sessionSampleId_cupperId: { sessionSampleId: B.id, cupperId: cuppers[0] } },
      });
      expect(row.isDraft).toBe(false);
      await expectAggregateMatches(B.id);
    },
    60_000,
  );

  it(
    "D1 (b) 'Terminar cata' (solo) racing a reference change (deterministic)",
    async () => {
      const owner = await makeUser({ name: "Solo" });
      const s = await makeSession({ ownerId: owner, isGroup: false, cupsPerSample: 2, samples: [{}, {}] });
      const [A, B] = s.samples;
      for (const x of [A, B]) {
        await makeEvaluation({
          sampleId: x.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 7, draft: true,
          nonUniform: [false, false], defective: [false, false],
        });
      }
      let fin: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      await withSleepTrigger(
        "evaluations", "AFTER", "UPDATE", `OLD."isDraft" = true AND NEW."isDraft" = false`,
        async () => {
          const a = as(owner, () => outcome(() => finishSoloSession(s.id))).then((r) => (fin = r));
          await sleep(200);
          const b = as(owner, () => outcome(() => setReferenceSample(s.id, B.id, true))).then((r) => (setRef = r));
          await Promise.all([a, b]);
        },
      );
      expect(NOT_A_RACE_LOSS(fin)).toBe(true);
      expect(NOT_A_RACE_LOSS(setRef)).toBe(true);
      expect(fin).toEqual({ ok: true });
    },
    60_000,
  );

  it(
    "D1 (c) plain parallel run: submits racing the owner naming the reference, no failure",
    async () => {
      for (let round = 0; round < 3; round++) {
        await resetDb();
        const { owner, cuppers, s, B } = await setup(false);
        for (const c of cuppers) {
          await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: c, cupsPerSample: 2, values: 7, draft: true });
        }
        const results = await Promise.all([
          ...cuppers.map((c) => as(c, () => outcome(() => submitAllEvaluations(s.id)))),
          (async () => {
            await sleep(5);
            return as(owner, () => outcome(() => setReferenceSample(s.id, B.id, true)));
          })(),
        ]);
        expect(results.filter((r) => !r.ok)).toEqual([]);
        await expectAggregateMatches(B.id);
      }
    },
    120_000,
  );

  it.each([
    ["renameSessionSample", (id: string) => renameSessionSample(id, "Otro nombre")],
    ["updateSampleMetadata", (id: string) => updateSampleMetadata(id, { label: "Otro nombre" })],
  ])(
    "D2 %s racing a reference change (deterministic)",
    async (_name, act) => {
      const { owner, s, A } = await setup(false);
      let first: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      await withSleepTrigger(
        "session_samples", "BEFORE", "UPDATE", `OLD.label IS DISTINCT FROM NEW.label`,
        async () => {
          const a = as(owner, () => outcome(() => act(A.id))).then((r) => (first = r));
          await sleep(200);
          const b = as(owner, () => outcome(() => setReferenceSample(s.id, A.id, true))).then((r) => (setRef = r));
          await Promise.all([a, b]);
        },
      );
      expect(first).toEqual({ ok: true });
      expect(setRef).toEqual({ ok: true });
    },
    60_000,
  );

  it(
    "D2 revealSample racing a reference change (deterministic)",
    async () => {
      const { owner, s, B } = await setup(false);
      await as(owner, () => setReferenceSample(s.id, B.id, true));
      const [A] = s.samples;
      let first: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      await withSleepTrigger(
        "session_samples", "BEFORE", "UPDATE", `OLD.revealed = false AND NEW.revealed = true`,
        async () => {
          const a = as(owner, () => outcome(() => revealSample(A.id))).then((r) => (first = r));
          await sleep(200);
          // A takes rank 2 and becomes the active reference: a key update of A's row
          const b = as(owner, () => outcome(() => setReferenceSample(s.id, A.id, true))).then((r) => (setRef = r));
          await Promise.all([a, b]);
        },
      );
      expect(first).toEqual({ ok: true });
      // either order is fine; what must never happen is a deadlock or an `unknown`
      expect(NOT_A_RACE_LOSS(setRef)).toBe(true);
    },
    60_000,
  );

  it(
    "D2 the aggregate refire racing a reference change (deterministic)",
    async () => {
      const { owner, s, A } = await setup(true);
      // no aggregate row yet: the re-fire's trigger INSERTS it (FK key-share on the sample row)
      await prisma.aggregateScore.deleteMany({ where: { sessionSampleId: A.id } });
      let refire: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      await withSleepTrigger(
        "evaluations", "AFTER", "UPDATE", `NEW."isDraft" = false`,
        async () => {
          const a = as(owner, () => outcome(() => refreshAggregateScores(s.id))).then((r) => (refire = r));
          await sleep(200);
          const b = as(owner, () => outcome(() => setReferenceSample(s.id, A.id, true))).then((r) => (setRef = r));
          await Promise.all([a, b]);
        },
      );
      expect(refire).toEqual({ ok: true });
      expect(setRef).toEqual({ ok: true });
    },
    60_000,
  );

  it(
    "D3 removing a sample (holds the sample, then needs the session pointer) vs a pinned FIRST save (holds the session, then needs the sample) (deterministic)",
    async () => {
      const { owner, cuppers, s, A } = await setup(false);
      await as(owner, () => setReferenceSample(s.id, A.id, true));
      let save: Outcome = { ok: false };
      let removed: Outcome = { ok: false };
      await withSleepTrigger("evaluations", "BEFORE", "INSERT", "true", async () => {
        const a = as(cuppers[0], () =>
          outcome(() =>
            upsertEvaluation({
              sessionSampleId: A.id, sessionId: s.id, moduleKey: "affective", cupsPerSample: 2,
              data: affectiveData(8), clientTs: Date.now(),
            }),
          ),
        ).then((r) => (save = r));
        await sleep(200);
        const b = as(owner, () => outcome(() => removeSessionSample(A.id))).then((r) => (removed = r));
        await Promise.all([a, b]);
      });
      expect(save).toEqual({ ok: true });
      // the save landed first: the removal is refused cleanly
      expect(removed).toEqual({ ok: false, error: "sample_has_evaluations" });
    },
    60_000,
  );

  it(
    "D3 solo 'Terminar cata' removing an unscored sample (removeSamplesInTx alone) while another tab names that sample the reference (deterministic)",
    async () => {
      const owner = await makeUser({ name: "Solo" });
      const s = await makeSession({ ownerId: owner, isGroup: false, cupsPerSample: 2, samples: [{}, {}] });
      const [A, C] = s.samples;
      await makeEvaluation({
        sampleId: A.id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 7, draft: true,
        nonUniform: [false, false], defective: [false, false],
      });
      let fin: Outcome = { ok: false };
      let setRef: Outcome = { ok: false };
      // the delete of C holds C while it sleeps; naming C the reference needs C's row (rank key)
      await withSleepTrigger("session_samples", "BEFORE", "DELETE", "true", async () => {
        const a = as(owner, () => outcome(() => finishSoloSession(s.id))).then((r) => (fin = r));
        await sleep(300);
        const b = as(owner, () => outcome(() => setReferenceSample(s.id, C.id, true))).then((r) => (setRef = r));
        await Promise.all([a, b]);
      });
      expect(fin).toEqual({ ok: true });
      // C was removed (or named first); a clean refusal is fine, a deadlock or `unknown` is not
      expect(NOT_A_RACE_LOSS(setRef)).toBe(true);
    },
    60_000,
  );
});

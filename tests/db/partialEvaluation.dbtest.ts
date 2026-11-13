// S10 WP3b (Kim C4 "no evaluado", A5 "as it cooled"): partial evaluations against Postgres, with the real
// trigger and the real helper of PHASE 29. TODO(kim-validar:C4) TODO(kim-validar:A5)
//  - the SQL helper agrees with isAffectiveDeclaredPartial on a truth table and on random blobs;
//  - complete + partial at 2 and 5 cups: the total is the complete ones only, the attribute averages use
//    each attribute's own denominator, and computeGroupAggregate equals the stored row;
//  - an old-style incomplete row with no marker changes nothing;
//  - a partial evaluation submitted through the real actions: NULL scores, the aggregate row, a history row
//    with a NULL individual score, and a solo session still auto-closes.
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
import { upsertEvaluation } from "@/app/actions/sessions";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";
import { computeGroupAggregate, type GroupEvalInput } from "@/lib/scoring";
import {
  affectiveData,
  makeEvaluation,
  makeSession,
  makeUser,
  prisma,
  rawClient,
  resetDb,
  storedAggregate,
} from "./support/db";

beforeEach(resetDb);

const IDS = AFFECTIVE_ATTRIBUTES.map((a) => a.id);
const marked = (base: Record<string, unknown>, ...ids: string[]) => {
  const out = { ...base };
  for (const id of ids) {
    delete out[`${id}_final`];
    out[`${id}_ne`] = true;
  }
  return out;
};

describe("is_affective_declared_partial (SQL) == isAffectiveDeclaredPartial (TS)", () => {
  async function sqlSays(blobs: (Record<string, unknown> | null)[]): Promise<boolean[]> {
    const c = await rawClient();
    try {
      const out: boolean[] = [];
      for (const b of blobs) {
        const r = await c.query("SELECT public.is_affective_declared_partial($1::jsonb) AS v", [b === null ? null : JSON.stringify(b)]);
        out.push(r.rows[0].v as boolean);
      }
      return out;
    } finally {
      await c.end();
    }
  }

  it("truth table", async () => {
    const all = affectiveData(6);
    const cases: [Record<string, unknown> | null, boolean][] = [
      [all, false],
      [marked(all, "impresion_global"), true],
      [(() => { const d = { ...all }; delete d["impresion_global_final"]; return d; })(), false],
      [marked(all, ...IDS.slice(1)), true],
      [marked(all, ...IDS), false],
      [{ ...(() => { const d = { ...all }; delete d["impresion_global_final"]; return d; })(), impresion_global_ne: "true" }, false],
      [{}, false],
      [null, false],
      // an old odd row: a non-numeric rating is "not rated" and must never raise (reviewer round)
      ...(["abc", true, "7", "NaN", null, {}, [1]] as unknown[]).map(
        (odd) => [{ ...marked(all, "impresion_global"), aroma_af_final: odd }, false] as [Record<string, unknown>, boolean],
      ),
    ];
    const sql = await sqlSays(cases.map(([b]) => b));
    expect(sql).toEqual(cases.map(([, want]) => want));
    for (const [b, want] of cases) expect(isAffectiveDeclaredPartial(b), JSON.stringify(b)).toBe(want);
  });

  it("random blobs: the two agree (including the bare-key fallback)", async () => {
    let s = 99;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const blobs: Record<string, unknown>[] = [];
    for (let n = 0; n < 150; n++) {
      const d: Record<string, unknown> = {};
      for (const id of IDS) {
        const r = rnd();
        if (r < 0.15) d[`${id}_ne`] = true;
        else if (r < 0.2) d[`${id}_ne`] = r < 0.17 ? "true" : false;
        else if (r < 0.28) d[id] = 1 + Math.floor(rnd() * 9);
        else if (r < 0.35) continue;
        else d[`${id}_final`] = 1 + Math.floor(rnd() * 9);
      }
      blobs.push(d);
    }
    const sql = await sqlSays(blobs);
    blobs.forEach((b, i) => expect(sql[i], JSON.stringify(b)).toBe(isAffectiveDeclaredPartial(b)));
  });
});

describe("trigger: partial evaluations feed the attribute averages, never the total", () => {
  async function build(cups: number, extra: (ids: { sessionId: string; sampleId: string; cuppers: string[] }) => Promise<void>) {
    const owner = await makeUser();
    const u1 = await makeUser();
    const u2 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: cups, participants: [u1, u2], samples: [{}] });
    const sampleId = s.samples[0].id;
    await extra({ sessionId: s.id, sampleId, cuppers: [owner, u1, u2] });
    return { sampleId, owner, u1, u2, sessionId: s.id };
  }

  for (const cups of [2, 5]) {
    it(`${cups} cups: total = the complete ones only; per-attribute denominators; TS equals the trigger`, async () => {
      const { sampleId } = await build(cups, async ({ sessionId, sampleId, cuppers }) => {
        // complete (one flagged cup, so the deduction is visible) + a partial that ALSO flags every cup
        await makeEvaluation({
          sampleId, sessionId, cupperId: cuppers[0], cupsPerSample: cups, values: 6,
          nonUniform: [true, ...Array<boolean>(cups - 1).fill(false)],
        });
        await makeEvaluation({
          sampleId, sessionId, cupperId: cuppers[1], cupsPerSample: cups,
          data: marked(affectiveData(8), "sabor_af", "acidez_af"),
          nonUniform: Array<boolean>(cups).fill(true),
          defective: Array<boolean>(cups).fill(true),
        });
      });
      const agg = await storedAggregate(sampleId);
      const rows = await prisma.evaluation.findMany({ where: { sessionSampleId: sampleId }, orderBy: { cupperId: "asc" } });
      const partial = rows.find((r) => r.rawScore === null)!;
      expect(partial.individualScore).toBeNull();
      expect(partial.affectiveSum).toBeNull();

      // The total is what the complete evaluation alone gives.
      expect(agg?.participantCount).toBe(1);
      expect(agg?.submittedCount).toBe(2);
      expect(agg?.totalCups).toBe(cups);
      expect(agg?.totalNonUniform).toBe(1);
      expect(agg?.totalDefective).toBe(0);
      const attrs = agg?.attrAverages as Record<string, number>;
      expect(attrs["Fragancia"]).toBe(7); // (6 + 8) / 2
      expect(attrs["Sabor"]).toBe(6); // only the complete one rated it
      expect(attrs["Acidez"]).toBe(6);

      const evals: GroupEvalInput[] = rows.map((r) => ({
        data: r.affectiveData as Record<string, unknown>,
        nonUniformCups: r.nonUniformCups,
        defectiveCups: r.defectiveCups,
        cups: r.cups ?? undefined,
      }));
      const ts = computeGroupAggregate(evals, cups);
      expect(ts.communityScore).toBe(agg?.communityScore);
      expect(ts.avgRawScore).toBeCloseTo(agg?.avgRawScore ?? NaN, 6);
      expect(ts.included).toBe(agg?.participantCount);
      expect(ts.totalCups).toBe(agg?.totalCups);
      expect(ts.uniformityPenalty).toBeCloseTo(agg?.uniformityPenalty ?? NaN, 9);
      for (const a of AFFECTIVE_ATTRIBUTES) expect(ts.attrAverages[a.label], a.label).toBe(attrs[a.label]);
    });
  }

  it("an old-style incomplete evaluation with NO marker changes nothing", async () => {
    const { sampleId, u2, sessionId } = await build(2, async ({ sessionId, sampleId, cuppers }) => {
      await makeEvaluation({ sampleId, sessionId, cupperId: cuppers[0], cupsPerSample: 2, values: 6 });
      await makeEvaluation({ sampleId, sessionId, cupperId: cuppers[1], cupsPerSample: 2, data: marked(affectiveData(8), "sabor_af") });
    });
    const before = await storedAggregate(sampleId);
    const old = affectiveData(2);
    delete old["impresion_global_final"];
    await makeEvaluation({ sampleId, sessionId, cupperId: u2, cupsPerSample: 2, data: old });
    const after = await storedAggregate(sampleId);
    expect(after?.participantCount).toBe(before?.participantCount);
    expect(after?.communityScore).toBe(before?.communityScore);
    expect(after?.avgRawScore).toBe(before?.avgRawScore);
    expect(after?.attrAverages).toEqual(before?.attrAverages);
    expect(after?.submittedCount).toBe((before?.submittedCount ?? 0) + 1);
  });

  it("an OLD submitted row holding a non-numeric rating never blocks a later submit on the sample (PHASE 29 helper cannot raise)", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, participants: [u1], samples: [{}] });
    const sampleId = s.samples[0].id;
    // As an older app version could have stored it: no fragancia (so is_affective_complete stops before the odd
    // key, as it did under PHASE 26), then a string and a JSON true where numbers belong.
    const odd = { aroma_af_final: "abc", sabor_af_final: true, acidez_af_final: "7", dulzor_af_final: "NaN" };
    await makeEvaluation({
      sampleId, sessionId: s.id, cupperId: owner, cupsPerSample: 2, values: 6,
      overrides: { affectiveData: odd, cups: null },
    });
    // a new submit on the same sample: the trigger reads the odd row and must not raise
    await makeEvaluation({ sampleId, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 6 });
    const agg = await storedAggregate(sampleId);
    expect(agg?.participantCount).toBe(1);
    expect(agg?.submittedCount).toBe(2);
    expect(agg?.communityScore).toBeGreaterThan(0);
  });

  it("a sample with only a partial: no included evaluation, averages for what it rated", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 2, samples: [{}] });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, cupsPerSample: 2, data: marked(affectiveData(7), "dulzor_af") });
    const agg = await storedAggregate(s.samples[0].id);
    expect(agg?.participantCount).toBe(0);
    expect(agg?.submittedCount).toBe(1);
    const attrs = agg?.attrAverages as Record<string, number | null>;
    expect(attrs["Fragancia"]).toBe(7);
    expect(attrs["Dulzor"]).toBeNull();
  });
});

describe("a partial evaluation through the real actions", () => {
  it("stores NULL scores, writes the aggregate and a history row without a score, and a solo session still auto-closes", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const coffee = await prisma.coffee.create({ data: { name: "Huila", createdBy: owner, country: "Colombia", visibility: "private" } });
    const s = await makeSession({
      ownerId: owner,
      isGroup: false,
      cupsPerSample: 2,
      samples: [{ label: "A", coffeeId: coffee.id }, { label: "B" }],
    });
    const [A, B] = s.samples;
    h.userId = owner;

    // A: a declared partial with a cooled value; B: a complete evaluation.
    const partialData = { ...marked(affectiveData(7), "aroma_af"), dulzor_af_final: 8, dulzor_af_inicial: 6 };
    const r1 = await upsertEvaluation({ sessionSampleId: A.id, sessionId: s.id, moduleKey: "affective", data: partialData, cupsPerSample: 2 });
    const r2 = await upsertEvaluation({ sessionSampleId: B.id, sessionId: s.id, moduleKey: "affective", data: affectiveData(6), cupsPerSample: 2 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const draft = await prisma.evaluation.findUniqueOrThrow({ where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } } });
    expect(draft.isDraft).toBe(true);
    expect(draft.rawScore).toBeNull();
    expect(draft.individualScore).toBeNull();
    const stored = draft.affectiveData as Record<string, unknown>;
    expect(stored["aroma_af_ne"]).toBe(true);
    expect("aroma_af_final" in stored).toBe(false);
    expect(stored["dulzor_af_inicial"]).toBe(6);
    expect(stored["dulzor_af_final"]).toBe(8);

    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);

    const submitted = await prisma.evaluation.findUniqueOrThrow({ where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } } });
    expect(submitted.isDraft).toBe(false);
    expect(submitted.individualScore).toBeNull();
    const aggA = await storedAggregate(A.id);
    expect(aggA?.participantCount).toBe(0);
    expect(aggA?.submittedCount).toBe(1);
    expect((aggA?.attrAverages as Record<string, number | null>)["Fragancia"]).toBe(7);
    expect((aggA?.attrAverages as Record<string, number | null>)["Aroma"]).toBeNull();

    // every sample is finished: the solo session closed through the one close routine
    const session = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(session.status).toBe("closed");

    // the coffee-linked sample was revealed and its history row carries no individual score
    const history = await prisma.userCoffeeHistory.findMany({ where: { userId: owner, coffeeId: coffee.id } });
    expect(history).toHaveLength(1);
    expect(history[0].individualScore).toBeNull();
  });
});

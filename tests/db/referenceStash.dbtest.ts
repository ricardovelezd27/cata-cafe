// S10 WP5b (B2, TODO(kim-validar:B2)): marking a sample as the reference never
// destroys a cupper's ratings. Real actions, real Prisma, real Postgres and the
// real aggregate trigger; only the cookie (Supabase server client) and Next's
// cache hook are mocked.
//   cupper rates 7s -> owner marks the sample as reference (stored 5s, 79.00,
//   stash present) -> the cupper's page saves the pinned module (stash still
//   present, a tampered ref_previo is ignored) -> owner removes the reference
//   (7s are back, score recomputed, stash gone, aggregate re-fired).
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookie: { user: { id: string; email: string | null; is_anonymous: boolean } | null } = { user: null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookie.user }, error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { setReferenceSample, upsertEvaluation } from "@/app/actions/sessions";
import { replayEvaluation } from "@/app/actions/offline";
import { submitAllEvaluations } from "@/app/actions/community";
import { calcIndividualScore } from "@/lib/scoring";
import { REF_STASH_KEY, pinReferenceAffective } from "@/lib/referenceRules";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(async () => {
  await resetDb();
  cookie.user = null;
});

const as = (id: string) => {
  cookie.user = { id, email: `${id}@example.test`, is_anonymous: false };
};

async function row(sampleId: string, cupperId: string) {
  return prisma.evaluation.findUniqueOrThrow({
    where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId } },
  });
}
const data = (r: { affectiveData: unknown }) => r.affectiveData as Record<string, unknown>;
const stashOf = (r: { affectiveData: unknown }) =>
  data(r)[REF_STASH_KEY] as { at: string; valores: Record<string, unknown> } | undefined;

async function setup(opts: { mode?: "anchor" | "free"; samples?: number } = {}) {
  const owner = await makeUser({ name: "Dueña" });
  const u1 = await makeUser({ name: "Uno" });
  const u2 = await makeUser({ name: "Dos" });
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    participants: [u1, u2],
    cupsPerSample: 2,
    samples: Array.from({ length: opts.samples ?? 2 }, () => ({})),
  });
  if (opts.mode === "free") {
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceMode: "free" } });
  }
  const [A, B] = s.samples;
  // u1: SUBMITTED 7s with a flagged cup; u2: a DRAFT with 6s. The owner rated nothing.
  await makeEvaluation({
    sampleId: A.id,
    sessionId: s.id,
    cupperId: u1,
    cupsPerSample: 2,
    values: 7,
    nonUniform: [true, false],
    defective: [false, false],
  });
  await makeEvaluation({
    sampleId: A.id,
    sessionId: s.id,
    cupperId: u2,
    cupsPerSample: 2,
    values: 6,
    draft: true,
  });
  return { owner, u1, u2, s, A, B };
}

describe("B2: the pin keeps the ratings, the unpin gives them back", () => {
  it("full cycle: pin (stash) -> the cupper's page saves -> remove the reference (restored, re-fired)", async () => {
    const { owner, u1, u2, s, A } = await setup();
    const beforeScore = (await row(A.id, u1)).individualScore;
    expect(beforeScore).not.toBe(79);
    const aggBefore = await storedAggregate(A.id);

    // 1. owner marks A as the reference (confirmation accepted)
    as(owner);
    const pinRes = await setReferenceSample(s.id, A.id, true);
    expect(pinRes.ok).toBe(true);
    const pinned = await row(A.id, u1);
    expect(data(pinned).fragancia_af_final).toBe(5);
    expect(pinned.individualScore).toBe(79);
    expect(stashOf(pinned)?.valores.fragancia_af_final).toBe(7);
    expect(stashOf(pinned)?.valores.tazas_no_uniformes).toEqual([true, false]);
    expect(stashOf(await row(A.id, u2))?.valores.fragancia_af_final).toBe(6);
    // the submitted row re-fired the aggregate: the group score now sits on the anchor
    const aggPinned = await storedAggregate(A.id);
    expect(aggPinned?.computedAt.getTime()).toBeGreaterThanOrEqual(aggBefore!.computedAt.getTime());
    expect(Number(aggPinned?.communityScore)).toBe(79);

    // 2. the cupper's own page autosaves the pinned module: the stash survives, a tampered one is ignored
    as(u1);
    const tamper = {
      ...pinReferenceAffective(data(pinned), 2),
      [REF_STASH_KEY]: { at: "2000-01-01T00:00:00.000Z", valores: { fragancia_af_final: 1 } },
    };
    const saved = await upsertEvaluation({
      sessionSampleId: A.id,
      sessionId: s.id,
      moduleKey: "affective",
      cupsPerSample: 2,
      data: tamper,
    });
    expect(saved.ok).toBe(true);
    const afterSave = await row(A.id, u1);
    expect(stashOf(afterSave)).toEqual(stashOf(pinned));
    expect(afterSave.individualScore).toBe(79);

    // 2b. the same through the offline replay (a blob that does not know the stash)
    const replay = await replayEvaluation({
      sessionSampleId: A.id,
      sessionId: s.id,
      moduleKey: "affective",
      cupsPerSample: 2,
      data: affectiveData(9),
    } as Parameters<typeof replayEvaluation>[0]);
    expect(replay.status).toBe("synced");
    const afterReplay = await row(A.id, u1);
    expect(stashOf(afterReplay)).toEqual(stashOf(pinned));
    expect(data(afterReplay).fragancia_af_final).toBe(5);

    // 3. the owner removes the reference: the 7s are back
    as(owner);
    const unpin = await setReferenceSample(s.id, null);
    expect(unpin.ok).toBe(true);
    if (unpin.ok) expect(unpin.data.restored).toBe(2);
    const back = await row(A.id, u1);
    expect(data(back).fragancia_af_final).toBe(7);
    expect(data(back).tazas_no_uniformes).toEqual([true, false]);
    expect(stashOf(back)).toBeUndefined();
    expect(back.individualScore).toBe(calcIndividualScore(data(back), 2));
    expect(back.individualScore).not.toBe(79);
    expect(data(await row(A.id, u2)).fragancia_af_final).toBe(6);
    expect(stashOf(await row(A.id, u2))).toBeUndefined();
    // the submitted evaluation re-fired the aggregate with the restored values
    const aggBack = await storedAggregate(A.id);
    expect(Number(aggBack?.communityScore)).not.toBe(79);
    expect(Number(aggBack?.communityScore)).toBeCloseTo(Number(back.individualScore), 1);
  });

  it("marking ANOTHER sample unlocks the first: its ratings come back; the new one is pinned and stashed", async () => {
    const { owner, u1, s, A, B } = await setup();
    // u1 also rated B (submitted 8s)
    await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 8 });
    as(owner);
    expect((await setReferenceSample(s.id, A.id, true)).ok).toBe(true);
    expect(data(await row(A.id, u1)).fragancia_af_final).toBe(5);

    const second = await setReferenceSample(s.id, B.id, true);
    expect(second.ok).toBe(true);
    // A is an earlier, unlocked reference: restored
    const a = await row(A.id, u1);
    expect(data(a).fragancia_af_final).toBe(7);
    expect(stashOf(a)).toBeUndefined();
    // B is the active pinned reference with its own stash
    const b = await row(B.id, u1);
    expect(data(b).fragancia_af_final).toBe(5);
    expect(stashOf(b)?.valores.fragancia_af_final).toBe(8);

    // removing the active reference (B) gives B's 8s back and re-pins A (earlier reference):
    // A's rows are not at the anchor, so the owner must confirm; the new stash keeps the 7s
    expect((await setReferenceSample(s.id, null)).ok).toBe(false);
    expect((await setReferenceSample(s.id, null, true)).ok).toBe(true);
    expect(data(await row(B.id, u1)).fragancia_af_final).toBe(8);
    expect(stashOf(await row(B.id, u1))).toBeUndefined();
    const a2 = await row(A.id, u1);
    expect(data(a2).fragancia_af_final).toBe(5);
    expect(stashOf(a2)?.valores.fragancia_af_final).toBe(7);
  });

  it("a cupper who re-rated after the unlock keeps the new values and just loses the stash", async () => {
    const { owner, u2, s, A, B } = await setup();
    as(owner);
    await setReferenceSample(s.id, A.id, true);
    await setReferenceSample(s.id, B.id, true); // A unlocked, restored: u2's draft is 6s again
    expect(data(await row(A.id, u2)).fragancia_af_final).toBe(6);
    // pin A again, then unlock again, with u2 editing in between (not allowed while pinned,
    // so simulate the stale-edit case: the stored row drifted off the anchor)
    await setReferenceSample(s.id, B.id, true); // noop
    await setReferenceSample(s.id, null, true); // B removed, A active again (re-pin)
    expect(stashOf(await row(A.id, u2))?.valores.fragancia_af_final).toBe(6);
    await prisma.evaluation.update({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u2 } },
      data: { affectiveData: { ...data(await row(A.id, u2)), fragancia_af_final: 8 } },
    });
    await setReferenceSample(s.id, null, true); // A removed
    const after = await row(A.id, u2);
    expect(data(after).fragancia_af_final).toBe(8);
    expect(stashOf(after)).toBeUndefined();
  });

  it("submitting a pre-deploy draft of the reference carries the stash (legacy draft rewrite)", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, cupsPerSample: 2, samples: [{}] });
    const A = s.samples[0];
    await makeEvaluation({
      sampleId: A.id,
      sessionId: s.id,
      cupperId: owner,
      cupsPerSample: 2,
      values: 7,
      draft: true,
      overrides: { cups: null },
    });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: A.id } });
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    as(owner);
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);
    const ev = await row(A.id, owner);
    expect(ev.isDraft).toBe(false);
    expect(data(ev).fragancia_af_final).toBe(5);
    expect(stashOf(ev)?.valores.fragancia_af_final).toBe(7);
  });

  it("free mode: nothing is pinned, nothing is stashed, nothing is rewritten", async () => {
    const { owner, u1, s, A } = await setup({ mode: "free" });
    const before = await row(A.id, u1);
    as(owner);
    expect((await setReferenceSample(s.id, A.id)).ok).toBe(true);
    const after = await row(A.id, u1);
    expect(data(after)).toEqual(data(before));
    expect(stashOf(after)).toBeUndefined();
    // the cupper's own save keeps 7s and a tampered stash never lands
    as(u1);
    await upsertEvaluation({
      sessionSampleId: A.id,
      sessionId: s.id,
      moduleKey: "affective",
      cupsPerSample: 2,
      data: { ...data(before), [REF_STASH_KEY]: { at: "x", valores: { fragancia_af_final: 1 } } },
    });
    const saved = await row(A.id, u1);
    expect(data(saved).fragancia_af_final).toBe(7);
    expect(stashOf(saved)).toBeUndefined();
    as(owner);
    const un = await setReferenceSample(s.id, null);
    expect(un.ok).toBe(true);
    if (un.ok) expect(un.data.restored).toBe(0);
  });
});

// S10 WP5b review fixes, against real Postgres + the real aggregate trigger:
//  H1  a module produced under the pin (`pinnedView`) never overwrites the ratings the
//      server restored when the sample stopped being the pinned reference (live + replay),
//      a tampered `pinnedView` on an ordinary sample is harmless;
//  Low a cupper who was offline when the sample was marked keeps their ratings (stash from
//      the payload); a restore of a REVEALED sample is allowed (ratings given blind).
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookie: { user: { id: string; email: string | null; is_anonymous: boolean } | null } = { user: null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookie.user }, error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { setReferenceSample, upsertEvaluation } from "@/app/actions/sessions";
import { replayEvaluation } from "@/app/actions/offline";
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
const stashOf = (r: { affectiveData: unknown }) => data(r)[REF_STASH_KEY];

async function setup() {
  const owner = await makeUser({ name: "Dueña" });
  const u1 = await makeUser({ name: "Uno" });
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    participants: [u1],
    cupsPerSample: 2,
    samples: [{}, {}, {}],
  });
  const [A, B, C] = s.samples;
  return { owner, u1, s, A, B, C };
}
const save = (s: { id: string }, sampleId: string, d: Record<string, unknown>, pinnedView?: boolean) =>
  upsertEvaluation({
    sessionSampleId: sampleId,
    sessionId: s.id,
    moduleKey: "affective",
    cupsPerSample: 2,
    data: d,
    pinnedView,
  });

describe("H1: the page's stale pinned module cannot undo the restore", () => {
  it("live path: rate 7s -> mark A -> page saves pinned -> owner marks B -> stale pinned save + one descriptive change", async () => {
    const { owner, u1, s, A, B } = await setup();
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 7 });
    as(owner);
    expect((await setReferenceSample(s.id, A.id, true)).ok).toBe(true);
    as(u1);
    const pinnedModule = data(await row(A.id, u1));
    expect((await save(s, A.id, pinnedModule, true)).ok).toBe(true);
    as(owner);
    expect((await setReferenceSample(s.id, B.id, true)).ok).toBe(true);
    expect(data(await row(A.id, u1)).fragancia_af_final).toBe(7);

    // the cupper's open page still holds the pinned 5s and posts them with one descriptive edit
    as(u1);
    const stale = { ...pinReferenceAffective(pinnedModule, 2), notas_generales: "nueva" };
    expect((await save(s, A.id, stale, true)).ok).toBe(true);
    const after = await row(A.id, u1);
    expect(data(after).fragancia_af_final).toBe(7);
    expect(data(after).tazas_defectuosas).toEqual(data(await row(A.id, u1)).tazas_defectuosas);
    expect(data(after).notas_generales).toBe("nueva");
    expect(stashOf(after)).toBeUndefined();
    expect(after.individualScore).not.toBe(79);
  });

  it("without the flag the same stale save WOULD overwrite (the flag is what protects)", async () => {
    const { owner, u1, s, A, B } = await setup();
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 7 });
    as(owner);
    await setReferenceSample(s.id, A.id, true);
    await setReferenceSample(s.id, B.id, true);
    as(u1);
    await save(s, A.id, pinReferenceAffective(affectiveData(7), 2), false);
    expect(data(await row(A.id, u1)).fragancia_af_final).toBe(5);
  });

  it("offline replay: the same sequence through replayEvaluation", async () => {
    const { owner, u1, s, A, B } = await setup();
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 7 });
    as(owner);
    await setReferenceSample(s.id, A.id, true);
    await setReferenceSample(s.id, B.id, true);
    as(u1);
    const replay = await replayEvaluation({
      sessionSampleId: A.id,
      moduleKey: "affective",
      cupsPerSample: 2,
      data: { ...pinReferenceAffective({}, 2), notas_generales: "offline" },
      force: true,
      pinnedView: true,
    });
    expect(replay.status).toBe("synced");
    const after = await row(A.id, u1);
    expect(data(after).fragancia_af_final).toBe(7);
    expect(data(after).notas_generales).toBe("offline");
    expect(stashOf(after)).toBeUndefined();
  });

  it("a tampered pinnedView on an ordinary sample only keeps the caller's own stored values", async () => {
    const { u1, s, C } = await setup();
    await makeEvaluation({ sampleId: C.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 6, draft: true });
    as(u1);
    await save(s, C.id, { ...affectiveData(9), notas_generales: "x" }, true);
    const after = await row(C.id, u1);
    expect(data(after).fragancia_af_final).toBe(6); // own stored value kept
    expect(data(after).notas_generales).toBe("x");
    expect(stashOf(after)).toBeUndefined();
  });
});

describe("Low: device-only ratings and revealed samples", () => {
  it("a cupper offline when the sample was marked keeps their ratings (stash from the payload)", async () => {
    const { owner, u1, s, A } = await setup();
    as(owner);
    expect((await setReferenceSample(s.id, A.id)).ok).toBe(true); // nobody had rated A yet
    as(u1);
    const replay = await replayEvaluation({
      sessionSampleId: A.id,
      moduleKey: "affective",
      cupsPerSample: 2,
      data: affectiveData(8),
    });
    expect(replay.status).toBe("synced");
    const pinned = await row(A.id, u1);
    expect(data(pinned).fragancia_af_final).toBe(5);
    expect((stashOf(pinned) as { valores: Record<string, unknown> }).valores.fragancia_af_final).toBe(8);
    as(owner);
    expect((await setReferenceSample(s.id, null)).ok).toBe(true);
    expect(data(await row(A.id, u1)).fragancia_af_final).toBe(8);
  });

  it("a RESTORE on a revealed sample is allowed (ratings given blind) and re-fires the aggregate", async () => {
    const { owner, u1, s, A, B } = await setup();
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 7 });
    as(owner);
    await setReferenceSample(s.id, A.id, true);
    expect(Number((await storedAggregate(A.id))?.communityScore)).toBe(79);
    await prisma.sessionSample.update({ where: { id: A.id }, data: { revealed: true } });
    const res = await setReferenceSample(s.id, B.id, true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.restored).toBe(1);
    expect(data(await row(A.id, u1)).fragancia_af_final).toBe(7);
    expect(Number((await storedAggregate(A.id))?.communityScore)).not.toBe(79);
  });
});

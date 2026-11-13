// Third review M-C: a guest claim re-fires only the SAMPLES whose included evaluation set really
// changed. Every other sample of a closed, pre-deploy session keeps its stored aggregate byte for
// byte (communityScore, ruleVersion, computedAt). The Supabase admin client is the only mock.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById, deleteUser } } }),
}));

import { mergeGuestData } from "@/lib/guestClaim";
import { makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

const OLD_AT = new Date("2026-11-01T12:00:00Z");

beforeEach(async () => {
  await resetDb();
  getUserById.mockReset();
  deleteUser.mockReset();
  getUserById.mockImplementation(async (id: string) => ({ data: { user: { id, is_anonymous: true } }, error: null }));
  deleteUser.mockResolvedValue({ data: {}, error: null });
});

/** A submitted evaluation as the OLD code stored it (cups NULL). */
const oldEval = (sessionId: string, sampleId: string, cupperId: string, values = 7) =>
  makeEvaluation({
    sampleId,
    sessionId,
    cupperId,
    cupsPerSample: 2,
    values,
    nonUniform: [true, false],
    defective: [true, false],
    overrides: { cups: null },
  });

/** Pin every aggregate of the session to "stored by the old function" and close it (pre-deploy shape). */
async function pinAndClose(sessionId: string, sampleIds: string[]) {
  for (const id of sampleIds) {
    await prisma.aggregateScore.update({
      where: { sessionSampleId: id },
      data: { ruleVersion: 1, communityScore: 80.25, computedAt: OLD_AT },
    });
  }
  await prisma.cuppingSession.update({
    where: { id: sessionId },
    data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z"), closeFinalizedAt: new Date("2026-11-02T12:00:00Z") },
  });
}

async function snapshot(sampleId: string) {
  const a = await storedAggregate(sampleId);
  return { communityScore: a?.communityScore, ruleVersion: a?.ruleVersion, computedAt: a?.computedAt.getTime() };
}

describe("mergeGuestData re-fires only the samples that changed (M-C)", () => {
  it("a conflict on one sample of a closed pre-deploy session recomputes that sample only", async () => {
    const owner = await makeUser();
    const guest = await makeUser({ anonymous: true });
    const account = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [guest, account],
      cupsPerSample: 2,
      samples: [{ label: "A" }, { label: "B" }, { label: "C" }],
    });
    const [A, B, C] = s.samples;
    await oldEval(s.id, A.id, owner);
    await oldEval(s.id, B.id, owner);
    await oldEval(s.id, C.id, owner);
    // Conflict on A: both identities submitted. B and C: only the account (no conflict, plain stays).
    await oldEval(s.id, A.id, guest, 8);
    await oldEval(s.id, A.id, account, 6);
    await oldEval(s.id, B.id, account, 6);
    await oldEval(s.id, C.id, account, 6);
    await pinAndClose(s.id, [A.id, B.id, C.id]);
    const beforeB = await snapshot(B.id);
    const beforeC = await snapshot(C.id);

    const r = await mergeGuestData(guest, account, new Date(0));
    expect(r.ok).toBe(true);

    const afterA = await storedAggregate(A.id);
    expect(afterA?.ruleVersion).toBe(2);
    expect(afterA?.computedAt.getTime()).toBeGreaterThan(OLD_AT.getTime());
    expect(await snapshot(B.id)).toEqual(beforeB);
    expect(await snapshot(C.id)).toEqual(beforeC);
  });

  it("exclusion difference: only the account's own samples are recomputed, the guest's sample is not", async () => {
    const owner = await makeUser();
    const guest = await makeUser({ anonymous: true });
    const account = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [guest, account],
      cupsPerSample: 2,
      samples: [{ label: "A" }, { label: "B" }, { label: "C" }],
    });
    const [A, B, C] = s.samples;
    await oldEval(s.id, A.id, owner);
    await oldEval(s.id, B.id, owner);
    await oldEval(s.id, C.id, owner);
    await oldEval(s.id, A.id, guest, 8); // guest evaluated A only (it was excluded when it did)
    await oldEval(s.id, B.id, account, 6);
    await oldEval(s.id, C.id, account, 6);
    await pinAndClose(s.id, [A.id, B.id, C.id]);
    // The owner excluded the GUEST identity (after the fact); the account is not excluded.
    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: s.id, userId: guest } },
      data: { excludedFromResults: true, excludedAt: new Date(), excludedBy: owner, exclusionReason: "protocol" },
    });
    const beforeA = await snapshot(A.id);

    const r = await mergeGuestData(guest, account, new Date(0));
    expect(r.ok).toBe(true);

    // The surviving row is excluded: the account's own evaluations (B, C) left the included set.
    for (const sample of [B, C]) {
      const a = await storedAggregate(sample.id);
      expect(a?.ruleVersion).toBe(2);
      expect(a?.participantCount).toBe(1); // only the owner remains
      expect(a?.computedAt.getTime()).toBeGreaterThan(OLD_AT.getTime());
    }
    // A: the guest's evaluation was already excluded and stays excluded: nothing changed there.
    expect(await snapshot(A.id)).toEqual(beforeA);
  });

  it("a claim with no conflict and no exclusion difference re-fires nothing", async () => {
    const owner = await makeUser();
    const guest = await makeUser({ anonymous: true });
    const account = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [guest, account],
      cupsPerSample: 2,
      samples: [{ label: "A" }, { label: "B" }, { label: "C" }],
    });
    const [A, B, C] = s.samples;
    await oldEval(s.id, A.id, owner);
    await oldEval(s.id, B.id, owner);
    await oldEval(s.id, C.id, owner);
    await oldEval(s.id, A.id, guest, 8);
    await oldEval(s.id, B.id, account, 6);
    await pinAndClose(s.id, [A.id, B.id, C.id]);
    const before = [await snapshot(A.id), await snapshot(B.id), await snapshot(C.id)];

    const r = await mergeGuestData(guest, account, new Date(0));
    expect(r.ok).toBe(true);

    expect([await snapshot(A.id), await snapshot(B.id), await snapshot(C.id)]).toEqual(before);
    // the guest's evaluation did move to the account
    expect(await prisma.evaluation.count({ where: { cupperId: account, sessionSampleId: A.id } })).toBe(1);
  });
});

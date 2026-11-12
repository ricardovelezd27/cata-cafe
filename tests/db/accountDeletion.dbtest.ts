// Group 5: deleteAccountData (the whole transaction) against a real database.
// Only the Supabase admin user deletion is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser } } }),
}));

import { deleteAccountData } from "@/lib/accountDeletion/deleteAccount";
import { isDeletedProfileId } from "@/lib/accountDeletion/deletedProfile";
import { getSuperAdminEmail } from "@/lib/analytics/access";
import { PROFILE_MANIFEST } from "@/lib/accountDeletion/manifest";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";
import { referencesTo } from "./support/refs";

beforeEach(async () => {
  await resetDb();
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ data: {}, error: null });
});

async function world() {
  const D = await makeUser({ name: "Daniela", email: "daniela@example.test" });
  const P1 = await makeUser({ name: "Pedro" });
  const P2 = await makeUser({ name: "Paula" });
  const Q = await makeUser({ name: "Quien organiza" }); // owns the sessions D takes part in

  const c1 = await makeCoffee(D, "Café de Daniela 1");
  const c2 = await makeCoffee(D, "Café de Daniela 2");
  await prisma.coffee.update({ where: { id: c1.id }, data: { farm: "Finca Privada", notes: "datos propios" } });
  await prisma.coffeeShare.create({ data: { coffeeId: c1.id, userId: P1 } }); // D's coffee shared out
  const qCoffee = await makeCoffee(Q, "Café de Q");
  await prisma.coffeeShare.create({ data: { coffeeId: qCoffee.id, userId: D } }); // shared TO D

  // (1) solo session -> deleted
  const solo = await makeSession({ ownerId: D, samples: [{ coffeeId: c2.id, revealed: true }] });
  await makeEvaluation({ sampleId: solo.samples[0].id, sessionId: solo.id, cupperId: D, values: 7 });

  // (2) live group session others evaluated in -> kept, closed, moved
  const kept = await makeSession({
    ownerId: D,
    isGroup: true,
    participants: [P1, P2],
    samples: [{ coffeeId: c1.id, revealed: false }],
  });
  await makeEvaluation({ sampleId: kept.samples[0].id, sessionId: kept.id, cupperId: D, values: 8 });
  await makeEvaluation({ sampleId: kept.samples[0].id, sessionId: kept.id, cupperId: P1, values: 6 });
  await makeEvaluation({ sampleId: kept.samples[0].id, sessionId: kept.id, cupperId: P2, values: 4 });

  // (2b) group session where nobody else evaluated or joined -> deleted
  const emptyGroup = await makeSession({ ownerId: D, isGroup: true, samples: [{}] });

  // (3) Q's open session, D only has a DRAFT (+ P1 submitted) -> row and draft dropped
  const otherDraft = await makeSession({ ownerId: Q, isGroup: true, participants: [D, P1], samples: [{}] });
  await makeEvaluation({ sampleId: otherDraft.samples[0].id, sessionId: otherDraft.id, cupperId: D, values: 3, draft: true });
  await makeEvaluation({ sampleId: otherDraft.samples[0].id, sessionId: otherDraft.id, cupperId: P1, values: 9 });

  // (4) Q's open session where D SUBMITTED (and was excluded) -> kept, moved to the placeholder
  const otherSubmitted = await makeSession({ ownerId: Q, isGroup: true, participants: [D, P1, P2], samples: [{}] });
  await makeEvaluation({ sampleId: otherSubmitted.samples[0].id, sessionId: otherSubmitted.id, cupperId: D, values: 2 });
  await makeEvaluation({ sampleId: otherSubmitted.samples[0].id, sessionId: otherSubmitted.id, cupperId: P1, values: 8 });
  await makeEvaluation({ sampleId: otherSubmitted.samples[0].id, sessionId: otherSubmitted.id, cupperId: P2, values: 6 });
  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId: otherSubmitted.id, userId: D } },
    data: { excludedFromResults: true, excludedAt: new Date(), excludedBy: Q, exclusionReason: "protocol" },
  });
  // Q excluded D, and D (as the owner of `kept`) excluded P2 there
  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId: kept.id, userId: P2 } },
    data: { excludedFromResults: true, excludedAt: new Date(), excludedBy: D, exclusionReason: "calibration" },
  });
  await prisma.evaluation.updateMany({ where: { sessionSampleId: kept.samples[0].id }, data: { isDraft: false } });

  // groups: one solo, one with another member
  const soloGroup = await prisma.tastingGroup.create({ data: { name: "Solo", createdBy: D } });
  const sharedGroup = await prisma.tastingGroup.create({ data: { name: "Con gente", createdBy: D } });
  await prisma.tastingGroupMember.create({ data: { groupId: sharedGroup.id, email: "pedro@example.test", userId: P1 } });
  await prisma.groupPost.create({ data: { groupId: sharedGroup.id, authorId: D, body: "Hola grupo" } });
  await prisma.tastingGroupMember.create({ data: { groupId: sharedGroup.id, email: "daniela@example.test", userId: D } });

  // bare + misc rows
  await prisma.aiChatUsage.create({ data: { userId: D, day: "2026-11-01", questionCount: 3 } });
  await prisma.closeEmailDelivery.create({ data: { sessionId: otherSubmitted.id, userId: D, status: "sent" } });
  await prisma.outboundEmailEvent.create({ data: { kind: "group_invite", actorKey: `u_${D}`, recipients: 2 } });
  await prisma.waitlistEntry.create({ data: { email: "daniela@example.test" } });
  await prisma.savedInsight.create({ data: { createdBy: D, name: "mi insight", config: {} } });

  return { D, P1, P2, Q, c1, c2, solo, kept, emptyGroup, otherDraft, otherSubmitted, soloGroup, sharedGroup };
}

describe("deleteAccountData", () => {
  it("runs the whole transaction and leaves the database consistent", async () => {
    const w = await world();
    const userId = w.D;

    // state of OTHER people's work before
    const keptAggBefore = await storedAggregate(w.kept.samples[0].id);
    const otherAggBefore = await storedAggregate(w.otherSubmitted.samples[0].id);
    const p1Evals = await prisma.evaluation.findMany({ where: { cupperId: { in: [w.P1, w.P2] } }, orderBy: { id: "asc" } });
    expect(await referencesTo(userId)).not.toEqual({});

    const out = await deleteAccountData({ id: userId, email: "daniela@example.test", is_anonymous: false });

    expect(out.authDeleted).toBe(true);
    expect(deleteUser).toHaveBeenCalledWith(userId);
    expect(isDeletedProfileId(out.placeholderId)).toBe(true);
    expect(out.sessionsDeleted).toBe(2); // solo + empty group
    expect(out.sessionsKept).toBe(1);

    // the final profile.delete succeeded and nothing in the manifest still points at the person
    expect(await prisma.profile.findUnique({ where: { id: userId } })).toBeNull();
    expect(await referencesTo(userId)).toEqual({});
    expect(PROFILE_MANIFEST.length).toBeGreaterThan(10);

    // placeholder
    const ph = await prisma.profile.findUniqueOrThrow({ where: { id: out.placeholderId } });
    expect(ph.displayName).toBe("Cuenta eliminada");

    // (1) + (2b) deleted; (2) kept, closed, moved
    expect(await prisma.cuppingSession.count({ where: { id: { in: [w.solo.id, w.emptyGroup.id] } } })).toBe(0);
    const kept = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: w.kept.id } });
    expect(kept.createdBy).toBe(out.placeholderId);
    expect(kept.status).toBe("closed");
    expect(kept.closedAt).toBeInstanceOf(Date);
    expect(kept.closeFinalizedAt).toBeInstanceOf(Date);
    // closing revealed the coffee so the others keep a coffee history row
    expect(await prisma.userCoffeeHistory.count({ where: { userId: w.P1, coffeeId: w.c1.id } })).toBe(1);

    // others' submitted evaluations are untouched
    const after = await prisma.evaluation.findMany({ where: { cupperId: { in: [w.P1, w.P2] } }, orderBy: { id: "asc" } });
    expect(after.map((e) => [e.id, e.rawScore, e.individualScore, e.isDraft])).toEqual(
      p1Evals.map((e) => [e.id, e.rawScore, e.individualScore, e.isDraft]),
    );
    // D's evaluations on kept rows were anonymized, not erased
    expect(await prisma.evaluation.count({ where: { sessionSampleId: w.kept.samples[0].id } })).toBe(3);
    expect(await prisma.evaluation.count({ where: { cupperId: out.placeholderId } })).toBe(2); // kept + otherSubmitted

    // stored community scores unchanged (anonymizing never re-fires the trigger)
    const keptAggAfter = await storedAggregate(w.kept.samples[0].id);
    expect(keptAggAfter?.communityScore).toBe(keptAggBefore?.communityScore);
    expect(keptAggAfter?.participantCount).toBe(keptAggBefore?.participantCount);
    const otherAggAfter = await storedAggregate(w.otherSubmitted.samples[0].id);
    expect(otherAggAfter?.communityScore).toBe(otherAggBefore?.communityScore);
    expect(otherAggAfter?.participantCount).toBe(otherAggBefore?.participantCount);
    expect(otherAggAfter?.computedAt).toEqual(otherAggBefore?.computedAt);

    // (3) draft-only participation dropped with the draft; P1's submission stands
    expect(
      await prisma.sessionParticipant.count({ where: { sessionId: w.otherDraft.id, userId: { in: [userId, out.placeholderId] } } }),
    ).toBe(0);
    expect(await prisma.evaluation.count({ where: { sessionSampleId: w.otherDraft.samples[0].id } })).toBe(1);

    // (4) submitted participation kept, moved WITH its exclusion flag and trail
    const moved = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_userId: { sessionId: w.otherSubmitted.id, userId: out.placeholderId } },
    });
    expect(moved.excludedFromResults).toBe(true);
    expect(moved.exclusionReason).toBe("protocol");
    // the exclusion trail of rows D had set on kept sessions now names the placeholder
    const trail = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_userId: { sessionId: w.kept.id, userId: w.P2 } },
    });
    expect(trail.excludedBy).toBe(out.placeholderId);

    // coffees anonymized and moved, with their shares removed
    for (const id of [w.c1.id, w.c2.id]) {
      const c = await prisma.coffee.findUniqueOrThrow({ where: { id } });
      expect(c.deletedAt).toBeInstanceOf(Date);
      expect(c.createdBy).toBe(out.placeholderId);
      expect(c.farm).toBeNull();
      expect(c.notes).toBeNull();
      expect(c.name).not.toContain("Daniela");
      expect(c.country).toBe("Colombia"); // analytics attribute survives
    }
    expect(await prisma.coffeeShare.count()).toBe(0);

    // groups: solo one deleted, shared one kept under the placeholder; membership and post
    expect(await prisma.tastingGroup.count({ where: { id: w.soloGroup.id } })).toBe(0);
    expect((await prisma.tastingGroup.findUniqueOrThrow({ where: { id: w.sharedGroup.id } })).createdBy).toBe(out.placeholderId);
    expect((await prisma.groupPost.findFirstOrThrow()).authorId).toBe(out.placeholderId);
    expect(await prisma.tastingGroupMember.count({ where: { email: "daniela@example.test" } })).toBe(0);
    expect(await prisma.tastingGroupMember.count({ where: { userId: w.P1 } })).toBe(1);

    // erased: ledgers, usage, waitlist
    expect(await prisma.aiChatUsage.count()).toBe(0);
    expect(await prisma.closeEmailDelivery.count()).toBe(0);
    expect(await prisma.outboundEmailEvent.count({ where: { actorKey: `u_${userId}` } })).toBe(0);
    expect(await prisma.waitlistEntry.count({ where: { email: "daniela@example.test" } })).toBe(0);
    expect(await prisma.userCoffeeHistory.count({ where: { userId } })).toBe(0);
    // P1's and P2's history/profiles are intact
    expect(await prisma.profile.count({ where: { id: { in: [w.P1, w.P2, w.Q] } } })).toBe(3);
  }, 120_000);

  it("reports authDeleted=false after 3 failed attempts but the data is gone", async () => {
    const D = await makeUser({ email: "x@example.test" });
    await makeSession({ ownerId: D, samples: [{}] });
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure" } });
    const out = await deleteAccountData({ id: D, email: "x@example.test" });
    expect(out.authDeleted).toBe(false);
    expect(deleteUser).toHaveBeenCalledTimes(3);
    expect(await prisma.profile.findUnique({ where: { id: D } })).toBeNull();
  });

  it("refuses the super-admin and writes nothing", async () => {
    const boss = getSuperAdminEmail();
    const D = await makeUser({ email: boss });
    await makeSession({ ownerId: D, samples: [{}] });
    await expect(deleteAccountData({ id: D, email: boss })).rejects.toThrow("account_protected");
    expect(await prisma.profile.findUnique({ where: { id: D } })).not.toBeNull();
    expect(await prisma.cuppingSession.count()).toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

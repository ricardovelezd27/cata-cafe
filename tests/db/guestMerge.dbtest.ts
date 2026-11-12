// Group 4: mergeGuestData against a real database. The Supabase admin client is
// the only mocked boundary (getUserById / deleteUser).
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById, deleteUser } } }),
}));

import { mergeGuestData } from "@/lib/guestClaim";
import { closeSessionInternal } from "@/lib/closeSession";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";
import { referencesTo } from "./support/refs";

beforeEach(async () => {
  await resetDb();
  getUserById.mockReset();
  deleteUser.mockReset();
  getUserById.mockImplementation(async (id: string) => ({ data: { user: { id, is_anonymous: true } }, error: null }));
  deleteUser.mockResolvedValue({ data: {}, error: null });
});

describe("mergeGuestData", () => {
  it("moves a guest into an existing account and applies the conflict rules", async () => {
    const owner = await makeUser({ name: "Owner" });
    const guest = await makeUser({ anonymous: true, name: "Invitado Ana" });
    const account = await makeUser({ name: "Cuenta Real" });
    const coffee = await makeCoffee(owner, "Café X");
    const guestCoffee = await makeCoffee(guest, "Café del invitado");

    // closed group session; X revealed + coffee-linked, Y coffee-less
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [guest, account],
      samples: [{ label: "X", coffeeId: coffee.id, revealed: true }, { label: "Y" }],
    });
    const [X, Y] = s.samples;
    // X: guest SUBMITTED (8) vs account DRAFT (5)  -> guest wins
    const guestX = await makeEvaluation({ sampleId: X.id, sessionId: s.id, cupperId: guest, values: 8 });
    const accountXDraft = await makeEvaluation({ sampleId: X.id, sessionId: s.id, cupperId: account, values: 5, draft: true });
    // Y: guest DRAFT vs account SUBMITTED (6) -> account wins
    const guestYDraft = await makeEvaluation({ sampleId: Y.id, sessionId: s.id, cupperId: guest, values: 4, draft: true });
    const accountY = await makeEvaluation({ sampleId: Y.id, sessionId: s.id, cupperId: account, values: 6 });

    // the guest's own solo session, coffee share and a coffee invite-free profile
    const guestSolo = await makeSession({ ownerId: guest, samples: [{}] });
    await prisma.coffeeShare.create({ data: { coffeeId: coffee.id, userId: guest } });
    await prisma.aiChatUsage.create({ data: { userId: guest, day: "2026-11-01", questionCount: 2 } });
    await prisma.aiChatUsage.create({ data: { userId: account, day: "2026-11-01", questionCount: 1 } });

    await closeSessionInternal(s.id, { reason: "owner", emails: "skip" });
    // history before the merge: guest has the X coffee row, account the Y label row
    expect(await prisma.userCoffeeHistory.count({ where: { userId: guest, coffeeId: coffee.id } })).toBe(1);
    expect(await prisma.userCoffeeHistory.count({ where: { userId: account, coffeeId: null } })).toBe(1);

    const r = await mergeGuestData(guest, account, new Date(0));
    expect(r.ok).toBe(true);
    expect(getUserById).toHaveBeenCalledWith(guest);
    expect(deleteUser).toHaveBeenCalledWith(guest);

    // evaluations: X is the guest's submitted row (same id) under the account; Y the account's own
    const evals = await prisma.evaluation.findMany({ orderBy: { id: "asc" } });
    expect(evals.map((e) => e.cupperId)).not.toContain(guest);
    const ids = evals.map((e) => e.id);
    expect(ids).toContain(guestX.id);
    expect(ids).toContain(accountY.id);
    expect(ids).not.toContain(accountXDraft.id);
    expect(ids).not.toContain(guestYDraft.id);
    const survivingX = evals.find((e) => e.id === guestX.id)!;
    expect(survivingX.cupperId).toBe(account);
    expect(survivingX.isDraft).toBe(false);

    // aggregate for X was re-fired inside the transaction: one included evaluation (94.75)
    expect((await storedAggregate(X.id))?.participantCount).toBe(1);
    expect((await storedAggregate(X.id))?.communityScore).toBe(94.75);

    // participation: guest row gone, the account's row stands
    const parts = await prisma.sessionParticipant.findMany({ where: { sessionId: s.id } });
    expect(parts.map((p) => p.userId).sort()).toEqual([owner, account].sort());

    // history moved to the account, label row for Y not duplicated
    expect(await prisma.userCoffeeHistory.count({ where: { userId: guest } })).toBe(0);
    const accHist = await prisma.userCoffeeHistory.findMany({ where: { userId: account } });
    expect(accHist.filter((h) => h.coffeeId === coffee.id)).toHaveLength(1);
    expect(accHist.filter((h) => h.coffeeId === null)).toHaveLength(1);
    // post-commit re-sync: the moved coffee row carries the surviving evaluation's score
    const xRow = accHist.find((h) => h.coffeeId === coffee.id)!;
    expect(xRow.individualScore).toBe(survivingX.individualScore);
    expect(xRow.communityScore).toBe(94.75);

    // ownership + shares + usage moved/summed
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: guestSolo.id } })).createdBy).toBe(account);
    expect((await prisma.coffee.findUniqueOrThrow({ where: { id: guestCoffee.id } })).createdBy).toBe(account);
    expect(await prisma.coffeeShare.count({ where: { userId: account, coffeeId: coffee.id } })).toBe(1);
    const usage = await prisma.aiChatUsage.findMany();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ userId: account, questionCount: 3 });

    // the anonymous profile is gone; nothing anywhere still references it
    expect(await prisma.profile.findUnique({ where: { id: guest } })).toBeNull();
    expect(await referencesTo(guest)).toEqual({});
  });

  it("a brand-new account inherits the name the guest typed; an old one keeps its own", async () => {
    const guest = await makeUser({ anonymous: true, name: "Nombre del QR" });
    const fresh = await makeUser({ name: "prefijo" });
    await mergeGuestData(guest, fresh, new Date(0)); // account created AFTER the claim was minted
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: fresh } })).displayName).toBe("Nombre del QR");

    const guest2 = await makeUser({ anonymous: true, name: "Otro invitado" });
    const old = await makeUser({ name: "Cuenta vieja" });
    await mergeGuestData(guest2, old, new Date(Date.now() + 3_600_000)); // account older than the claim
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: old } })).displayName).toBe("Cuenta vieja");
  });

  it("refuses a non-anonymous user and leaves the data alone", async () => {
    const real = await makeUser();
    const other = await makeUser();
    getUserById.mockResolvedValueOnce({ data: { user: { id: real, is_anonymous: false } }, error: null });
    await makeSession({ ownerId: real, samples: [{}] });
    const r = await mergeGuestData(real, other, new Date(0));
    expect(r).toEqual({ ok: false, error: "not_anonymous" });
    expect(await prisma.cuppingSession.count({ where: { createdBy: real } })).toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("an excluded guest row carries its exclusion to the surviving account row", async () => {
    const owner = await makeUser();
    const guest = await makeUser({ anonymous: true });
    const account = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [guest, account] });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: account, values: 8 });
    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: s.id, userId: guest } },
      data: { excludedFromResults: true, excludedAt: new Date(), excludedBy: owner, exclusionReason: "protocol" },
    });
    const r = await mergeGuestData(guest, account, new Date(0));
    expect(r.ok).toBe(true);
    const row = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_userId: { sessionId: s.id, userId: account } },
    });
    expect(row.excludedFromResults).toBe(true);
    expect(row.exclusionReason).toBe("protocol");
    // the account's single evaluation is now excluded by the trigger after the re-fire
    expect((await storedAggregate(s.samples[0].id))?.participantCount).toBe(0);
  });
});

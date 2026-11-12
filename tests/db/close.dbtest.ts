// Group 2: closeSessionInternal (two-phase close, idempotence, repair).
// The email sender is the only mocked boundary.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendCloseEmails = vi.fn();
vi.mock("@/lib/closeEmail", () => ({ sendCloseEmails: (...a: unknown[]) => sendCloseEmails(...a) }));

import { closeSessionInternal, finalizeClosedSession } from "@/lib/closeSession";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(async () => {
  await resetDb();
  sendCloseEmails.mockReset();
  sendCloseEmails.mockResolvedValue({ attempted: 2, sent: 2, skipped: 0, failed: 0 });
});

async function scenario() {
  const owner = await makeUser({ name: "Dueña" });
  const u1 = await makeUser({ name: "Uno" });
  const u2 = await makeUser({ name: "Dos" });
  const coffee = await makeCoffee(owner, "Huila Lote 7");
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    participants: [u1, u2],
    samples: [{ label: "A", coffeeId: coffee.id, revealed: false }, { label: "B", coffeeId: null }],
  });
  const [A, B] = s.samples;
  await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, values: 7 });
  await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u2, values: 5 });
  await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: u1, values: 6 });
  await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: u2, values: 6, draft: true });
  return { owner, u1, u2, coffee, s, A, B };
}

describe("closeSessionInternal", () => {
  it("phase 1 + 2: closes, reveals, writes history, stamps, sends emails once", async () => {
    const { s, A, B, coffee, u1, u2 } = await scenario();
    const r = await closeSessionInternal(s.id, { reason: "owner", emails: "await" });
    expect(r).toMatchObject({ closed: true, isGroup: true, finalized: true });
    expect(sendCloseEmails).toHaveBeenCalledTimes(1);
    expect(sendCloseEmails).toHaveBeenCalledWith(s.id);

    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("closed");
    expect(row.closedAt).toBeInstanceOf(Date);
    expect(row.closeFinalizedAt).toBeInstanceOf(Date);

    // coffee-linked sample revealed; coffee-less stays as it was
    expect((await prisma.sessionSample.findUniqueOrThrow({ where: { id: A.id } })).revealed).toBe(true);

    const agg = await storedAggregate(A.id);
    const coffeeRows = await prisma.userCoffeeHistory.findMany({ where: { sessionId: s.id, coffeeId: coffee.id } });
    expect(coffeeRows.map((h) => h.userId).sort()).toEqual([u1, u2].sort());
    for (const h of coffeeRows) {
      expect(h.communityScore).toBe(agg?.communityScore);
      expect(h.evaluationId).not.toBeNull();
    }
    // coffee-less sample B: a label-only row for the SUBMITTED evaluation only (u2's is a draft)
    const labelRows = await prisma.userCoffeeHistory.findMany({ where: { sessionId: s.id, coffeeId: null } });
    expect(labelRows.map((h) => h.userId)).toEqual([u1]);
    expect((labelRows[0].snapshot as { sampleLabel: string }).sampleLabel).toBe("B");
    // the draft stays a draft and never reached the aggregate
    expect((await storedAggregate(B.id))?.participantCount).toBe(1);
    expect(await prisma.evaluation.count({ where: { sessionSampleId: B.id, isDraft: true } })).toBe(1);
  });

  it("is idempotent: a second call changes nothing and sends nothing", async () => {
    const { s } = await scenario();
    await closeSessionInternal(s.id, { reason: "owner", emails: "await" });
    const before = {
      sess: await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } }),
      hist: await prisma.userCoffeeHistory.count(),
    };
    const again = await closeSessionInternal(s.id, { reason: "cron", emails: "await" });
    expect(again).toMatchObject({ closed: false });
    expect(again.repaired).toBeUndefined();
    expect(sendCloseEmails).toHaveBeenCalledTimes(1);
    const after = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.closedAt).toEqual(before.sess.closedAt);
    expect(after.closeFinalizedAt).toEqual(before.sess.closeFinalizedAt);
    expect(await prisma.userCoffeeHistory.count()).toBe(before.hist);
  });

  it("two concurrent closes flip the row once", async () => {
    const { s } = await scenario();
    const [a, b] = await Promise.all([
      closeSessionInternal(s.id, { reason: "owner", emails: "skip" }),
      closeSessionInternal(s.id, { reason: "cron", emails: "skip" }),
    ]);
    expect([a.closed, b.closed].filter(Boolean)).toHaveLength(1);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("closed");
  });

  it("repair path: a failed phase 2 leaves the stamp null; the next call repairs it", async () => {
    const { s, coffee } = await scenario();
    sendCloseEmails.mockRejectedValueOnce(new Error("resend down"));
    const first = await closeSessionInternal(s.id, { reason: "owner", emails: "await" });
    // the email step threw: phase 1 + data steps are done, the stamp is withheld
    expect(first.closed).toBe(true);
    let row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("closed");
    expect(row.closeFinalizedAt).toBeNull();

    // simulate that the history step never ran either
    await prisma.userCoffeeHistory.deleteMany({});
    // a call inside the grace window must not race a close "still in flight"
    const early = await closeSessionInternal(s.id, { reason: "repair", emails: "await" });
    expect(early.repaired).toBeUndefined();
    expect(await prisma.userCoffeeHistory.count()).toBe(0);

    // once the close is old enough the repair runs phase 2 again
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closedAt: new Date(Date.now() - 10 * 60_000) } });
    const repaired = await closeSessionInternal(s.id, { reason: "repair", emails: "await" });
    expect(repaired).toMatchObject({ closed: false, repaired: true, finalized: true });
    row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.closeFinalizedAt).toBeInstanceOf(Date);
    expect(await prisma.userCoffeeHistory.count({ where: { coffeeId: coffee.id } })).toBe(2);
    expect(sendCloseEmails).toHaveBeenCalledTimes(2);
  });

  it("finalizeClosedSession can be called directly on a closed row and is repeatable", async () => {
    const { s } = await scenario();
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { status: "closed", closedAt: new Date() } });
    const r1 = await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });
    expect(r1.finalized).toBe(true);
    const n = await prisma.userCoffeeHistory.count();
    const r2 = await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });
    expect(r2.finalized).toBe(true);
    expect(await prisma.userCoffeeHistory.count()).toBe(n);
  });

  it("solo session: no emails, stamped in one call", async () => {
    const owner = await makeUser();
    const coffee = await makeCoffee(owner);
    const s = await makeSession({ ownerId: owner, samples: [{ coffeeId: coffee.id }] });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, values: 7 });
    const r = await closeSessionInternal(s.id, { reason: "solo_auto", emails: "skip", repairGraceMs: 0 });
    expect(r).toMatchObject({ closed: true, isGroup: false, finalized: true });
    expect(sendCloseEmails).not.toHaveBeenCalled();
    expect(await prisma.userCoffeeHistory.count({ where: { userId: owner, coffeeId: coffee.id } })).toBe(1);
  });
});

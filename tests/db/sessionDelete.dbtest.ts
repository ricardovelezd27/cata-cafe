// Group 3: deleting a session keeps every cupper's history (deleteSession path:
// detachCoffeeHistoryForSession + cuppingSession.delete in ONE transaction,
// exactly as app/actions/sessions.ts deleteSession runs it).
import { beforeEach, describe, expect, it } from "vitest";
import { detachCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

async function deleteSessionPath(sessionId: string) {
  // same two statements as deleteSession (the action needs a request context)
  await prisma.$transaction(
    async (tx) => {
      await detachCoffeeHistoryForSession(tx, sessionId);
      await tx.cuppingSession.delete({ where: { id: sessionId } });
    },
    { timeout: 30_000 },
  );
}

describe("session delete keeps history", () => {
  it("revealed coffee sample, blind coffee sample and coffee-less sample", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const u2 = await makeUser();
    const secret = await makeCoffee(owner, "Geisha Secreto");
    const open = await makeCoffee(owner, "Café Revelado");
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1, u2],
      samples: [
        { label: "A", coffeeId: open.id, revealed: true },
        { label: "B", coffeeId: secret.id, revealed: false },
        { label: "C", coffeeId: null },
      ],
    });
    for (const sample of s.samples) {
      for (const u of [u1, u2]) {
        await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: u, values: 6 });
      }
    }
    // history exists only after a sync for the revealed sample (as close would do)
    await deleteSessionPath(s.id);

    expect(await prisma.cuppingSession.count({ where: { id: s.id } })).toBe(0);
    expect(await prisma.evaluation.count()).toBe(0);

    for (const u of [u1, u2]) {
      const rows = await prisma.userCoffeeHistory.findMany({ where: { userId: u } });
      expect(rows).toHaveLength(3); // coffee row + two label-only rows
      for (const r of rows) {
        expect(r.sessionId).toBeNull();
        expect(r.evaluationId).toBeNull();
        expect(r.detachedAt).toBeInstanceOf(Date);
        expect(r.snapshot).not.toBeNull();
      }
      const coffeeRow = rows.find((r) => r.coffeeId === open.id)!;
      expect(coffeeRow).toBeDefined();
      expect((coffeeRow.snapshot as { sampleLabel: string }).sampleLabel).toBe("A");

      const labelRows = rows.filter((r) => r.coffeeId === null);
      expect(labelRows.map((r) => (r.snapshot as { sampleLabel: string }).sampleLabel).sort()).toEqual(["B", "C"]);
      const blind = labelRows.find((r) => (r.snapshot as { sampleLabel: string }).sampleLabel === "B")!;
      expect((blind.snapshot as { unrevealed?: boolean }).unrevealed).toBe(true);
      // the blind coffee never leaks into the row or its snapshot
      expect(JSON.stringify(blind)).not.toContain("Geisha");
      expect(JSON.stringify(blind)).not.toContain(secret.id);
    }
    // nothing of the coffee records themselves is touched by a session delete
    expect(await prisma.coffee.count({ where: { id: { in: [open.id, secret.id] } } })).toBe(2);
  });

  it("a closed session whose history was already synced deletes without an FK error", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const coffee = await makeCoffee(owner);
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      samples: [{ coffeeId: coffee.id, revealed: true }],
    });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: u1, values: 8 });
    const { syncCoffeeHistoryForSession } = await import("@/lib/coffeeHistory");
    await syncCoffeeHistoryForSession(s.id);
    expect(await prisma.userCoffeeHistory.count({ where: { sessionId: s.id } })).toBe(1);
    await expect(deleteSessionPath(s.id)).resolves.toBeUndefined();
    const row = await prisma.userCoffeeHistory.findFirstOrThrow({ where: { userId: u1 } });
    expect(row.sessionId).toBeNull();
    expect(row.coffeeId).toBe(coffee.id);
    expect(row.individualScore).not.toBeNull();
  });

  it("drafts leave no history row", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, samples: [{}] });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, values: 6, draft: true });
    await deleteSessionPath(s.id);
    expect(await prisma.userCoffeeHistory.count()).toBe(0);
  });
});

describe("label-only history rows: the partial unique index (migration-only)", () => {
  it("exists and refuses a second label-only row for the same evaluation, but not for NULL evaluations", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, samples: [{}] });
    const ev = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, values: 6 });
    const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
      select indexdef from pg_indexes where indexname = 'user_coffee_history_label_row_evaluation_key'`;
    expect(idx).toHaveLength(1);
    const row = { userId: owner, coffeeId: null, evaluationId: ev.id, sessionId: s.id, tastedAt: new Date() };
    await prisma.userCoffeeHistory.create({ data: row });
    await expect(prisma.userCoffeeHistory.create({ data: row })).rejects.toMatchObject({ code: "P2002" });
    // detached rows (evaluationId NULL) are not constrained by it
    await prisma.userCoffeeHistory.create({ data: { userId: owner, tastedAt: new Date() } });
    await prisma.userCoffeeHistory.create({ data: { userId: owner, tastedAt: new Date() } });
    expect(await prisma.userCoffeeHistory.count({ where: { evaluationId: null } })).toBe(2);
  });
});

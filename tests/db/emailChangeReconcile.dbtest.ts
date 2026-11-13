// The nightly email-change reconcile (S10 leftovers A1), against a real
// database. Only the Supabase admin API is mocked: getUserById reads the user
// out of auth.users the way GoTrue would return it, updateUserById applies the
// app_metadata change to raw_app_meta_data (merge; a null value removes the key).
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const updateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById, updateUserById } } }),
}));

import { EMAIL_CHANGE_RECONCILE_BATCH, reconcileEmailChanges, selectEmailChangeRecordIds } from "@/lib/emailChangeReconcile";
import { makeUser, prisma, resetDb } from "./support/db";

/** `new_email` is not a column of the shim: tests keep it here by user id. */
const pending = new Map<string, string>();

beforeEach(async () => {
  await resetDb();
  pending.clear();
  getUserById.mockReset();
  getUserById.mockImplementation(async (id: string) => {
    const rows = await prisma.$queryRaw<{ id: string; email: string | null; meta: Record<string, unknown> }[]>`
      select id::text as id, email, raw_app_meta_data as meta from auth.users where id = ${id}::uuid`;
    if (rows.length === 0) return { data: { user: null }, error: { status: 404, code: "user_not_found" } };
    const u = rows[0];
    return { data: { user: { id: u.id, email: u.email, new_email: pending.get(id) ?? "", app_metadata: u.meta } }, error: null };
  });
  updateUserById.mockReset();
  updateUserById.mockImplementation(async (id: string, attrs: { app_metadata: Record<string, unknown> }) => {
    for (const [k, v] of Object.entries(attrs.app_metadata)) {
      if (v === null) {
        await prisma.$executeRaw`update auth.users set raw_app_meta_data = raw_app_meta_data - ${k} where id = ${id}::uuid`;
      } else {
        await prisma.$executeRaw`update auth.users set raw_app_meta_data = raw_app_meta_data || ${JSON.stringify({ [k]: v })}::jsonb where id = ${id}::uuid`;
      }
    }
    return { data: {}, error: null };
  });
});

async function withRecord(email: string, rec: unknown, createdAt?: Date): Promise<string> {
  const id = await makeUser({ email });
  await prisma.$executeRaw`update auth.users set raw_app_meta_data = ${JSON.stringify({ provider: "email", email_change: rec })}::jsonb where id = ${id}::uuid`;
  if (createdAt) await prisma.$executeRaw`update auth.users set created_at = ${createdAt} where id = ${id}::uuid`;
  return id;
}
const metaOf = async (id: string) =>
  (await prisma.$queryRaw<{ meta: Record<string, unknown> }[]>`select raw_app_meta_data as meta from auth.users where id = ${id}::uuid`)[0].meta;
const reservationExists = async (email: string) => (await prisma.waitlistEntry.count({ where: { email } })) === 1;

describe("selection", () => {
  it("selects only accounts whose email_change is an object, oldest first, soft-deleted excluded, at most the batch", async () => {
    const newer = await withRecord("n@example.test", { from: "a@example.test", to: "n@example.test" }, new Date("2026-02-01T00:00:00Z"));
    const older = await withRecord("o@example.test", { from: "a@example.test", to: "o@example.test" }, new Date("2026-01-01T00:00:00Z"));
    await withRecord("nulled@example.test", null);
    await makeUser({ email: "plain@example.test" });
    const gone = await withRecord("gone@example.test", { from: "a@example.test", to: "gone@example.test" });
    await prisma.$executeRaw`update auth.users set deleted_at = now() where id = ${gone}::uuid`;
    expect(await selectEmailChangeRecordIds()).toEqual([older, newer]);
    expect(await selectEmailChangeRecordIds(1)).toEqual([older]);
    expect(EMAIL_CHANGE_RECONCILE_BATCH).toBe(50);
  });
});

describe("reconcileEmailChanges", () => {
  it("a completed change whose move failed earlier: the reservation moves, the key is cleared (only the key)", async () => {
    const id = await withRecord("new@example.test", { from: "old@example.test", to: "new@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "old@example.test", locale: "en" } });
    const s = await reconcileEmailChanges();
    expect(s).toEqual({ seen: 1, moved: 1, cleared: 0, kept: 0, failed: 0 });
    expect(await reservationExists("old@example.test")).toBe(false);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: "new@example.test" } })).locale).toBe("en");
    expect(await metaOf(id)).toEqual({ provider: "email" });
    // idempotent: nothing left to do
    expect(await reconcileEmailChanges()).toEqual({ seen: 0, moved: 0, cleared: 0, kept: 0, failed: 0 });
  });

  it("both addresses reserved: merged (the earlier row survives at the new address)", async () => {
    await withRecord("new2@example.test", { from: "old2@example.test", to: "new2@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "old2@example.test", createdAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.waitlistEntry.create({ data: { email: "new2@example.test", createdAt: new Date("2026-05-01T00:00:00Z") } });
    expect(await reconcileEmailChanges()).toMatchObject({ seen: 1, moved: 1, failed: 0 });
    const rows = await prisma.waitlistEntry.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("new2@example.test");
    expect(rows[0].createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("an inert record (the account never changed address) is cleared and the reservation is untouched", async () => {
    const id = await withRecord("still@example.test", { from: "still@example.test", to: "never@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "still@example.test" } });
    expect(await reconcileEmailChanges()).toEqual({ seen: 1, moved: 0, cleared: 1, kept: 0, failed: 0 });
    expect(await metaOf(id)).toEqual({ provider: "email" });
    expect(await reservationExists("still@example.test")).toBe(true);
  });

  it("a change still pending (new_email set) is kept untouched", async () => {
    const id = await withRecord("p-old@example.test", { from: "p-old@example.test", to: "p-new@example.test" });
    pending.set(id, "p-new@example.test");
    expect(await reconcileEmailChanges()).toEqual({ seen: 1, moved: 0, cleared: 0, kept: 1, failed: 0 });
    expect((await metaOf(id)).email_change).toEqual({ from: "p-old@example.test", to: "p-new@example.test" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("old_address_held: nothing moves and the record stays (counted kept)", async () => {
    await makeUser({ email: "victim@example.test" });
    const id = await withRecord("mine@example.test", { from: "victim@example.test", to: "mine@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "victim@example.test" } });
    expect(await reconcileEmailChanges()).toEqual({ seen: 1, moved: 0, cleared: 0, kept: 1, failed: 0 });
    expect(await reservationExists("victim@example.test")).toBe(true);
    expect(await reservationExists("mine@example.test")).toBe(false);
    expect((await metaOf(id)).email_change).toBeTruthy();
  });

  it("one account failing (lookup error, then a failing clear) never stops the next; counts are exact", async () => {
    const a = await withRecord("a-new@example.test", { from: "a-old@example.test", to: "a-new@example.test" }, new Date("2026-01-01T00:00:00Z"));
    await withRecord("b-new@example.test", { from: "b-old@example.test", to: "b-new@example.test" }, new Date("2026-01-02T00:00:00Z"));
    await prisma.waitlistEntry.create({ data: { email: "b-old@example.test" } });
    const real = getUserById.getMockImplementation()!;
    getUserById.mockImplementation(async (id: string) =>
      id === a ? { data: { user: null }, error: { status: 500, code: "unexpected_failure" } } : real(id),
    );
    expect(await reconcileEmailChanges()).toEqual({ seen: 2, moved: 1, cleared: 0, kept: 0, failed: 1 });
    expect(await reservationExists("b-new@example.test")).toBe(true);
    expect((await metaOf(a)).email_change).toBeTruthy();
  });

  it("a throwing admin write is counted failed and does not throw", async () => {
    await withRecord("c-new@example.test", { from: "c-old@example.test", to: "c-new@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "c-old@example.test" } });
    updateUserById.mockRejectedValue(Object.assign(new Error("boom"), { code: "boom" }));
    const s = await reconcileEmailChanges();
    expect(s).toEqual({ seen: 1, moved: 0, cleared: 0, kept: 0, failed: 1 });
    // the row moved already; the next run finds the record, moves nothing more, clears it
    expect(await reservationExists("c-new@example.test")).toBe(true);
  });
});

// S10 WP4a review M3 (Kim C9): `updateSession` on an EXPIRED, not closed session
// refuses everything and changes nothing: a rename, a new closing date and a
// cleared date all answer session_closed. Real action, real Prisma, real Postgres.
// Only the cookie (Supabase server client) and Next's cache hook are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookie: { user: { id: string; email: string | null; is_anonymous: boolean } | null } = { user: null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookie.user }, error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => {} }));

import { updateSession } from "@/app/actions/sessions";
import { makeSession, makeUser, prisma, resetDb } from "./support/db";

beforeEach(async () => {
  await resetDb();
  cookie.user = null;
});

const snapshot = (id: string) =>
  prisma.cuppingSession.findUniqueOrThrow({
    where: { id },
    select: { name: true, objective: true, closesAt: true, closesAtZone: true, isAsync: true, status: true, updatedAt: true },
  });

async function expiredSession() {
  const owner = await makeUser({ name: "Owner" });
  cookie.user = { id: owner, email: "owner@example.test", is_anonymous: false };
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    samples: [{}],
    status: "active",
    closesAt: new Date(Date.now() - 3_600_000),
  });
  await prisma.cuppingSession.update({ where: { id: s.id }, data: { isAsync: true } });
  return s;
}

describe("updateSession on an expired, not closed session (Kim C9)", () => {
  it("a rename answers session_closed and changes nothing", async () => {
    const s = await expiredSession();
    const before = await snapshot(s.id);
    const r = await updateSession(s.id, { name: "Otro nombre" });
    expect(r).toEqual({ ok: false, error: "session_closed" });
    expect(await snapshot(s.id)).toEqual(before);
  });

  it("a NEW closing date answers session_closed and changes nothing (nothing reopens)", async () => {
    const s = await expiredSession();
    const before = await snapshot(s.id);
    const future = new Date(Date.now() + 5 * 24 * 3_600_000).toISOString().slice(0, 10);
    const r = await updateSession(s.id, { closesAt: future, closesAtZone: "UTC" });
    expect(r).toEqual({ ok: false, error: "session_closed" });
    expect(await snapshot(s.id)).toEqual(before);
  });

  it("a CLEARED closing date answers session_closed and changes nothing", async () => {
    const s = await expiredSession();
    const before = await snapshot(s.id);
    const r = await updateSession(s.id, { closesAt: null });
    expect(r).toEqual({ ok: false, error: "session_closed" });
    const after = await snapshot(s.id);
    expect(after).toEqual(before);
    expect(after.closesAt).not.toBeNull();
    expect(after.isAsync).toBe(true);
  });

  it("control: the same rename on a session whose date is still in the future is accepted", async () => {
    const owner = await makeUser({ name: "Owner" });
    cookie.user = { id: owner, email: "owner@example.test", is_anonymous: false };
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      samples: [{}],
      closesAt: new Date(Date.now() + 5 * 24 * 3_600_000),
    });
    const r = await updateSession(s.id, { name: "Otro nombre" });
    expect(r.ok).toBe(true);
    expect((await snapshot(s.id)).name).toBe("Otro nombre");
  });
});

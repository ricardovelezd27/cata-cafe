// S10 WP5a (F-cafes-9, review M1 + L1) against Postgres:
//  - Coffee.originEditedAt is stamped ONLY when an origin field really changes
//    (updateCoffee); notes, name, visibility and publish never stamp it.
//  - the stale coffee save is atomic: two saves from the same loaded version,
//    the second gets `conflict` and the first one's data is intact.
// Only external boundaries are mocked (auth user, next cache).
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

import { setCoffeeResultsPublished, setCoffeeVisibility, updateCoffee } from "@/app/actions/coffees";
import { originEditedAfterClose } from "@/lib/originEdit";
import { makeCoffee, makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

async function load(id: string) {
  return prisma.coffee.findUniqueOrThrow({ where: { id } });
}

describe("updateCoffee stamps originEditedAt only for origin fields", () => {
  it("notes, name, visibility and publish leave it NULL; changing the country stamps it", async () => {
    const owner = await makeUser({ name: "Dueña" });
    h.userId = owner;
    const coffee = await makeCoffee(owner, "Huila lote 7");

    let row = await load(coffee.id);
    expect(row.originEditedAt).toBeNull();

    // notes + name only
    let r = await updateCoffee(coffee.id, {
      name: "Huila lote 7 bis",
      country: "Colombia",
      notes: "nota privada",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(r).toEqual({ ok: true });
    row = await load(coffee.id);
    expect(row.originEditedAt).toBeNull();
    expect(row.notes).toBe("nota privada");

    // visibility and publish
    await setCoffeeVisibility(coffee.id, "public");
    await setCoffeeResultsPublished(coffee.id, true);
    row = await load(coffee.id);
    expect(row.originEditedAt).toBeNull();

    // a real origin change
    r = await updateCoffee(coffee.id, {
      name: row.name,
      country: "Perú",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(r).toEqual({ ok: true });
    row = await load(coffee.id);
    expect(row.originEditedAt).not.toBeNull();
    expect(row.country).toBe("Perú");

    // the results/ficha note follows: after a session close before the edit, it shows
    const closed = new Date(row.originEditedAt!.getTime() - 60_000);
    expect(
      originEditedAfterClose({ closedAt: closed, coffeeOriginEditedAt: row.originEditedAt }),
    ).toEqual(row.originEditedAt);
  });
});

describe("updateCoffee is an atomic compare-and-set (review L1)", () => {
  it("two saves from the same loaded version: the second is a conflict, the first stays intact", async () => {
    const owner = await makeUser({ name: "Dueña" });
    h.userId = owner;
    const coffee = await makeCoffee(owner, "Nariño");
    const loaded = (await load(coffee.id)).updatedAt.toISOString();

    const first = await updateCoffee(coffee.id, {
      name: "Nariño",
      country: "Colombia",
      region: "Primera",
      expectedUpdatedAt: loaded,
    });
    const second = await updateCoffee(coffee.id, {
      name: "Nariño",
      country: "Colombia",
      region: "Segunda",
      expectedUpdatedAt: loaded,
    });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, error: "conflict" });
    expect((await load(coffee.id)).region).toBe("Primera");
  });

  it("a save without a loaded version is refused, and another user's coffee stays forbidden", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const other = await makeUser({ name: "Otro" });
    const coffee = await makeCoffee(owner, "Café");
    h.userId = owner;
    const noVersion = await updateCoffee(coffee.id, {
      name: "Café",
      expectedUpdatedAt: undefined as unknown as string,
    });
    expect(noVersion.ok).toBe(false);
    h.userId = other;
    const stolen = await updateCoffee(coffee.id, {
      name: "Hack",
      expectedUpdatedAt: (await load(coffee.id)).updatedAt.toISOString(),
    });
    expect(stolen.ok).toBe(false);
    expect((await load(coffee.id)).name).toBe("Café");
  });
});

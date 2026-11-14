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
import { updateSampleMetadata } from "@/app/actions/sessions";
import { makeCoffee, makeSession, makeUser, prisma, resetDb } from "./support/db";

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

// S10 WP6 B1: the stamp in updateSampleMetadata (the sample editor), which the second
// review showed could be neutralised with every test still green.
describe("updateSampleMetadata stamps originEditedAt only when an origin field changes", () => {
  it("a label-only edit leaves it NULL; changing the country stamps it; same value again does not move it", async () => {
    const owner = await makeUser({ name: "Dueña" });
    h.userId = owner;
    const coffee = await makeCoffee(owner, "Huila");
    const s = await makeSession({ ownerId: owner, samples: [{ coffeeId: coffee.id }] });
    const sampleId = s.samples[0].id;

    // label only
    expect(await updateSampleMetadata(sampleId, { label: "Muestra renombrada" })).toEqual({
      ok: true,
      coffeeUpdated: true,
    });
    expect((await load(coffee.id)).originEditedAt).toBeNull();

    // name only is not origin data either
    await updateSampleMetadata(sampleId, { name: "Huila lote 8" });
    expect((await load(coffee.id)).originEditedAt).toBeNull();

    // a real origin change
    await updateSampleMetadata(sampleId, { country: "Perú" });
    const stamped = await load(coffee.id);
    expect(stamped.country).toBe("Perú");
    expect(stamped.originEditedAt).not.toBeNull();

    // re-sending the stored value changes nothing and keeps the stamp where it was
    await updateSampleMetadata(sampleId, { country: "Perú" });
    expect((await load(coffee.id)).originEditedAt?.getTime()).toBe(stamped.originEditedAt!.getTime());
  });
});

describe("updateCoffee is an atomic compare-and-set (review L1)", () => {
  it("two REAL parallel saves from the same loaded version: exactly one ok, one conflict, the stored row is the winner's", async () => {
    // Deterministic (S10 WP6 fix round, 3): a TEST-ONLY trigger holds the first save's row lock
    // for 700 ms, so the second save always arrives while the first is still in flight. With the
    // `updatedAt` guard the second re-checks its WHERE after the first commits and loses; without
    // it both would succeed.
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION public.aa_test_sleep_coffee() RETURNS trigger LANGUAGE plpgsql AS
       $f$ BEGIN PERFORM pg_sleep(0.7); RETURN NEW; END $f$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER aa_test_sleep_coffee BEFORE UPDATE ON public.coffees FOR EACH ROW
       WHEN (OLD.region IS DISTINCT FROM NEW.region) EXECUTE FUNCTION public.aa_test_sleep_coffee()`,
    );
    try {
      for (let round = 0; round < 3; round++) {
        await resetDb();
        const owner = await makeUser({ name: "Dueña" });
        h.userId = owner;
        const coffee = await makeCoffee(owner, "Nariño");
        const loaded = (await load(coffee.id)).updatedAt.toISOString();
        const save = (region: string) =>
          updateCoffee(coffee.id, { name: "Nariño", country: "Colombia", region, expectedUpdatedAt: loaded });
        const [a, b] = await Promise.all([save("Primera"), save("Segunda")]);
        const results = [a, b];
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "conflict" }]);
        const winner = a.ok ? "Primera" : "Segunda";
        expect((await load(coffee.id)).region).toBe(winner);
      }
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS aa_test_sleep_coffee ON public.coffees`);
    }
  }, 60_000);

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

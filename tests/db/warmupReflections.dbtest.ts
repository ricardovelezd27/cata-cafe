// S10 WP7 review (F2): the per-person, per-exercise cap on private warm-up
// reflections, counted in the same transaction as the insert.
import { beforeEach, describe, expect, it } from "vitest";
import { REFLECTIONS_PER_EXERCISE_MAX } from "@/lib/warmup/reflections";
import { saveReflectionCapped } from "@/lib/warmup/reflectionsData";
import { makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

const input = (exerciseId: "eyes" | "arm-raise", feel = "tranquilo") => ({ exerciseId, feel, discovery: null });

async function fill(userId: string, exerciseId: string, n: number) {
  await prisma.warmupReflection.createMany({ data: Array.from({ length: n }, () => ({ userId, exerciseId, feel: "x" })) });
}

describe("saveReflectionCapped", () => {
  it("accepts up to the cap and refuses the next one with reflection_limit", async () => {
    const u = await makeUser();
    await fill(u, "eyes", REFLECTIONS_PER_EXERCISE_MAX - 1);
    await expect(saveReflectionCapped(u, input("eyes"))).resolves.toHaveProperty("id");
    expect(await prisma.warmupReflection.count({ where: { userId: u, exerciseId: "eyes" } })).toBe(REFLECTIONS_PER_EXERCISE_MAX);
    await expect(saveReflectionCapped(u, input("eyes"))).rejects.toThrow("reflection_limit");
    expect(await prisma.warmupReflection.count({ where: { userId: u, exerciseId: "eyes" } })).toBe(REFLECTIONS_PER_EXERCISE_MAX);
  });

  it("the cap is per exercise and per person", async () => {
    const u = await makeUser();
    const other = await makeUser();
    await fill(u, "eyes", REFLECTIONS_PER_EXERCISE_MAX);
    await expect(saveReflectionCapped(u, input("arm-raise"))).resolves.toHaveProperty("id");
    await expect(saveReflectionCapped(other, input("eyes"))).resolves.toHaveProperty("id");
  });

  it("simultaneous saves at the edge cannot overshoot the cap", async () => {
    const u = await makeUser();
    await fill(u, "eyes", REFLECTIONS_PER_EXERCISE_MAX - 2);
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => saveReflectionCapped(u, input("eyes"))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.message === "reflection_limit")).toBe(true);
    expect(await prisma.warmupReflection.count({ where: { userId: u, exerciseId: "eyes" } })).toBe(REFLECTIONS_PER_EXERCISE_MAX);
  });

  it("deleting one frees a slot", async () => {
    const u = await makeUser();
    await fill(u, "eyes", REFLECTIONS_PER_EXERCISE_MAX);
    await expect(saveReflectionCapped(u, input("eyes"))).rejects.toThrow("reflection_limit");
    const one = await prisma.warmupReflection.findFirstOrThrow({ where: { userId: u } });
    await prisma.warmupReflection.delete({ where: { id: one.id } });
    await expect(saveReflectionCapped(u, input("eyes"))).resolves.toHaveProperty("id");
  });
});

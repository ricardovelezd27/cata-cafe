"use server";

import { prisma } from "@/lib/prisma";
import { requireRegisteredUser } from "@/lib/auth";
import * as v from "@/lib/validate";
import { run } from "@/lib/safeAction";
import { parseReflectionInput } from "@/lib/warmup/reflections";
import { saveReflectionCapped } from "@/lib/warmup/reflectionsData";

// Private warm-up reflections (S10 WP7, Kim F2). Both actions act on the
// signed-in person's OWN rows only: the user id always comes from the session,
// never from the client, and nothing here (or anywhere) lets another person,
// an admin, an export or an AI prompt read them.

/** Saves the two (optional) answers to the closing questions of an exercise. */
export async function saveWarmupReflection(input: { exerciseId: string; feel: string; discovery: string }) {
  return run("saveWarmupReflection", async () => {
    const user = await requireRegisteredUser();
    const parsed = parseReflectionInput(input);
    // At most REFLECTIONS_PER_EXERCISE_MAX per person per exercise, counted in
    // the same transaction as the insert (throws `reflection_limit`).
    return saveReflectionCapped(user.id, parsed);
  });
}

/** Deletes one of the caller's reflections (scoped by user id). */
export async function deleteWarmupReflection(id: string) {
  return run("deleteWarmupReflection", async () => {
    const user = await requireRegisteredUser();
    const rowId = v.str(id, "id", { max: 64 }) as string;
    const { count } = await prisma.warmupReflection.deleteMany({ where: { id: rowId, userId: user.id } });
    if (count === 0) throw new Error("not_found_or_forbidden");
    return { id: rowId };
  });
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { isWarmupId } from "./exercises";
import { REFLECTIONS_PER_EXERCISE_MAX, type ReflectionInput } from "./reflections";

// The ONLY read path for warm-up reflections (S10 WP7, Kim F2). It takes the
// signed-in person's id and returns that person's rows: no other helper, route,
// analytics query, admin view, export or AI prompt may read `warmup_reflections`.
// Not a server action (a read helper with a user id; see CLAUDE.md).

export interface WarmupReflectionRow {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  feel: string | null;
  discovery: string | null;
}

/** How many reflections the exercise page lists. */
export const REFLECTIONS_LIST_LIMIT = 50;

export async function getWarmupReflections(userId: string, exerciseId: string): Promise<WarmupReflectionRow[]> {
  if (!isWarmupId(exerciseId)) return [];
  const rows = await prisma.warmupReflection.findMany({
    where: { userId, exerciseId },
    orderBy: { createdAt: "desc" },
    take: REFLECTIONS_LIST_LIMIT,
    select: { id: true, createdAt: true, feel: true, discovery: true },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), feel: r.feel, discovery: r.discovery }));
}

/**
 * Creates one reflection for `userId`, refusing (`reflection_limit`) when the
 * person already has REFLECTIONS_PER_EXERCISE_MAX for that exercise. The count
 * and the insert run in ONE transaction, serialised per (person, exercise) by a
 * transaction-level advisory lock, so simultaneous saves cannot overshoot.
 * The caller authorises first (`requireRegisteredUser`); `userId` never comes
 * from the client.
 */
export async function saveReflectionCapped(userId: string, input: ReflectionInput): Promise<{ id: string }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '4000ms'");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"warmup-reflection:" + userId + ":" + input.exerciseId}, 0))`;
      const count = await tx.warmupReflection.count({ where: { userId, exerciseId: input.exerciseId } });
      if (count >= REFLECTIONS_PER_EXERCISE_MAX) throw new Error("reflection_limit");
      return tx.warmupReflection.create({
        data: { userId, exerciseId: input.exerciseId, feel: input.feel, discovery: input.discovery },
        select: { id: true },
      });
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

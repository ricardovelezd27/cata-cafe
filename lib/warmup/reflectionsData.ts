import "server-only";

import { prisma } from "@/lib/prisma";
import { isWarmupId } from "./exercises";

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

import "server-only";

import { prisma } from "@/lib/prisma";
import { exactEmailMatches } from "@/lib/accountDeletion/plan";

export type WaitlistMoveResult = "moved" | "no_row" | "target_exists" | "same";

/**
 * Moves the founding-seat reservation of `from` to `to` after a COMPLETED email
 * change (confirmEmailToken), so a used account keeps its reservation. Only when
 * a row exists for the old address and none for the new one. Exact,
 * case-insensitive match (never a pattern). Never throws for an expected
 * outcome; the caller still wraps it so a failure cannot break the sign-in.
 */
export async function moveWaitlistEntry(from: string, to: string): Promise<WaitlistMoveResult> {
  const a = from.trim().toLowerCase();
  const b = to.trim().toLowerCase();
  if (!a || !b || a === b) return "same";
  try {
    return await prisma.$transaction(async (tx) => {
      const olds = exactEmailMatches(
        await tx.waitlistEntry.findMany({
          where: { email: { equals: a, mode: "insensitive" } },
          select: { id: true, email: true },
        }),
        a,
      );
      if (olds.length === 0) return "no_row";
      const news = exactEmailMatches(
        await tx.waitlistEntry.findMany({
          where: { email: { equals: b, mode: "insensitive" } },
          select: { id: true, email: true },
        }),
        b,
      );
      if (news.length > 0) return "target_exists";
      await tx.waitlistEntry.update({ where: { id: olds[0].id }, data: { email: b } });
      return "moved";
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === "P2002") return "target_exists";
    throw err;
  }
}

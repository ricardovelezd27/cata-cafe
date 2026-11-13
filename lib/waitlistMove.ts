import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/emailChangeRules";
import { exactEmailMatches } from "@/lib/accountDeletion/plan";
import { planWaitlistMerge } from "@/lib/waitlistMoveRules";

/** `merged`: both addresses had a reservation (the same person's, they proved
 *  control of the new one); the earlier row was kept at the new address and the
 *  other deleted (S10 leftovers A2). `target_exists` is now only the fallback
 *  for an ambiguous case (more than one row on a side) or a lost race: nothing
 *  was changed. */
export type WaitlistMoveResult = "moved" | "merged" | "no_row" | "target_exists" | "same";

const PICK = { id: true, email: true, createdAt: true, consentAt: true, consentNoticeVersion: true } as const;

/**
 * Moves the founding-seat reservation of `from` to `to` after a COMPLETED email
 * change (confirmEmailToken), so a used account keeps its reservation. When a
 * row exists for the old address and none for the new one it is re-addressed;
 * when BOTH exist the earlier one is kept at the new address and the other is
 * deleted in the same transaction (`planWaitlistMerge`). Exact,
 * case-insensitive match (never a pattern). Never throws for an expected
 * outcome; the caller still wraps it so a failure cannot break the sign-in.
 */
export async function moveWaitlistEntry(from: string, to: string): Promise<WaitlistMoveResult> {
  const a = normalizeAddress(from);
  const b = normalizeAddress(to);
  if (!a || !b || a === b) return "same";
  try {
    return await prisma.$transaction(async (tx) => {
      const olds = exactEmailMatches(
        await tx.waitlistEntry.findMany({
          where: { email: { equals: a, mode: "insensitive" } },
          select: PICK,
        }),
        a,
      );
      if (olds.length === 0) return "no_row";
      const news = exactEmailMatches(
        await tx.waitlistEntry.findMany({
          where: { email: { equals: b, mode: "insensitive" } },
          select: PICK,
        }),
        b,
      );
      if (news.length > 0) {
        // Only the plain case (exactly one row on each side) is merged; any
        // other shape changes nothing.
        if (olds.length !== 1 || news.length !== 1) return "target_exists";
        const plan = planWaitlistMerge(olds[0], news[0]);
        // Delete first: the address is unique and the kept row may be the old one.
        await tx.waitlistEntry.delete({ where: { id: plan.deleteId } });
        await tx.waitlistEntry.update({
          where: { id: plan.keepId },
          data: { email: b, ...(plan.adoptConsent ?? {}) },
        });
        return "merged";
      }
      await tx.waitlistEntry.update({ where: { id: olds[0].id }, data: { email: b } });
      return "moved";
    });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === "P2002") return "target_exists";
    throw err;
  }
}

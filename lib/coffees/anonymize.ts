import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";
import { ANONYMIZED_COFFEE_DATA } from "@/lib/coffeeAnonymize";

/**
 * The anonymizing "delete" of a coffee, inside the caller's transaction:
 * identifying fields wiped (lib/coffeeAnonymize.ts), deletedAt stamped, shares
 * and invites removed. Never a row delete: evaluations, aggregates, samples
 * and history keep pointing at the row. Shared by deleteCoffees (a chosen list)
 * and deleteAccount (every live coffee the person owns, `ids` omitted).
 *
 * Authorization is the caller's: the `createdBy` predicate only scopes the
 * write to the owner's rows.
 */
export async function anonymizeOwnedCoffees(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids?: string[],
): Promise<number> {
  const owned = await tx.coffee.findMany({
    where: { createdBy: ownerId, deletedAt: null, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true },
  });
  const ownedIds = owned.map((c) => c.id);
  if (ownedIds.length === 0) return 0;

  const { count } = await tx.coffee.updateMany({
    where: { id: { in: ownedIds }, createdBy: ownerId, deletedAt: null },
    data: { ...ANONYMIZED_COFFEE_DATA, deletedAt: new Date() },
  });
  await tx.coffeeShare.deleteMany({ where: { coffeeId: { in: ownedIds } } });
  await tx.coffeeInvite.deleteMany({ where: { coffeeId: { in: ownedIds } } });
  return count;
}

import type { Prisma } from "@/app/generated/prisma/client";

export type CoffeeVisibility = "private" | "shared" | "public";

export const COFFEE_VISIBILITIES: readonly CoffeeVisibility[] = [
  "private",
  "shared",
  "public",
] as const;

export function isCoffeeVisibility(v: unknown): v is CoffeeVisibility {
  return (COFFEE_VISIBILITIES as readonly string[]).includes(v as string);
}

/** Upper bound on ids per deleteCoffees / getCoffeeDeleteImpact call. The
 *  bulk toolbar disables its button above this; the server rejects it. */
export const MAX_BULK_COFFEE_DELETE = 100;

/** "Not anonymized" — the filter every coffee READ applies, including the
 *  super-admin `all` branches that bypass usableCoffeeWhere. */
export const liveCoffeeWhere: Prisma.CoffeeWhereInput = { deletedAt: null };

// Single source of truth for "coffees this user may view and use in their own
// sessions": owned + public + shared-with-me, and never anonymized
// (deletedAt set by deleteCoffees — see lib/coffeeAnonymize.ts). Share rows
// only count while the coffee is actually in "shared" state — flipping a
// coffee back to private makes its shares inert without deleting them.
// Mirrors the coffees_select RLS policy (prisma/sql/rls_and_triggers.sql
// PHASE 16 + PHASE 20).
export function usableCoffeeWhere(userId: string): Prisma.CoffeeWhereInput {
  return {
    deletedAt: null,
    OR: [
      { createdBy: userId },
      { visibility: "public" },
      { visibility: "shared", shares: { some: { userId } } },
    ],
  };
}

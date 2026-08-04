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

// Single source of truth for "coffees this user may view and use in their own
// sessions": owned + public + shared-with-me. Share rows only count while the
// coffee is actually in "shared" state — flipping a coffee back to private
// makes its shares inert without deleting them. Mirrors the coffees_select
// RLS policy (prisma/sql/rls_and_triggers.sql PHASE 15).
export function usableCoffeeWhere(userId: string): Prisma.CoffeeWhereInput {
  return {
    OR: [
      { createdBy: userId },
      { visibility: "public" },
      { visibility: "shared", shares: { some: { userId } } },
    ],
  };
}

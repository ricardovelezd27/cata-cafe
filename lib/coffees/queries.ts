import "server-only";

// These are read helpers keyed by a caller-supplied `userId`. They must NEVER
// live in a "use server" actions file: every export in a "use server" module
// is an independently POST-able HTTP endpoint, and neither function performs
// its own authentication — they trust `userId` to already be the caller's own
// (verified) id. Only call them from server-only code (Server Components,
// route handlers, other server-only libs) that has already resolved `userId`
// from a trusted source (e.g. `supabase.auth.getUser()`), never from a
// client-supplied value. See CLAUDE.md's Auth Pattern section.

import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { prisma } from "@/lib/prisma";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";

// opts.all — super-admin "god mode": drops the visibility filter entirely
// (see lib/analytics/access.ts isSuperAdminEmail, gated in the page). A single
// select shape for both paths keeps the return type uniform; `creator` is only
// rendered in admin mode but selecting it unconditionally is a cheap join and
// avoids a union type at the call site.
export async function getCoffeesWithStats(
  userId: string,
  opts?: { all?: boolean },
) {
  // God mode is re-verified HERE, never trusted from the caller: this module
  // is only reachable from trusted server-side code, but the `all` flag
  // itself must still be checked against the real signed-in user rather than
  // whatever the call site passes in (same rule as lib/analytics/access.ts
  // documents). Non-admins asking for `all` silently get the normal filtered
  // view.
  let all = false;
  if (opts?.all) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    all = !!user && isSuperAdminEmail(user.email);
  }

  return prisma.coffee.findMany({
    where: all ? {} : usableCoffeeWhere(userId),
    select: {
      id: true,
      name: true,
      code: true,
      country: true,
      region: true,
      variety: true,
      processType: true,
      visibility: true,
      createdBy: true,
      creator: { select: { displayName: true } },
      _count: { select: { sessionSamples: true } },
      coffeeHistory: {
        where: { userId },
        orderBy: { tastedAt: "desc" },
        take: 1,
        select: { tastedAt: true, individualScore: true, communityScore: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

// ─── Coffees the user may attach to a new session ─────────────────────────────
// Owned + public + shared-with-me, in picker-friendly shape. Powers the
// "Usar café existente" picker in the new-session wizard; the same
// usableCoffeeWhere filter re-validates picked ids server-side in
// createSession/createGroupSession (app/actions/sessions.ts).
export async function getUsableCoffees(userId: string) {
  return prisma.coffee.findMany({
    where: usableCoffeeWhere(userId),
    select: {
      id: true,
      name: true,
      code: true,
      producer: true,
      variety: true,
      altitude: true,
      roastLevel: true,
      country: true,
      region: true,
      processType: true,
      createdBy: true,
      visibility: true,
    },
    orderBy: { name: "asc" },
  });
}

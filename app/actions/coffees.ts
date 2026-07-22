"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// opts.all — super-admin "god mode": drops the visibility filter entirely
// (see lib/analytics/access.ts isSuperAdminEmail, gated in the page). A single
// select shape for both paths keeps the return type uniform; `creator` is only
// rendered in admin mode but selecting it unconditionally is a cheap join and
// avoids a union type at the call site.
export async function getCoffeesWithStats(
  userId: string,
  opts?: { all?: boolean },
) {
  // God mode is re-verified HERE, never trusted from the caller: "use server"
  // exports are independently POST-able endpoints, so an internal check is
  // mandatory even though the page already gates (same rule as
  // lib/analytics/access.ts documents). Non-admins asking for `all` silently
  // get the normal filtered view.
  let all = false;
  if (opts?.all) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    all = !!user && isSuperAdminEmail(user.email);
  }

  return prisma.coffee.findMany({
    where: all ? {} : { OR: [{ isPublic: true }, { createdBy: userId }] },
    select: {
      id: true,
      name: true,
      country: true,
      region: true,
      variety: true,
      processType: true,
      isPublic: true,
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

// ─── Publish / unpublish a coffee's community results (owner only) ────────────
// Controls whether non-owners can see the aggregated results section (scores,
// attribute averages, flavor cloud) on the coffee profile page. See
// app/[locale]/app/coffees/[id]/page.tsx for the visibility gate.
export async function setCoffeeResultsPublished(
  coffeeId: string,
  published: boolean,
): Promise<{ ok: true; resultsPublished: boolean }> {
  const user = await requireUser();

  const coffee = await prisma.coffee.findUnique({
    where: { id: coffeeId },
    select: { createdBy: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.coffee.update({
    where: { id: coffeeId },
    data: {
      resultsPublished: published,
      resultsPublishedAt: published ? new Date() : null,
    },
  });

  revalidatePath(`/es/app/coffees/${coffeeId}`);
  revalidatePath(`/en/app/coffees/${coffeeId}`);
  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  return { ok: true, resultsPublished: published };
}

// ─── Toggle a coffee record's visibility (owner only) ─────────────────────────
// Controls whether the coffee record itself (profile page + list entry) is
// visible to non-owners at all. See the access gate in
// app/[locale]/app/coffees/[id]/page.tsx (findFirst OR [isPublic, createdBy])
// and the list query in getCoffeesWithStats above.
export async function setCoffeeVisibility(
  coffeeId: string,
  isPublic: boolean,
): Promise<{ ok: true; isPublic: boolean }> {
  const user = await requireUser();

  const coffee = await prisma.coffee.findUnique({
    where: { id: coffeeId },
    select: { createdBy: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.coffee.update({
    where: { id: coffeeId },
    data: { isPublic },
  });

  revalidatePath(`/es/app/coffees/${coffeeId}`);
  revalidatePath(`/en/app/coffees/${coffeeId}`);
  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  return { ok: true, isPublic };
}

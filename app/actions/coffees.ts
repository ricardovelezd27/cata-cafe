"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
    update: {},
  });
  return user;
}

export async function getCoffeesWithStats(userId: string) {
  return prisma.coffee.findMany({
    where: { OR: [{ isPublic: true }, { createdBy: userId }] },
    select: {
      id: true,
      name: true,
      country: true,
      region: true,
      variety: true,
      processType: true,
      isPublic: true,
      createdBy: true,
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

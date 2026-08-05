"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  isCoffeeVisibility,
  usableCoffeeWhere,
  type CoffeeVisibility,
} from "@/lib/coffeeAccess";

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
    where: all ? {} : usableCoffeeWhere(userId),
    select: {
      id: true,
      name: true,
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

// ─── Create a coffee as a standalone reusable asset ───────────────────────────
// Returns a value instead of redirect()ing (createGroupSession pattern) so the
// form can surface errors and router.push to the new profile on success.
export async function createCoffee(input: {
  name: string;
  country?: string;
  region?: string;
  farm?: string;
  producer?: string;
  species?: string;
  variety?: string;
  harvestYear?: string;
  processType?: string;
  altitude?: string;
  roastLevel?: string;
  certifications?: string[];
  notes?: string;
  visibility: CoffeeVisibility;
}): Promise<{ ok: true; coffeeId: string } | { ok: false; error: string }> {
  const user = await requireUser();

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "name_required" };
  if (!isCoffeeVisibility(input.visibility)) {
    return { ok: false, error: "invalid_visibility" };
  }

  const coffee = await prisma.coffee.create({
    data: {
      name,
      country: input.country?.trim() || null,
      region: input.region?.trim() || null,
      farm: input.farm?.trim() || null,
      producer: input.producer?.trim() || null,
      species: input.species?.trim() || null,
      variety: input.variety?.trim() || null,
      harvestYear: input.harvestYear?.trim() || null,
      processType: input.processType?.trim() || null,
      altitude: input.altitude?.trim() || null,
      roastLevel: input.roastLevel?.trim() || null,
      certifications: input.certifications ?? [],
      notes: input.notes?.trim() || null,
      createdBy: user.id,
      visibility: input.visibility,
    },
    select: { id: true },
  });

  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  return { ok: true, coffeeId: coffee.id };
}

// ─── Share a coffee via invite link (owner only) ──────────────────────────────
// Generating a link on a private coffee flips it to "shared" in the same call
// — creating a link IS the intent to share. Reuses the newest still-valid
// invite so repeated clicks don't mint token litter (mirrors createInviteToken
// in app/actions/community.ts otherwise).
export async function createCoffeeInvite(
  coffeeId: string,
): Promise<{ token: string }> {
  const user = await requireUser();

  const coffee = await prisma.coffee.findUnique({
    where: { id: coffeeId },
    select: { createdBy: true, visibility: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  if (coffee.visibility === "private") {
    await prisma.coffee.update({
      where: { id: coffeeId },
      data: { visibility: "shared" },
    });
    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
  }

  const existing = await prisma.coffeeInvite.findFirst({
    where: {
      coffeeId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (
    existing &&
    (existing.maxUses === null || existing.useCount < existing.maxUses)
  ) {
    return { token: existing.token };
  }

  const token = crypto.randomUUID();
  await prisma.coffeeInvite.create({
    data: { coffeeId, token, createdBy: user.id },
  });
  return { token };
}

// ─── Accept a coffee-share invite (any logged-in user) ────────────────────────
// Token is validated server-side, then the share is written via Prisma
// (postgres role — RLS on coffee_shares is read-only by design; see
// rls_and_triggers.sql PHASE 16). A private coffee rejects its outstanding
// tokens: flipping to private instantly kills every link.
export async function joinCoffeeViaToken(token: string, locale: string = "es") {
  const user = await requireUser();

  const invite = await prisma.coffeeInvite.findUnique({
    where: { token },
    include: { coffee: { select: { id: true, createdBy: true, visibility: true } } },
  });

  if (!invite || invite.coffee.visibility === "private") {
    throw new Error("invalid_token");
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error("token_expired");
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    throw new Error("token_exhausted");
  }

  const coffeeId = invite.coffee.id;

  // The owner opening their own link just lands on the profile — no share row.
  if (invite.coffee.createdBy !== user.id) {
    await prisma.$transaction(async (tx) => {
      const already = await tx.coffeeShare.findUnique({
        where: { coffeeId_userId: { coffeeId, userId: user.id } },
        select: { userId: true },
      });
      if (already) return; // re-opening the link is a no-op, not a "use"
      await tx.coffeeShare.create({ data: { coffeeId, userId: user.id } });
      await tx.coffeeInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });
    });
    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
    revalidatePath("/es/app/coffees");
    revalidatePath("/en/app/coffees");
  }

  redirect(`/${locale}/app/coffees/${coffeeId}`);
}

// ─── Revoke a person's access to a shared coffee (owner only) ─────────────────
export async function revokeCoffeeShare(
  coffeeId: string,
  userId: string,
): Promise<{ ok: true }> {
  const user = await requireUser();

  const coffee = await prisma.coffee.findUnique({
    where: { id: coffeeId },
    select: { createdBy: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.coffeeShare.deleteMany({ where: { coffeeId, userId } });

  revalidatePath(`/es/app/coffees/${coffeeId}`);
  revalidatePath(`/en/app/coffees/${coffeeId}`);
  return { ok: true };
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

// ─── Set a coffee record's visibility tier (owner only) ───────────────────────
// "private" — only the owner sees the record; "shared" — owner + users holding
// a CoffeeShare row (granted via invite link); "public" — everyone. Controls
// the record itself (profile page + list entry); see the access gate in
// app/[locale]/app/coffees/[id]/page.tsx (usableCoffeeWhere) and the list
// query in getCoffeesWithStats above.
export async function setCoffeeVisibility(
  coffeeId: string,
  visibility: CoffeeVisibility,
): Promise<{ ok: true; visibility: CoffeeVisibility }> {
  const user = await requireUser();
  // Public POST endpoint — never trust the caller's string.
  if (!isCoffeeVisibility(visibility)) throw new Error("invalid_visibility");

  const coffee = await prisma.coffee.findUnique({
    where: { id: coffeeId },
    select: { createdBy: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.coffee.update({
    where: { id: coffeeId },
    data: { visibility },
  });

  revalidatePath(`/es/app/coffees/${coffeeId}`);
  revalidatePath(`/en/app/coffees/${coffeeId}`);
  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  return { ok: true, visibility };
}

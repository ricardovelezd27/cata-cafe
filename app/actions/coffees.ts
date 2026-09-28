"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { withCodeRetry } from "@/lib/coffeeCode";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import { idList } from "@/lib/validate";
import { ANONYMIZED_COFFEE_DATA } from "@/lib/coffeeAnonymize";
import {
  isCoffeeVisibility,
  usableCoffeeWhere,
  MAX_BULK_COFFEE_DELETE,
  type CoffeeVisibility,
} from "@/lib/coffeeAccess";

// ─── Delete (anonymize) coffees — OWNER ONLY ──────────────────────────────────
// "Delete" never removes the row. The owner's coffee is anonymized instead:
// identifying fields (name, code, farm, producer, notes, certifications) are
// wiped (lib/coffeeAnonymize.ts), sharing state reset, shares + invites
// removed and deletedAt stamped. Everything derived from a tasting keeps
// pointing at the row — evaluations, aggregate scores, session samples,
// user_coffee_history — so insights can still correlate perceived notes and
// quality with the analytical attributes (country, variety, process…).
// usableCoffeeWhere hides the row from lists/pickers/profile; display sites
// fall back to "Café eliminado" because a live coffee never has a blank name.
//
// Authorization: the `createdBy: user.id` predicate on the updateMany IS the
// gate. Nobody else — super-admin included — can anonymize a coffee.

export type DeleteCoffeesResult = { deleted: number; skipped: number };

export async function deleteCoffees(
  coffeeIds: string[],
): Promise<ActionResult<DeleteCoffeesResult>> {
  return run(
    "deleteCoffees",
    async () => {
      const user = await requireUser();
      const ids = idList(coffeeIds, "coffeeIds", MAX_BULK_COFFEE_DELETE);

      const deleted = await prisma.$transaction(async (tx) => {
        const owned = await tx.coffee.findMany({
          where: { id: { in: ids }, createdBy: user.id, deletedAt: null },
          select: { id: true },
        });
        const ownedIds = owned.map((c) => c.id);
        if (ownedIds.length === 0) return 0;

        const { count } = await tx.coffee.updateMany({
          where: { id: { in: ownedIds }, createdBy: user.id, deletedAt: null },
          data: { ...ANONYMIZED_COFFEE_DATA, deletedAt: new Date() },
        });
        await tx.coffeeShare.deleteMany({ where: { coffeeId: { in: ownedIds } } });
        await tx.coffeeInvite.deleteMany({ where: { coffeeId: { in: ownedIds } } });
        return count;
      });

      // A tampered / stale request must never read as a silent success.
      if (deleted === 0) throw new Error("not_found_or_forbidden");

      for (const l of ["es", "en"]) {
        revalidatePath(`/${l}/app`);
        revalidatePath(`/${l}/app/coffees`);
        revalidatePath(`/${l}/app/profile`);
        revalidatePath(`/${l}/app/profile/history`);
        for (const id of ids) revalidatePath(`/${l}/app/coffees/${id}`);
      }

      return { deleted, skipped: ids.length - deleted };
    },
    { coffeeId: coffeeIds?.[0] },
  );
}

/** Single-coffee form of deleteCoffees — one code path for the profile page,
 *  the table row and the bulk toolbar. */
export async function deleteCoffee(
  coffeeId: string,
): Promise<ActionResult<DeleteCoffeesResult>> {
  return deleteCoffees([coffeeId]);
}

/** What the confirm dialog shows BEFORE anonymizing: how much tasting data
 *  stays linked to the coffees (it is never removed — that is the point). */
export type CoffeeDeleteImpact = {
  /** Owned, not-yet-deleted ids among the request — what will be anonymized. */
  coffees: number;
  /** Distinct sessions with at least one sample of these coffees. */
  sessions: number;
  /** session_samples rows that keep their evaluations and lose only the name. */
  samples: number;
  /** Distinct cuppers with a user_coffee_history row for these coffees. */
  cuppers: number;
};

export async function getCoffeeDeleteImpact(
  coffeeIds: string[],
): Promise<ActionResult<CoffeeDeleteImpact>> {
  return run(
    "getCoffeeDeleteImpact",
    async () => {
      const user = await requireUser();
      const ids = idList(coffeeIds, "coffeeIds", MAX_BULK_COFFEE_DELETE);

      // Scoped to OWNED ids so this endpoint can never be used to probe how
      // often someone else's coffee has been cupped.
      const owned = await prisma.coffee.findMany({
        where: { id: { in: ids }, createdBy: user.id, deletedAt: null },
        select: { id: true },
      });
      const ownedIds = owned.map((c) => c.id);
      if (ownedIds.length === 0) throw new Error("not_found_or_forbidden");

      const [samples, sessionGroups, cupperGroups] = await Promise.all([
        prisma.sessionSample.count({ where: { coffeeId: { in: ownedIds } } }),
        prisma.sessionSample.groupBy({
          by: ["sessionId"],
          where: { coffeeId: { in: ownedIds } },
        }),
        prisma.userCoffeeHistory.groupBy({
          by: ["userId"],
          where: { coffeeId: { in: ownedIds } },
        }),
      ]);

      return {
        coffees: ownedIds.length,
        sessions: sessionGroups.length,
        samples,
        cuppers: cupperGroups.length,
      };
    },
    { coffeeId: coffeeIds?.[0] },
  );
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

  const coffee = await withCodeRetry((code) =>
    prisma.coffee.create({
      data: {
        code,
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
    }),
  );

  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  return { ok: true, coffeeId: coffee.id };
}

// ─── Update a coffee (owner only) ─────────────────────────────────────────────
// Whitelisted field update; visibility is deliberately NOT here — it has its
// own action (setCoffeeVisibility) because flipping it has share/invite side
// effects that a plain form save must not trigger accidentally.
export async function updateCoffee(
  coffeeId: string,
  input: {
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
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  // deletedAt filter: an anonymized coffee must never be re-identified.
  const coffee = await prisma.coffee.findFirst({
    where: { id: coffeeId, deletedAt: null },
    select: { createdBy: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "name_required" };

  await prisma.coffee.update({
    where: { id: coffeeId },
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
    },
  });

  revalidatePath("/es/app/coffees");
  revalidatePath("/en/app/coffees");
  revalidatePath(`/es/app/coffees/${coffeeId}`);
  revalidatePath(`/en/app/coffees/${coffeeId}`);
  return { ok: true };
}

// ─── Duplicate a coffee as a template ─────────────────────────────────────────
// Anyone who can USE the coffee (owned + public + shared-with-me) can copy it;
// the copy becomes theirs, private, with results unpublished — the same rule as
// "I can already read this data". Caller routes to the copy's edit page.
export async function duplicateCoffee(
  coffeeId: string,
  locale: string = "es",
): Promise<{ ok: true; coffeeId: string }> {
  const user = await requireUser();

  const source = await prisma.coffee.findFirst({
    where: { id: coffeeId, AND: [usableCoffeeWhere(user.id)] },
    select: {
      name: true,
      country: true,
      region: true,
      farm: true,
      producer: true,
      species: true,
      variety: true,
      harvestYear: true,
      processType: true,
      altitude: true,
      roastLevel: true,
      certifications: true,
      notes: true,
    },
  });
  if (!source) throw new Error("not_found_or_forbidden");

  const prefix = locale === "en" ? "Copy of" : "Copia de";
  // The copy gets its OWN short code (source.code is deliberately not in the
  // select above — codes are per-row identifiers, never inherited).
  const copy = await withCodeRetry((code) =>
    prisma.coffee.create({
      data: {
        ...source,
        code,
        name: `${prefix} ${source.name}`.slice(0, 120),
        createdBy: user.id,
        visibility: "private",
        resultsPublished: false,
      },
      select: { id: true },
    }),
  );

  revalidatePath(`/${locale}/app/coffees`);
  return { ok: true, coffeeId: copy.id };
}

// ─── Share a coffee via invite link (owner only) ──────────────────────────────
// Generating a link on a private coffee flips it to "shared" in the same call
// — creating a link IS the intent to share. Reuses the newest still-valid
// invite so repeated clicks don't mint token litter (mirrors createInviteToken
// in app/actions/community.ts otherwise).
export async function createCoffeeInvite(
  coffeeId: string,
): Promise<ActionResult<{ token: string }>> {
  return run("createCoffeeInvite", async () => {
    const user = await requireUser();

    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
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
  }, { coffeeId });
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
    include: {
      coffee: { select: { id: true, createdBy: true, visibility: true, deletedAt: true } },
    },
  });

  // Anonymized coffees have their invites removed; the deletedAt check is
  // belt-and-braces against a race with deleteCoffees.
  if (!invite || invite.coffee.visibility === "private" || invite.coffee.deletedAt) {
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
): Promise<ActionResult<void>> {
  return run("revokeCoffeeShare", async () => {
    const user = await requireUser();

    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
      select: { createdBy: true },
    });
    if (!coffee || coffee.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }

    await prisma.coffeeShare.deleteMany({ where: { coffeeId, userId } });

    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
  }, { coffeeId });
}

// ─── Publish / unpublish a coffee's community results (owner only) ────────────
// Controls whether non-owners can see the aggregated results section (scores,
// attribute averages, flavor cloud) on the coffee profile page. See
// app/[locale]/app/coffees/[id]/page.tsx for the visibility gate.
export async function setCoffeeResultsPublished(
  coffeeId: string,
  published: boolean,
): Promise<ActionResult<{ resultsPublished: boolean }>> {
  return run("setCoffeeResultsPublished", async () => {
    const user = await requireUser();

    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
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
    return { resultsPublished: published };
  }, { coffeeId });
}

// ─── Set a coffee record's visibility tier (owner only) ───────────────────────
// "private" — only the owner sees the record; "shared" — owner + users holding
// a CoffeeShare row (granted via invite link); "public" — everyone. Controls
// the record itself (profile page + list entry); see the access gate in
// app/[locale]/app/coffees/[id]/page.tsx (usableCoffeeWhere) and the list
// query in getCoffeesWithStats (lib/coffees/queries.ts).
export async function setCoffeeVisibility(
  coffeeId: string,
  visibility: CoffeeVisibility,
): Promise<ActionResult<{ visibility: CoffeeVisibility }>> {
  return run("setCoffeeVisibility", async () => {
    const user = await requireUser();
    // Public POST endpoint — never trust the caller's string.
    if (!isCoffeeVisibility(visibility)) throw new Error("invalid_input");

    // An anonymized coffee can never be flipped back to shared/public.
    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
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
    return { visibility };
  }, { coffeeId });
}

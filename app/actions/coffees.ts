"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRegisteredUser } from "@/lib/auth";
import { withCodeRetry } from "@/lib/coffeeCode";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import { idList } from "@/lib/validate";
import { normalizeCoffeeFields, isStaleCoffeeEdit } from "@/lib/coffeeInputBounds";
import { CERTIFICATIONS } from "@/lib/constants";
import { ANONYMIZED_COFFEE_DATA } from "@/lib/coffeeAnonymize";
import { duplicableFields } from "@/lib/coffeeDuplicate";
import { coffeeInviteExpiry, isCoffeeInviteUsable } from "@/lib/coffeeInvite";
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
      const user = await requireRegisteredUser();
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
      const user = await requireRegisteredUser();
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
  // S8-10 T12 (design b): validation codes keep their shape; a THROW (expired
  // auth, DB) becomes `{ ok:false, error }` so CoffeeForm keeps its values.
  const result = await run("createCoffee", () => createCoffeeBody(input));
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function createCoffeeBody(input: {
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
  const user = await requireRegisteredUser();

  const fields = normalizeCoffeeFields(input, "create", CERTIFICATIONS);
  if (!fields.ok) return { ok: false, error: fields.error };
  if (!isCoffeeVisibility(input.visibility)) {
    return { ok: false, error: "invalid_visibility" };
  }

  const coffee = await withCodeRetry((code) =>
    prisma.coffee.create({
      data: {
        code,
        ...fields.value,
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
    /** ISO `updatedAt` the form loaded with. When it no longer matches, the
     *  coffee changed elsewhere (another tab, a session rename): refuse with
     *  `conflict` instead of silently overwriting it (F-cafes-9). */
    expectedUpdatedAt?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await run("updateCoffee", () => updateCoffeeBody(coffeeId, input), { coffeeId });
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function updateCoffeeBody(
  coffeeId: string,
  input: Parameters<typeof updateCoffee>[1],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRegisteredUser();

  // deletedAt filter: an anonymized coffee must never be re-identified.
  const coffee = await prisma.coffee.findFirst({
    where: { id: coffeeId, deletedAt: null },
    select: { createdBy: true, updatedAt: true },
  });
  if (!coffee || coffee.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }
  if (isStaleCoffeeEdit(coffee.updatedAt, input.expectedUpdatedAt)) {
    return { ok: false, error: "conflict" };
  }

  // Unknown certifications are dropped (not rejected) so a legacy coffee stays editable.
  const fields = normalizeCoffeeFields(input, "update", CERTIFICATIONS);
  if (!fields.ok) return { ok: false, error: fields.error };

  await prisma.coffee.update({
    where: { id: coffeeId },
    data: fields.value,
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
): Promise<ActionResult<{ coffeeId: string }>> {
  return run("duplicateCoffee", async () => {
    const user = await requireRegisteredUser();

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
        // notes are deliberately NOT selected or copied: they are the owner's
        // private text (S8-02 F-cafes-3, see duplicableFields).
      },
    });
    if (!source) throw new Error("not_found_or_forbidden");

    const prefix = locale === "en" ? "Copy of" : "Copia de";
    // The copy gets its OWN short code (source.code is deliberately not in the
    // select above — codes are per-row identifiers, never inherited).
    const copy = await withCodeRetry((code) =>
      prisma.coffee.create({
        data: {
          ...duplicableFields(source),
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
    return { coffeeId: copy.id };
  });
}

// ─── Share a coffee via invite link (owner only) ──────────────────────────────
// Generating a link on a private coffee flips it to "shared" in the same call
// — creating a link IS the intent to share. Reuses the newest still-valid
// invite so repeated clicks don't mint token litter (mirrors createInviteToken
// in app/actions/community.ts otherwise). New invites expire after
// COFFEE_INVITE_TTL_DAYS (S8-12, F-cafes-4); the owner sees the date.
export async function createCoffeeInvite(
  coffeeId: string,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return run("createCoffeeInvite", async () => {
    const user = await requireRegisteredUser();

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
    if (existing && isCoffeeInviteUsable(existing)) {
      return { token: existing.token, expiresAt: existing.expiresAt?.toISOString() ?? null };
    }

    const token = crypto.randomUUID();
    const expiresAt = coffeeInviteExpiry();
    await prisma.coffeeInvite.create({
      data: { coffeeId, token, createdBy: user.id, expiresAt },
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }, { coffeeId });
}

// ─── Rotate the invite link (owner only) ──────────────────────────────────────
// Deletes EVERY previous invite of the coffee (the old URL then reads "invalid")
// and mints a fresh one with a 30-day expiry (S8-12, F-cafes-4). Offered next
// to the link and inside the revoke confirmation. People who already joined keep
// their share row; revoking them is a separate action.
async function rotateInvite(
  coffeeId: string,
  userId: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomUUID();
  const expiresAt = coffeeInviteExpiry();
  await prisma.$transaction([
    prisma.coffeeInvite.deleteMany({ where: { coffeeId } }),
    prisma.coffeeInvite.create({ data: { coffeeId, token, createdBy: userId, expiresAt } }),
  ]);
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function rotateCoffeeInvite(
  coffeeId: string,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  return run("rotateCoffeeInvite", async () => {
    const user = await requireRegisteredUser();
    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
      select: { createdBy: true },
    });
    if (!coffee || coffee.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }
    const fresh = await rotateInvite(coffeeId, user.id);
    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
    return fresh;
  }, { coffeeId });
}

// ─── Accept a coffee-share invite (any logged-in user) ────────────────────────
// Token is validated server-side, then the share is written via Prisma
// (postgres role — RLS on coffee_shares is read-only by design; see
// rls_and_triggers.sql PHASE 16). A private coffee rejects its outstanding
// tokens: flipping to private instantly kills every link.
export async function joinCoffeeViaToken(token: string, locale: string = "es") {
  const user = await requireRegisteredUser();

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
      // maxUses is enforced INSIDE the transaction (increment on the locked
      // row, then check, throw to roll back the share) so simultaneous opens
      // cannot overshoot the seat count — same pattern as session invites.
      const bumped = await tx.coffeeInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
        select: { useCount: true, maxUses: true },
      });
      if (bumped.maxUses !== null && bumped.useCount > bumped.maxUses) {
        throw new Error("token_exhausted");
      }
    });
    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
    revalidatePath("/es/app/coffees");
    revalidatePath("/en/app/coffees");
  }

  redirect(`/${locale}/app/coffees/${coffeeId}`);
}

// ─── Revoke a person's access to a shared coffee (owner only) ─────────────────
// Removing the share row alone leaves the invite alive: the person could reopen
// the old URL and regain access. `rotate: true` (the default in the confirmation
// dialog) also replaces the link so the old URL reads "invalid" (S8-12,
// F-cafes-4). Returns the fresh token when it rotated.
export async function revokeCoffeeShare(
  coffeeId: string,
  userId: string,
  rotate: boolean = false,
): Promise<ActionResult<{ token: string; expiresAt: string } | null>> {
  return run("revokeCoffeeShare", async () => {
    const user = await requireRegisteredUser();

    const coffee = await prisma.coffee.findFirst({
      where: { id: coffeeId, deletedAt: null },
      select: { createdBy: true },
    });
    if (!coffee || coffee.createdBy !== user.id) {
      throw new Error("not_found_or_forbidden");
    }

    await prisma.coffeeShare.deleteMany({ where: { coffeeId, userId } });
    const fresh = rotate === true ? await rotateInvite(coffeeId, user.id) : null;

    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
    return fresh;
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
    const user = await requireRegisteredUser();

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
//
// S8-12 (F-cafes-5): going PRIVATE deletes the coffee's invites, so links never
// come back to life on a later round trip (shares stay as inert rows — no RLS
// change). Returning to shared/public can pass `clearShares: true` to drop the
// people who held access before; the UI lists them first and lets the owner
// choose to keep or clear.
export async function setCoffeeVisibility(
  coffeeId: string,
  visibility: CoffeeVisibility,
  clearShares: boolean = false,
): Promise<ActionResult<{ visibility: CoffeeVisibility }>> {
  return run("setCoffeeVisibility", async () => {
    const user = await requireRegisteredUser();
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

    await prisma.$transaction([
      prisma.coffee.update({ where: { id: coffeeId }, data: { visibility } }),
      ...(visibility === "private"
        ? [prisma.coffeeInvite.deleteMany({ where: { coffeeId } })]
        : []),
      ...(visibility !== "private" && clearShares === true
        ? [prisma.coffeeShare.deleteMany({ where: { coffeeId } })]
        : []),
    ]);

    revalidatePath(`/es/app/coffees/${coffeeId}`);
    revalidatePath(`/en/app/coffees/${coffeeId}`);
    revalidatePath("/es/app/coffees");
    revalidatePath("/en/app/coffees");
    return { visibility };
  }, { coffeeId });
}

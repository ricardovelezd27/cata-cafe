import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/log";
import {
  appMetadataClearingEmailChange,
  appMetadataRecordingEmailChange,
  completedEmailChange,
  normalizeAddress,
} from "@/lib/emailChangeRules";
import { moveWaitlistEntry } from "@/lib/waitlistMove";

type AuthUserLike =
  | {
      id?: string;
      email?: string | null;
      new_email?: string | null;
      app_metadata?: Record<string, unknown> | null;
    }
  | null
  | undefined;

/**
 * Records `{ from, to }` of a requested email change in the account's
 * `app_metadata` (service role only; ONLY that key is sent). Call AFTER the
 * user's own `updateUser({ email })` succeeded, with the signed-in user as the
 * server read it (`getUser()`) and the new address the server passed to
 * `updateUser`, never anything the client posted. Each request overwrites the
 * previous record. A failure never blocks the change (ids and a code only).
 */
export async function recordEmailChange(
  user: { id: string; email?: string | null },
  newAddress: string,
): Promise<void> {
  if (!user.email) return;
  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: appMetadataRecordingEmailChange(user.email, newAddress),
    });
    if (error) throw error;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    logWarn({ where: "emailChange.record", userId: user.id, code: typeof code === "string" ? code : "unknown" });
  }
}

/** True when ANOTHER auth user currently holds this address (normalised the
 *  same way on both sides: lower(btrim()) here, normalizeAddress in JS). */
async function heldByAnotherUser(address: string, userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from auth.users
    where lower(btrim(email)) = ${normalizeAddress(address)} and id <> ${userId}::uuid`;
  return (rows[0]?.n ?? 0) > 0;
}

export type MoveOutcome =
  /** Not a completed change (no record, pending, inert): nothing was done. */
  | "none"
  /** Row moved or merged (or there was none) and the record cleared. */
  | "moved"
  /** Refused or left as is, record kept (`old_address_held`, `same`, an ambiguous reservation). */
  | "kept"
  | "failed";

/**
 * The move itself, shared by the verify path (confirmEmailToken, through
 * `moveReservationAfterEmailChange`) and the nightly reconcile pass
 * (lib/emailChangeReconcile.ts, S10 leftovers A1). It acts only when
 * `completedEmailChange` says so (no pending `new_email`, the account's address
 * is the recorded `to`); any other record is left untouched. Idempotent: a
 * second call finds no record (or no row).
 *
 * The old address is read ONLY from `app_metadata`. Belt and braces: if
 * ANOTHER auth user holds the old address, nothing moves AND the record is kept
 * (nothing is abandoned silently; id and code are logged). When the new address
 * already has a reservation the two are merged (lib/waitlistMove.ts, A2). Every
 * failure is swallowed and logged with the user id and a code only: the
 * reservation row is bookkeeping, the sign-in goes on.
 */
export async function applyEmailChangeMove(user: AuthUserLike): Promise<MoveOutcome> {
  const change = completedEmailChange(user);
  if (!change || !user?.id) return "none";
  try {
    if (await heldByAnotherUser(change.from, user.id)) {
      logWarn({ where: "emailChange.moveReservation", userId: user.id, code: "old_address_held" });
      return "kept";
    }
    const result = await moveWaitlistEntry(change.from, change.to);
    if (result !== "moved" && result !== "merged" && result !== "no_row") return "kept";
    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: appMetadataClearingEmailChange(),
    });
    if (error) throw error;
    return "moved";
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    logWarn({ where: "emailChange.moveReservation", userId: user?.id, code: typeof code === "string" ? code : "unknown" });
    return "failed";
  }
}

/** Clears ONLY the `email_change` key of an inert record (service role). */
export async function clearEmailChangeRecord(userId: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      app_metadata: appMetadataClearingEmailChange(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    logWarn({ where: "emailChange.clearRecord", userId, code: typeof code === "string" ? code : "unknown" });
    return false;
  }
}

/**
 * Moves the founding-seat reservation to the new address once GoTrue has
 * COMPLETED an email change, then clears the record (service role, only its
 * key). Called from confirmEmailToken right after verifyOtp succeeded for
 * type=email_change, before and independent of any session handling. See
 * `applyEmailChangeMove`. Changes completed before the record existed cannot be
 * reconciled (no record).
 */
export async function moveReservationAfterEmailChange(user: AuthUserLike): Promise<void> {
  await applyEmailChangeMove(user);
}

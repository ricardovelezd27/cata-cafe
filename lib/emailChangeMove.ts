import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/log";
import {
  appMetadataClearingOldAddress,
  appMetadataRecordingOldAddress,
  completedEmailChange,
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
 * Records the old address of a requested email change in the account's
 * `app_metadata` (service role only). Call AFTER the user's own
 * `updateUser({ email })` succeeded, with the address and metadata of the
 * SIGNED-IN user as the server read them (`getUser()`), never anything the
 * client posted. A failure never blocks the change (ids and a code only).
 */
export async function recordOldAddressForEmailChange(user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
}): Promise<void> {
  if (!user.email) return;
  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: appMetadataRecordingOldAddress(user.app_metadata, user.email),
    });
    if (error) throw error;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    logWarn({ where: "emailChange.recordOldAddress", userId: user.id, code: typeof code === "string" ? code : "unknown" });
  }
}

/** True when ANOTHER auth user currently holds this address. */
async function heldByAnotherUser(address: string, userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from auth.users
    where lower(btrim(email)) = ${address} and id <> ${userId}::uuid`;
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Moves the founding-seat reservation to the new address once an email change
 * is COMPLETE and the session of that very user is established, then clears
 * the recorded old address (service role). The old address is read ONLY from
 * `app_metadata`; it must not belong to any other auth user at move time.
 * Every failure is swallowed and logged with the user id and a code only: the
 * reservation row is bookkeeping, the sign-in goes on. Changes completed before
 * this deploy cannot be reconciled (no record of the old address).
 */
export async function moveReservationAfterEmailChange(user: AuthUserLike): Promise<void> {
  const change = completedEmailChange(user);
  if (!change || !user?.id) return;
  try {
    if (await heldByAnotherUser(change.from, user.id)) {
      // Never move a row on behalf of an address somebody else holds.
      logWarn({ where: "emailChange.moveReservation", userId: user.id, code: "old_address_held" });
    } else {
      const result = await moveWaitlistEntry(change.from, change.to);
      if (result !== "moved" && result !== "no_row" && result !== "target_exists") return;
    }
    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: appMetadataClearingOldAddress(user.app_metadata),
    });
    if (error) throw error;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    logWarn({ where: "emailChange.moveReservation", userId: user?.id, code: typeof code === "string" ? code : "unknown" });
  }
}

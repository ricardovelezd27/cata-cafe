"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { isDeleteConfirmed, type AccountDeletionImpact } from "@/lib/accountDeletion/plan";
import { getAccountDeletionImpact } from "@/lib/accountDeletion/load";
import { deleteAccountData } from "@/lib/accountDeletion/deleteAccount";

function localeOf(value: string | undefined): "es" | "en" {
  return value === "en" ? "en" : "es";
}

/**
 * Counts for the "Eliminar cuenta" dialog (S8-19). Self only: it reads the
 * signed-in user's own rows, never an id from the client. Guests too.
 */
export async function getMyAccountDeletionImpact(): Promise<ActionResult<AccountDeletionImpact>> {
  return run("getMyAccountDeletionImpact", async () => {
    const user = await requireUser({ skipProfileUpsert: true });
    return getAccountDeletionImpact(user);
  });
}

/**
 * Deletes the signed-in account (S8-19, F-cuenta-1; E3 (a), E4 (a)).
 * GUESTS ARE ALLOWED: an anonymous user may delete themselves (spec S8-07,
 * Apple 5.1.1(v)), which is why this is requireUser and not
 * requireRegisteredUser. The typed word ("ELIMINAR" / "DELETE") is checked
 * here too, not only in the dialog. The super-admin account is refused with
 * `account_protected`.
 *
 * Returns where to go; the client clears this device's state and navigates.
 * `authDeleted: false` means the data is gone but the auth user could not be
 * removed after 3 attempts (logged; runbook §24 removes it by hand).
 */
export async function deleteAccount(
  confirmation: string,
  locale?: string,
): Promise<ActionResult<{ next: string; userId: string; authDeleted: boolean }>> {
  return run("deleteAccount", async () => {
    const user = await requireUser({ skipProfileUpsert: true });
    const loc = localeOf(locale);
    if (!isDeleteConfirmed(confirmation, loc)) throw new Error("invalid_input");
    if (isSuperAdminEmail(user.email)) throw new Error("account_protected");

    const outcome = await deleteAccountData(user);

    // This device's session ends here. The auth user may already be gone, so
    // a failure is expected and ignored; the client also clears local state.
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // best effort
    }

    for (const l of ["es", "en"]) {
      revalidatePath(`/${l}/app`, "layout");
    }

    return { next: loc === "en" ? "/en" : "/", userId: user.id, authDeleted: outcome.authDeleted };
  });
}

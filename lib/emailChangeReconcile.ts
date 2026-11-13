import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logWarn } from "@/lib/log";
import { reconcileAction, sameEmailChangeRecord } from "@/lib/emailChangeRules";
import { applyEmailChangeMove, clearEmailChangeRecord } from "@/lib/emailChangeMove";

/** At most this many accounts per nightly run. */
export const EMAIL_CHANGE_RECONCILE_BATCH = 50;

export type EmailChangeReconcileSummary = {
  seen: number;
  moved: number;
  cleared: number;
  kept: number;
  failed: number;
  /** The loop stopped between accounts because the cron's start budget was spent. */
  budgetTruncated: boolean;
};

export const emptyReconcileSummary = (): EmailChangeReconcileSummary => ({
  seen: 0,
  moved: 0,
  cleared: 0,
  kept: 0,
  failed: 0,
  budgetTruncated: false,
});

/**
 * Accounts that still carry an `app_metadata.email_change` OBJECT (a nulled key
 * is not selected), not soft-deleted, with NO change pending: hosted GoTrue keeps
 * a pending new address in `auth.users.email_change` (old rows can hold NULL),
 * and such an account would answer "keep" anyway, so selecting it would only
 * occupy a batch slot forever.
 *
 * Order is RANDOM, not oldest-first: the few records that stay kept for good
 * (`old_address_held`, an ambiguous reservation) would otherwise sit at the head
 * of the batch every night and starve newer failed moves. Random order lets every
 * record reach the head over a few nights; the summary counts are unchanged.
 */
export async function selectEmailChangeRecordIds(limit = EMAIL_CHANGE_RECONCILE_BATCH): Promise<string[]> {
  const n = Math.max(1, Math.min(EMAIL_CHANGE_RECONCILE_BATCH, Math.floor(limit)));
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    select u.id::text as id from auth.users u
    where jsonb_typeof(u.raw_app_meta_data -> 'email_change') = 'object'
      and u.deleted_at is null
      and coalesce(u.email_change, '') = ''
    order by random()
    limit ${n}`;
  return rows.map((r) => r.id);
}

/**
 * Nightly reconcile (S10 leftovers A1). A reservation move that failed at
 * verify time left its record in `app_metadata.email_change` and was never
 * retried; the reservation would later be deleted as an orphan although the
 * account is in use. For each selected account: read it through the admin API
 * and apply `reconcileAction`: move (the same function the verify path runs, same
 * refusals: `old_address_held` keeps the record), clear (an inert record, only
 * that key, and only after RE-READING the user and finding the record unchanged:
 * a new request may have overwritten it since) or keep. Deletes no account, so it
 * runs whether or not the purge switch is on. One account's failure never stops
 * the others; `mayStart` (the cron's start budget) is checked between accounts.
 * Logs carry ids and codes only.
 */
export async function reconcileEmailChanges(
  limit = EMAIL_CHANGE_RECONCILE_BATCH,
  opts: { mayStart?: () => boolean } = {},
): Promise<EmailChangeReconcileSummary> {
  const summary = emptyReconcileSummary();
  const ids = await selectEmailChangeRecordIds(limit);
  const admin = () => createAdminClient().auth.admin;
  for (const id of ids) {
    if (opts.mayStart && !opts.mayStart()) {
      summary.budgetTruncated = true;
      logWarn({ where: "emailChange.reconcile", message: "time budget spent, rest left for the next run" });
      break;
    }
    summary.seen += 1;
    try {
      const { data, error } = await admin().getUserById(id);
      if (error || !data?.user) {
        summary.failed += 1;
        const code = (error as { code?: unknown } | null)?.code;
        logWarn({ where: "emailChange.reconcile", userId: id, code: typeof code === "string" ? code : "lookup_failed" });
        continue;
      }
      const user = data.user;
      const action = reconcileAction(user);
      if (action === "keep") {
        summary.kept += 1;
      } else if (action === "clear") {
        // Re-read: clear only the record the decision was made on.
        const again = await admin().getUserById(id);
        const fresh = again.data?.user;
        if (again.error || !fresh) {
          summary.failed += 1;
        } else if (reconcileAction(fresh) !== "clear" || !sameEmailChangeRecord(user.app_metadata, fresh.app_metadata)) {
          summary.kept += 1;
        } else if (await clearEmailChangeRecord(id)) {
          summary.cleared += 1;
        } else {
          summary.failed += 1;
        }
      } else {
        const outcome = await applyEmailChangeMove(user);
        if (outcome === "moved") summary.moved += 1;
        else if (outcome === "failed") summary.failed += 1;
        else summary.kept += 1;
      }
    } catch (err) {
      summary.failed += 1;
      const code = (err as { code?: unknown } | null)?.code;
      logError({ where: "emailChange.reconcile", userId: id, code: typeof code === "string" ? code : "unknown" });
    }
  }
  return summary;
}

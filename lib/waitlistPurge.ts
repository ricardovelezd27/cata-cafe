import "server-only";

import { prisma } from "@/lib/prisma";
import { WAITLIST_RETENTION_MONTHS } from "@/lib/legal/config";
import { waitlistIdsToDelete, waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";
import { listAllAuthUsersStrict } from "@/lib/supabase/adminUsers";

/** Rows deleted per run at most, oldest first. */
export const WAITLIST_PURGE_BATCH = 500;
/** Overdue rows examined per page, and pages per run (rows kept because they
 *  have an account must not starve the rows behind them). */
const SCAN_PAGE = 500;
const SCAN_MAX_PAGES = 10;

/**
 * Retention for the founding-seat waitlist (privacy policy sections 3 and 10):
 * a reservation whose person NEVER created an account is kept at most
 * WAITLIST_RETENTION_MONTHS. Called from the daily close-expired-sessions
 * cron. Returns a count only.
 *
 * Scope: a row whose address has an auth user is KEPT (the policy says it is
 * kept while the account exists; the row is also the founding-cohort record
 * and account deletion removes it). The set of account addresses comes from the
 * paginated service-role listing, built once per run and compared exactly and
 * case-insensitively (waitlistIdsToDelete). If the listing fails nothing is
 * deleted and the error propagates to the caller, which logs the code only.
 */
export async function purgeWaitlist(now: Date = new Date()): Promise<number> {
  const cutoff = waitlistPurgeCutoff(now, WAITLIST_RETENTION_MONTHS);
  const first = await prisma.waitlistEntry.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, email: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: SCAN_PAGE,
  });
  if (first.length === 0) return 0;
  // Throws on any listing error (never partial): then nothing is deleted.
  const accounts = (await listAllAuthUsersStrict()).map((u) => u.email);

  const toDelete: string[] = [];
  let page = first;
  for (let i = 0; i < SCAN_MAX_PAGES; i++) {
    toDelete.push(...waitlistIdsToDelete(page, accounts));
    if (toDelete.length >= WAITLIST_PURGE_BATCH || page.length < SCAN_PAGE) break;
    page = await prisma.waitlistEntry.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, email: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      cursor: { id: page[page.length - 1].id },
      skip: 1,
      take: SCAN_PAGE,
    });
    if (page.length === 0) break;
  }
  const ids = toDelete.slice(0, WAITLIST_PURGE_BATCH);
  if (ids.length === 0) return 0;
  const r = await prisma.waitlistEntry.deleteMany({ where: { id: { in: ids } } });
  return r.count;
}

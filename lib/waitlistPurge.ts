import "server-only";

import { prisma } from "@/lib/prisma";
import { WAITLIST_RETENTION_MONTHS } from "@/lib/legal/config";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";

/** Rows deleted per run, oldest first. Bounded on purpose; the next daily run
 *  takes the rest. */
export const WAITLIST_PURGE_BATCH = 500;

/**
 * Retention for the founding-seat waitlist (privacy policy section 10):
 * deletes WaitlistEntry rows older than WAITLIST_RETENTION_MONTHS. Called from
 * the daily close-expired-sessions cron. Returns a count only.
 *
 * Deliberately by AGE alone, with no join against auth users: a row whose
 * person later created an account has also served its purpose (the account
 * itself is the record from then on), so it goes after the period either way.
 * No account-deletion manifest entry is needed: this removes rows, it does not
 * add a user-referencing column (the table holds an address, not a user id).
 */
export async function purgeWaitlist(now: Date = new Date()): Promise<number> {
  const cutoff = waitlistPurgeCutoff(now, WAITLIST_RETENTION_MONTHS);
  const old = await prisma.waitlistEntry.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: WAITLIST_PURGE_BATCH,
  });
  if (old.length === 0) return 0;
  const r = await prisma.waitlistEntry.deleteMany({
    where: { id: { in: old.map((e) => e.id) } },
  });
  return r.count;
}

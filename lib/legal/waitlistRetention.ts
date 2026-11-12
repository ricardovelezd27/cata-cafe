// Pure retention arithmetic for waitlist rows (S10 WP9a, F-landing-1).
// Dependency-free so it is unit-tested; the Prisma call is in
// lib/waitlistPurge.ts (server-only).

/**
 * The instant `months` calendar months before `now`, in UTC. Real month
 * arithmetic, not 30-day steps: the day of month is kept and clamped to the
 * last day of the target month (2026-03-31 minus 1 month = 2026-02-28; a 29
 * February minus 12 months = 28 February). The time of day is kept.
 */
export function waitlistPurgeCutoff(now: Date, months: number): Date {
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

/** Exact, case-insensitive, whitespace-trimmed key for comparing addresses. */
function emailKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Which overdue waitlist rows may be deleted: only those whose address has NO
 * account. A reservation is kept while the person account exists (privacy
 * policy section 10; the row is also the founding-cohort record). Exact match
 * on the normalised address, never a pattern match. Returns ids, in the order given.
 */
export function waitlistIdsToDelete(
  candidates: { id: string; email: string }[],
  accountEmails: Iterable<string | null | undefined>,
): string[] {
  const accounts = new Set<string>();
  for (const e of accountEmails) {
    const k = emailKey(e);
    if (k) accounts.add(k);
  }
  return candidates.filter((c) => !accounts.has(emailKey(c.email))).map((c) => c.id);
}

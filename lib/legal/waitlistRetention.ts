// Pure retention arithmetic (S10 WP9a, F-landing-1). Dependency-free so it is
// unit-tested; the selection and deletion are in lib/unusedAccountPurge.ts
// (server-only), the "never used" rule in lib/unusedAccountRules.ts.

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

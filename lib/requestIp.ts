// Client IP of a request, for the magic-link per-IP tripwire (S8-03).
//
// Pure parse only (no next/headers) so it is unit-tested. On Vercel the first
// x-forwarded-for entry is the client address. Locally there is no such header:
// return null and let lib/emailBudget.ts skip the IP rule instead of putting
// every dev request into one shared bucket.

export function parseClientIp(xForwardedFor: string | null | undefined): string | null {
  if (!xForwardedFor) return null;
  const first = xForwardedFor.split(",")[0]?.trim();
  return first ? first : null;
}

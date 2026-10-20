/**
 * Builds the absolute join URL for a group-session invite token. Centralizes a
 * construction that used to be duplicated inline in NewSessionForm.tsx and
 * CupClient.tsx.
 */
export function buildInviteUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/join/${token}`;
}

/**
 * Absolute join URL for a coffee-share invite token (CoffeeInvite). The static
 * `coffee` segment can never collide with a session token: those are UUIDs.
 */
export function buildCoffeeInviteUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/join/coffee/${token}`;
}

/**
 * Public site origin for links in emails (no trailing slash). Same source and
 * dev fallback as the rest of the app (sitemap, robots, digest email).
 */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Login URL that lands on a session's results page after auth (the login page
 * threads `next`; a signed-in browser passes straight through).
 */
export function buildResultsLoginUrl(origin: string, locale: string, sessionId: string): string {
  const next = `/${locale}/app/sessions/${sessionId}/results`;
  return `${origin}/${locale}/auth/login?next=${encodeURIComponent(next)}`;
}

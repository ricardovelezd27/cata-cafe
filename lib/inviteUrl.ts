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
  return normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

/**
 * The configured site origin, made safe to build links from: no trailing slash,
 * and never plain http for a real host. Production was configured with
 * `http://<host>`; after S8-03 made sign-in use this value (not the request
 * header), every sign-in asked Supabase to return to an http address that its
 * allow-list (https only) refused, so Google and email sign-in both failed
 * (2026-11-11). Local dev hosts keep http.
 */
export function normalizeSiteOrigin(raw: string | undefined | null): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol === "http:" && !local) return `https://${url.host}`;
  return value;
}

/**
 * Login URL that lands on a session's results page after auth (the login page
 * threads `next`; when a non-anonymous user is already signed in, the login
 * page redirects straight to `next` without asking for a second magic link).
 */
export function buildResultsLoginUrl(origin: string, locale: string, sessionId: string): string {
  const next = `/${locale}/app/sessions/${sessionId}/results`;
  return `${origin}/${locale}/auth/login?next=${encodeURIComponent(next)}`;
}

/**
 * Where a group email sends a recipient to join a session (S8-11 T7,
 * F-grupos-6). A LINKED member (already has an account) goes straight to the
 * join page; an unlinked (email-only) recipient goes through login with the
 * join as `next`, which steers them toward email signup (so handle_new_user
 * links them) instead of dropping them on the anonymous guest-join CTA.
 */
export function groupSessionInviteUrl(args: {
  linked: boolean;
  token: string;
  locale: string;
  origin: string;
}): string {
  const join = `/${args.locale}/join/${args.token}`;
  if (args.linked) return `${args.origin}${join}`;
  // No email in the URL (S8-14, F-grupos-8): addresses must not travel in links.
  return `${args.origin}/${args.locale}/auth/login?next=${encodeURIComponent(join)}`;
}

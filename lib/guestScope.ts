// Where an ANONYMOUS (QR walk-up) user may go inside /app. Guests exist to
// cup and see results, and they may look at their own profile; the rest of
// the shell (coffees, groups, new-session wizard, insights) would let them
// create assets under a throwaway identity that the guest-claim flow then
// has to drag along. Pure function — unit tested. Applied in two places that
// must agree: proxy.ts (server gate, redirects with ?gate=1) and
// components/guest/GuestGateLink.tsx (client nav, opens the account modal).

const GUEST_ALLOWED = [
  /^\/app\/sessions\/[^/]+\/(cup|waiting|results|print)(\/|$)/,
  /^\/app\/sessions\/?$/,
  /^\/app\/profile(\/|$)/,
  /^\/app\/?$/,
];

/** `pathname` WITHOUT the locale prefix (e.g. "/app/sessions/abc/cup"). */
export function isGuestAllowedPath(pathname: string): boolean {
  return GUEST_ALLOWED.some((re) => re.test(pathname));
}

export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

/** Query param the proxy appends when it bounces a guest off a gated page so
 *  the app shell can open the "finish creating your account" modal. */
export const GUEST_GATE_PARAM = "gate";

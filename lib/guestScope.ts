// Where an ANONYMOUS (QR walk-up) user may go inside /app. Guests exist to
// cup and see results; the rest of the shell (coffees, groups, new-session
// wizard, profile) would let them create assets under a throwaway identity
// that the guest-claim flow then has to drag along. Pure function — unit
// tested; applied in app/[locale]/app/layout.tsx.

const GUEST_ALLOWED = [
  /^\/app\/sessions\/[^/]+\/(cup|waiting|results|print)(\/|$)/,
  /^\/app\/sessions\/?$/,
  /^\/app\/?$/,
];

/** `pathname` WITHOUT the locale prefix (e.g. "/app/sessions/abc/cup"). */
export function isGuestAllowedPath(pathname: string): boolean {
  return GUEST_ALLOWED.some((re) => re.test(pathname));
}

export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

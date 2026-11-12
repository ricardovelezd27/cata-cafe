import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign-in intent (S9-02, A-08): defends the /auth/confirm button against login
 * CSRF. Without it, an attacker could mail a victim a confirm link carrying the
 * ATTACKER's token; one click would sign the victim into the attacker's account
 * and the victim's cupping would land there.
 *
 * When a sign-in link is requested from a browser, that browser gets a short
 * lived cookie holding an HMAC of the normalized address (never the address).
 * After verifyOtp, `decideSignInIntent` compares the HMAC of the signed-in
 * user's address with the cookie: a match means "this browser asked for this
 * very sign-in"; anything else makes the confirm page ask "Vas a entrar como
 * j***@dominio.com?" before going on.
 *
 * Pure (no `server-only`, no cookies API, secret passed in) so vitest covers it
 * (tests/signInIntent.test.ts). The cookie plumbing is lib/signInIntentCookie.ts.
 */

export const SIGNIN_INTENT_COOKIE = "cata_signin_intent";
/** One hour: the OTP lifetime. */
export const SIGNIN_INTENT_MAX_AGE_S = 60 * 60;
/** Addresses remembered per browser (latest wins). */
export const SIGNIN_INTENT_MAX_ENTRIES = 3;

const MAC_RE = /^[A-Za-z0-9_-]{43}$/;

export function normalizeIntentEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/** HMAC of the normalized address under its own domain prefix. */
export function intentMac(secret: string, email: string): string {
  return createHmac("sha256", secret)
    .update(`signin-intent:${normalizeIntentEmail(email)}`)
    .digest("base64url");
}

/** Splits a cookie value into well-formed MACs. Malformed parts are dropped. */
export function parseIntentValue(value: string | null | undefined): string[] {
  if (typeof value !== "string" || value.length === 0 || value.length > 400) return [];
  return value.split(".").filter((p) => MAC_RE.test(p));
}

/**
 * The cookie value after remembering `emails`, merged with the previous value
 * (oldest dropped past SIGNIN_INTENT_MAX_ENTRIES, duplicates collapsed).
 */
export function mintIntentValue(
  secret: string,
  emails: readonly string[],
  previous?: string | null,
): string {
  const next = emails.map((e) => intentMac(secret, e));
  const merged = [...parseIntentValue(previous), ...next];
  const seen = new Set<string>();
  const unique: string[] = [];
  // Keep the LAST occurrence order: walk from the end, then reverse.
  for (let i = merged.length - 1; i >= 0; i--) {
    if (!seen.has(merged[i])) {
      seen.add(merged[i]);
      unique.push(merged[i]);
    }
  }
  return unique.slice(0, SIGNIN_INTENT_MAX_ENTRIES).reverse().join(".");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type SignInIntentDecision = "match" | "confirm";

/**
 * "match": the cookie names the signed-in user's address, proceed as before.
 * "confirm": no cookie, malformed cookie, or a different address: show the
 * identity card before going to `next`.
 */
export function decideSignInIntent(
  secret: string,
  cookieValue: string | null | undefined,
  userEmail: string | null | undefined,
): SignInIntentDecision {
  const macs = parseIntentValue(cookieValue);
  if (macs.length === 0) return "confirm";
  const address = normalizeIntentEmail(userEmail ?? "");
  if (!address) return "confirm";
  const mine = intentMac(secret, address);
  return macs.some((m) => safeEqual(m, mine)) ? "match" : "confirm";
}

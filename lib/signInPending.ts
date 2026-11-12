/**
 * Pending sign-in (S9-02, A-08 redesign). When a confirm link is verified but
 * this browser did not ask for it (or has no intent cookie), NO session is
 * established. The two verified tokens wait in the httpOnly, SameSite=Strict
 * `cata_signin_pending` cookie for 10 minutes until the person presses
 * "Si, continuar" (acceptPendingSignIn) or "No soy yo" (rejectPendingSignIn).
 *
 * Pure and dependency-free (base64url of a small JSON object) so vitest covers
 * it (tests/signInPending.test.ts). The cookie plumbing is
 * lib/signInPendingCookie.ts. Only app/actions/auth.ts touches that cookie.
 */

export const SIGNIN_PENDING_COOKIE = "cata_signin_pending";
/** Ten minutes: long enough to read the card, short enough to be disposable. */
export const SIGNIN_PENDING_MAX_AGE_S = 10 * 60;
/** Upper bound on the encoded cookie value (browsers cap a cookie near 4096 B). */
export const SIGNIN_PENDING_MAX_VALUE = 3800;

export type PendingTokens = { accessToken: string; refreshToken: string };

const B64URL_RE = /^[A-Za-z0-9_-]+$/;

function isToken(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 3000;
}

/** Cookie value for the tokens, or null when they are unusable or too large. */
export function encodePending(tokens: PendingTokens): string | null {
  if (!tokens || !isToken(tokens.accessToken) || !isToken(tokens.refreshToken)) return null;
  const value = Buffer.from(
    JSON.stringify({ a: tokens.accessToken, r: tokens.refreshToken }),
    "utf8",
  ).toString("base64url");
  return value.length <= SIGNIN_PENDING_MAX_VALUE ? value : null;
}

/** The tokens in a cookie value, or null (missing, oversized, malformed, wrong shape). */
export function decodePending(value: string | null | undefined): PendingTokens | null {
  if (typeof value !== "string" || value.length === 0 || value.length > SIGNIN_PENDING_MAX_VALUE) return null;
  if (!B64URL_RE.test(value)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { a, r } = parsed as Record<string, unknown>;
  if (!isToken(a) || !isToken(r)) return null;
  return { accessToken: a, refreshToken: r };
}

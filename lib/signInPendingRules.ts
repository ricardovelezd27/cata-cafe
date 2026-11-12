import { normalizeIntentEmail } from "@/lib/signInIntent";

/**
 * Pure rules for the parked sign-in (S9-02, A-08). No imports beyond the
 * intent normalizer, so vitest covers them (tests/signInPendingRules.test.ts).
 */

/** What to do with the pending cookie after an auth call failed. */
export type PendingFailure = "retry" | "expired";

// Codes where GoTrue says this session / token can never work again.
const DEFINITIVE_CODES = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "user_not_found",
  "no_authorization",
]);

const DEFINITIVE_MESSAGE =
  /invalid refresh token|refresh token (is )?not found|refresh token (has been )?already used|session (from session_id claim in jwt )?does not exist|auth session missing/i;

/**
 * Classifies an error from setSession / getUser on the parked tokens.
 *  - "expired": a definitive refusal (401/403, session not found, invalid or
 *    used refresh token). The cookie is useless: delete it.
 *  - "retry": network failure (auth-js AuthRetryableFetchError, status 0),
 *    5xx, 429, or any shape we do not recognise. Keeping a 10-minute httpOnly
 *    cookie is the safe side: the same button can try again.
 */
export function classifyPendingFailure(error: unknown): PendingFailure {
  if (error === null || typeof error !== "object") return "retry";
  const e = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  if (e.name === "AuthRetryableFetchError") return "retry";
  if (typeof e.code === "string" && DEFINITIVE_CODES.has(e.code)) return "expired";
  if (e.name === "AuthSessionMissingError") return "expired";
  if (e.status === 401 || e.status === 403) return "expired";
  if (typeof e.message === "string" && DEFINITIVE_MESSAGE.test(e.message)) return "expired";
  return "retry";
}

/**
 * True only when the address the card displayed and the address of the parked
 * user are the same (case and surrounding whitespace ignored). An empty side
 * never matches.
 */
export function pendingEmailMatches(shown: unknown, actual: unknown): boolean {
  const a = normalizeIntentEmail(typeof shown === "string" ? shown : "");
  const b = normalizeIntentEmail(typeof actual === "string" ? actual : "");
  return a.length > 0 && b.length > 0 && a === b;
}

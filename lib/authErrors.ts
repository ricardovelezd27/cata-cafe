// ONE map from whatever the auth layer reports (Supabase error codes, our own
// rate-limit / validation codes, the `error` / `error_code` params an OAuth
// provider appends to the callback URL) to a copy key under `auth.errors.*`
// (S8-06, F-entrar-9, F-landing-7). Pure; shared by the login form, the
// founding-seat form, the confirm page and the callback.

export const AUTH_ERROR_KEYS = [
  "rate_limited",
  "invalid_email",
  "code_invalid", // wrong, expired or already-used code / link
  "link_failed", // the callback could not complete the sign-in
  "cancelled", // the person closed the Google consent screen
  "unreachable", // the auth service or the network is down
  "unknown",
] as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[number];

export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return typeof value === "string" && (AUTH_ERROR_KEYS as readonly string[]).includes(value);
}

export function mapAuthError(code: string | null | undefined): AuthErrorKey {
  if (!code) return "unknown";
  if (isAuthErrorKey(code)) return code;
  const c = code.toLowerCase();
  if (
    c === "over_email_send_rate_limit" ||
    c === "over_request_rate_limit" ||
    c === "over_sms_send_rate_limit" ||
    c.includes("rate limit") ||
    c.includes("rate_limit")
  ) {
    return "rate_limited";
  }
  if (
    c === "missing_email" ||
    c === "email_address_invalid" ||
    c === "validation_failed" ||
    c === "invalid_email"
  ) {
    return "invalid_email";
  }
  if (
    c === "otp_expired" ||
    c === "otp_disabled" ||
    c === "invalid_token" ||
    c === "token_expired" ||
    c === "bad_code_verifier"
  ) {
    return "code_invalid";
  }
  // The OAuth provider reports a closed consent screen as access_denied.
  if (c === "access_denied" || c === "user_cancelled" || c === "cancelled") return "cancelled";
  if (c === "exchange_failed" || c === "flow_state_not_found" || c === "flow_state_expired") {
    return "link_failed";
  }
  if (c.includes("fetch") || c.includes("network") || c === "unexpected_failure" || c === "server") {
    return "unreachable";
  }
  return "unknown";
}

/** An ActionErrorCode from a server action -> the auth copy key. */
export function authErrorFromAction(code: string): AuthErrorKey {
  switch (code) {
    case "invalid_token":
    case "token_expired":
    case "token_exhausted":
      return "code_invalid";
    case "rate_limited":
      return "rate_limited";
    case "invalid_input":
      return "code_invalid";
    default:
      return "unknown";
  }
}

/** Which `error` query values the login page understands (it also accepts the
 *  legacy `exchange_failed`). Anything else is ignored rather than echoed. */
export function loginErrorFromParam(param: string | null | undefined): AuthErrorKey | null {
  if (!param) return null;
  const k = mapAuthError(param);
  return k === "unknown" && param !== "unknown" ? null : k;
}

// Is the visitor signed in, signed out, or is the auth service just
// unreachable? (S8-06, F-entrar-2.) Pure and dependency-free so it is unit
// tested; lib/auth.ts feeds it the result of `supabase.auth.getUser()`.
//
// A transient auth failure (network drop, GoTrue 5xx) must NEVER look like
// "signed out": that bounced signed-in people to the login page and dropped
// their deep link. Anonymous (QR guest) users are plain "user" here: the
// guest-claim chain does its own is_anonymous checks.

export type AuthState = "user" | "none" | "unreachable";

export type AuthErrorLike = {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
} | null;

export function classifyAuthResult(input: {
  user: unknown | null;
  error: AuthErrorLike;
}): AuthState {
  const { user, error } = input;
  if (user && !error) return "user";
  if (!error) return "none";
  if (error.name === "AuthSessionMissingError") return "none";
  if (error.name === "AuthRetryableFetchError") return "unreachable";
  const status = error.status;
  if (typeof status === "number") {
    // 0 = no response at all; 5xx = the service is down; 408 (timeout) and
    // 429 (rate limited) are transient too. Other 4xx = the token is bad or
    // the user is gone: signed out for our purposes.
    if (status === 0 || status === 408 || status === 429 || status >= 500) return "unreachable";
    if (status >= 400) return "none";
  }
  // Anything we cannot place (no status, unknown name): do not claim the
  // person is signed out.
  return "unreachable";
}

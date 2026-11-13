// "Is this still the person the screen was rendered for?" (S10 WP8, third
// review H1/L1/L2). Pure, dependency-light rules shared by:
//   - the server actions that take an optional `expectedUserId` (the five live
//     writes of the cup page and the three offline replays),
//   - the join screen's identity lookup (`classifyGuestLookup` in joinRules),
//   - the cross-tab notice (`components/layout/IdentityWatcher.tsx`).
//
// A guest's identity lives only in the browser cookie, so on a shared tablet a
// second person can replace it while an older tab still shows the first
// person's form. Without a check, that tab's next save would be written as the
// NEW person. Absent `expectedUserId` (legacy callers, cached bundles) means
// today's behaviour, unchanged.

import { isAuthSessionMissingError } from "@supabase/supabase-js";

/** Code thrown inside actions (and returned as ActionErrorCode) on a mismatch. */
export const IDENTITY_CHANGED = "identity_changed";

/**
 * Server rule. `currentUserId` is the cookie's user, or null when the cookie
 * holds NO user (the likeliest stale-tab state after "No soy": signed out and
 * nobody joined yet). With an expectation, no user and a different user are
 * both a mismatch. Without one, never a mismatch.
 */
export function identityMismatch(expectedUserId: string | undefined, currentUserId: string | null): boolean {
  return expectedUserId !== undefined && expectedUserId !== currentUserId;
}

// ─── getUser() classification (shared by the join screen and the watcher) ───

export type IdentityLookup = "same" | "different" | "unreachable";

type LookupError = { name?: string; status?: number; code?: string } | null;

/**
 * True when an auth error means "there is no session for this browser":
 * AuthSessionMissingError (auth-js's own guard, plus its name/code for
 * serialized copies) or ANY auth API error with a 4xx status
 * (refresh_token_not_found, refresh_token_already_used, session_expired,
 * session_not_found, 401, 403...). Everything else (status 0 /
 * AuthRetryableFetchError, 5xx, a thrown TypeError) is a transient failure.
 * AuthApiError carries its HTTP `status`, so the 4xx test covers it without
 * importing a second guard; a plain error-like object with a 4xx status counts
 * the same way.
 */
export function isNoSessionError(error: LookupError): boolean {
  if (!error) return false;
  if (isAuthSessionMissingError(error)) return true;
  if (error.name === "AuthSessionMissingError" || error.code === "session_not_found") return true;
  return typeof error.status === "number" && error.status >= 400 && error.status <= 499;
}

/**
 * Classifies a `supabase.auth.getUser()` result against the user id a screen
 * was rendered for. `isSame` decides what "the same person" means for the
 * caller (the join screen also demands an anonymous user).
 */
export function classifyIdentityLookup(
  result: { user: { id: string } | null; error: LookupError },
  isSame: (user: { id: string }) => boolean,
): IdentityLookup {
  const { user, error } = result;
  if (user) return isSame(user) ? "same" : "different";
  if (!error) return "different";
  return isNoSessionError(error) ? "different" : "unreachable";
}

// ─── cross-tab marker ───────────────────────────────────────────────────────

/** localStorage key written when the signed-in identity on this device changes. */
export const IDENTITY_EPOCH_KEY = "cata_identity_epoch";

export type IdentityMarker = { at: number; leftUserId: string };

export function serializeIdentityMarker(leftUserId: string, now: number): string {
  return JSON.stringify({ at: now, leftUserId } satisfies IdentityMarker);
}

export function parseIdentityMarker(raw: string | null): IdentityMarker | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; leftUserId?: unknown };
    if (typeof v.at !== "number" || typeof v.leftUserId !== "string") return null;
    return { at: v.at, leftUserId: v.leftUserId };
  } catch {
    return null;
  }
}

/**
 * Should THIS tab stop writing because another tab changed the identity?
 * "stop" = the marker names the user this tab was rendered for.
 * "recheck" = the marker names nobody (the leaving user was unknown to the
 * writer, e.g. the sign-out button): ask the server who is signed in.
 * "ignore" = another user left; this tab is unaffected.
 */
export function decideForMarker(
  renderedUserId: string,
  marker: IdentityMarker | null,
): "stop" | "recheck" | "ignore" {
  if (!marker) return "ignore";
  if (marker.leftUserId === renderedUserId) return "stop";
  if (marker.leftUserId === "") return "recheck";
  return "ignore";
}

/** Should this tab stop after a foreground re-check of the signed-in user? */
export function shouldStopForLookup(lookup: IdentityLookup): boolean {
  return lookup === "different";
}

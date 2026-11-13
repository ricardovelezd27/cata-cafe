// "Is this still the person the screen was rendered for?" (S10 WP8, third and
// fourth review). Pure, dependency-light rules shared by:
//   - the server actions that take an optional `expectedUserId` (the five live
//     writes of the cup page, the join form's onboarding and the offline
//     replays),
//   - the join screen's identity lookup (`classifyGuestLookup` in joinRules),
//   - the browser-side checks (`IdentityWatcher`, `lib/identityResolve.ts`).
//
// A guest's identity lives only in the browser cookie, so on a shared tablet a
// second person can replace it while an older tab still shows the first
// person's form. Without a check, that tab's next save would be written as the
// NEW person. Absent `expectedUserId` (legacy callers, cached bundles) means
// today's behaviour, unchanged.
//
// THE RULE (fourth round): "identity changed" means ONE thing: a user IS signed
// in on this device and it is a DIFFERENT user from the one the page was
// rendered for. "Nobody signed in" and "could not find out" are never an
// identity change; they behave exactly as on main.

import { isAuthSessionMissingError } from "@supabase/supabase-js";

/** Code thrown inside actions (and returned as ActionErrorCode) on a mismatch. */
export const IDENTITY_CHANGED = "identity_changed";

// ─── server rule ────────────────────────────────────────────────────────────

/** What the server saw when it asked "who is signed in?" (lib/auth.ts getAuthUser). */
export type ServerAuth = { state: "user"; userId: string } | { state: "none" } | { state: "unreachable" };

export type ServerIdentityDecision =
  /** Signed in as the expected user: go on. */
  | "proceed"
  /** A user IS signed in and it is a DIFFERENT one: refuse, write nothing. */
  | "identity_changed"
  /** Definitely nobody signed in: exactly what requireUser() does (not_authenticated). */
  | "as_unauthenticated"
  /** The auth lookup failed (network, 5xx, 408, 429): exactly what requireUser() does. */
  | "as_unreachable";

/**
 * Server rule for `requireUserExpecting`. Only a positive mismatch is
 * `identity_changed`. Without an expectation a signed-in user always proceeds.
 */
export function decideServerIdentity(auth: ServerAuth, expectedUserId: string | undefined): ServerIdentityDecision {
  if (auth.state === "none") return "as_unauthenticated";
  if (auth.state === "unreachable") return "as_unreachable";
  if (expectedUserId !== undefined && expectedUserId !== auth.userId) return "identity_changed";
  return "proceed";
}

// ─── getUser() classification (the join screen only) ────────────────────────

export type IdentityLookup = "same" | "different" | "unreachable";

type LookupError = { name?: string; status?: number; code?: string } | null;

/**
 * True when an auth error means "there is no session for this browser":
 * AuthSessionMissingError (auth-js's own guard, plus its name/code for
 * serialized copies) or ANY auth API error with a 4xx status. Used by the JOIN
 * screen's lookup (`classifyGuestLookup`), which is unchanged in the fourth
 * round; the cup page's watcher does not use it.
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
 * A storage marker arrived (another tab changed the identity). "recheck" when
 * it names the user this tab was rendered for, or nobody in particular (the
 * sign-out button does not know the leaver); "ignore" when another user left.
 */
export function decideForMarker(renderedUserId: string, marker: IdentityMarker | null): "recheck" | "ignore" {
  if (!marker) return "ignore";
  if (marker.leftUserId === renderedUserId || marker.leftUserId === "") return "recheck";
  return "ignore";
}

// ─── browser-side read (IdentityWatcher / CupClient) ────────────────────────

/** What this device's cookie holds, compared with the id the page was rendered for. */
export type BrowserIdentity = "same" | "different" | "none" | "unknown";

/**
 * Classifies `supabase.auth.getSession()` (a local read). An error is
 * "unknown" (never a verdict); a session is same or different by user id; no
 * session and no error is "none". No status-code guessing.
 */
export function classifyBrowserSession(
  result: { session: { user: { id: string } } | null; error: unknown },
  renderedUserId: string,
): BrowserIdentity {
  if (result.error) return "unknown";
  if (!result.session) return "none";
  return result.session.user.id === renderedUserId ? "same" : "different";
}

export type IdentityAction = "latch" | "clear" | "nothing";

/** On mount / foreground resume: different -> latch; same -> clear; none/unknown -> nothing. */
export function actionOnResume(identity: BrowserIdentity): IdentityAction {
  if (identity === "different") return "latch";
  if (identity === "same") return "clear";
  return "nothing";
}

/**
 * After a marker naming this tab's user: different or none -> latch (this tab
 * can no longer save as that person); same (they signed back in as themself)
 * and unknown (the next resume re-checks) -> nothing.
 */
export function actionOnMarkerRecheck(identity: BrowserIdentity): IdentityAction {
  return identity === "different" || identity === "none" ? "latch" : "nothing";
}

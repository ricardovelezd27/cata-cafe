// Pure "what happens when this person opens this invite link" rule (S8-11 T4).
// Shared by the /join page (which renders the state) and joinViaToken (which
// enforces it), so the two can never disagree. Dependency-free for vitest.

import { sessionHref } from "@/lib/sessionRouting";

export type JoinInvite = {
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
};

export type JoinSession = {
  id: string;
  status: string;
  closesAt: Date | null;
  startedAt: Date | null;
  isGroup: boolean;
  isAsync: boolean;
  createdBy: string;
  entriesLocked: boolean;
};

export type JoinViewer = {
  /** null = not signed in (a guest would be minted by the join form). */
  userId: string | null;
  isMember: boolean;
};

export type JoinDecision =
  /** Owner or existing member: go straight in, whatever the link state. */
  | { kind: "redirect"; href: string }
  /** A newcomer may be admitted. `late` = the session already started. */
  | { kind: "ok"; late: boolean }
  | { kind: "closed" }
  | { kind: "expired" }
  | { kind: "exhausted" }
  | { kind: "entries_closed" }
  | { kind: "invalid" };

export function evaluateJoin(
  input: { invite: JoinInvite | null; session: JoinSession | null; viewer: JoinViewer },
  locale: string,
  now: Date = new Date(),
): JoinDecision {
  const { invite, session, viewer } = input;
  // No such token, or the link points at a solo session (only group sessions
  // have a join flow).
  if (!invite || !session || !session.isGroup) return { kind: "invalid" };

  const isOwner = viewer.userId !== null && session.createdBy === viewer.userId;
  if (isOwner || viewer.isMember) {
    return { kind: "redirect", href: sessionHref(session, { locale, isOwner }, now) };
  }

  // Newcomer from here on. The session's own state wins over the link's, so
  // a closed session never reads as an "expired link".
  if (sessionHref(session, { locale, isOwner: false }, now).endsWith("/results")) {
    return { kind: "closed" };
  }
  // Late joiners cup everything (no per-sample cut-offs).
  if (session.entriesLocked) return { kind: "entries_closed" };
  if (!invite.active) return { kind: "expired" };
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime()) {
    return { kind: "expired" };
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    return { kind: "exhausted" };
  }
  return { kind: "ok", late: session.startedAt !== null };
}

/**
 * Which screen the join page renders for the signed-in viewer (S10 WP8,
 * F-guest-4). "identity" = ask "¿Eres <nombre>?" before acting as the browser's
 * anonymous user: a shared tablet may now be in the hands of someone else.
 * "decision" = today's behaviour, exactly what `evaluateJoin` says (redirect,
 * join button, refusal, or the guest form when nobody is signed in).
 *
 * Only an ANONYMOUS viewer whose decision is `redirect` (already a member) or
 * `ok` (newcomer) gets "identity". Registered users and refused links are
 * untouched. An owner is never anonymous, but if one were, they redirect.
 * TODO(kim-validar:E1): simulated answer, confirm with Kim.
 */
export type JoinScreen = "identity" | "decision";

export function joinScreenFor(
  decisionKind: JoinDecision["kind"],
  viewer: { userId: string | null; isAnonymous: boolean; isOwner?: boolean },
): JoinScreen {
  if (viewer.userId === null || !viewer.isAnonymous || viewer.isOwner) return "decision";
  return decisionKind === "redirect" || decisionKind === "ok" ? "identity" : "decision";
}

/**
 * Is the browser's current user still the guest this screen/tab is about?
 * A stale tab must never act (sign out, join, sync drafts) as a DIFFERENT
 * guest who joined on the same device since. `null` = no session / lookup gave
 * nothing. Registered users never match (the screen is anonymous-only).
 */
export function isSameAnonymousGuest(
  renderedUserId: string,
  current: { id: string; is_anonymous?: boolean } | null,
): boolean {
  return !!current && current.is_anonymous === true && current.id === renderedUserId;
}

/**
 * Classifies a `supabase.auth.getUser()` result against the guest a screen was
 * rendered for. A MISSING SESSION (AuthSessionMissingError, or a 401/403) is
 * "no user" = not the same guest (the commonest stale-tab case: another tab did
 * "No soy"), so callers refresh. Only a network failure or a 5xx is
 * "unreachable" (callers show an error and change nothing).
 */
export type GuestLookup = "same" | "different" | "unreachable";

export function classifyGuestLookup(
  renderedUserId: string,
  result: {
    user: { id: string; is_anonymous?: boolean } | null;
    error: { name?: string; status?: number; code?: string } | null;
  },
): GuestLookup {
  const { user, error } = result;
  if (user) return isSameAnonymousGuest(renderedUserId, user) ? "same" : "different";
  if (!error) return "different";
  if (error.name === "AuthSessionMissingError" || error.code === "session_not_found") return "different";
  if (error.status === 401 || error.status === 403) return "different";
  return "unreachable";
}

/**
 * What GuestJoinForm does when it finds a user at submit time.
 * - "registered": refresh (server shows the signed-in join form).
 * - "reuse": the anonymous user THIS tab created on an earlier try (S8-07
 *   F-guest-2: five retries create one user); keep going silently.
 * - "identity": any other anonymous user (the previous guest on a shared
 *   device): refresh so the server asks "¿Eres …?".
 * - "create": nobody is signed in.
 */
export function existingUserAction(
  existing: { id: string; is_anonymous?: boolean } | null,
  rememberedAnonId: string | null,
): "create" | "registered" | "reuse" | "identity" {
  if (!existing) return "create";
  if (!existing.is_anonymous) return "registered";
  return rememberedAnonId !== null && existing.id === rememberedAnonId ? "reuse" : "identity";
}

export type JoinRefusalCode =
  | "session_closed"
  | "token_expired"
  | "token_exhausted"
  | "entries_closed"
  | "invalid_token";

/**
 * The error code a refused newcomer gets — the same codes joinViaToken throws.
 * `null` = not a refusal ("ok", or "redirect" for an owner/member).
 * A revoked link (`invite.active === false`) reads as `token_expired`.
 */
export function joinRefusalCode(decision: JoinDecision): JoinRefusalCode | null {
  switch (decision.kind) {
    case "closed":
      return "session_closed";
    case "expired":
      return "token_expired";
    case "exhausted":
      return "token_exhausted";
    case "entries_closed":
      return "entries_closed";
    case "invalid":
      return "invalid_token";
    case "ok":
    case "redirect":
      return null;
  }
}

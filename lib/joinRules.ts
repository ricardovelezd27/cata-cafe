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

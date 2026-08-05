// Shared session authorization helpers for server actions.
//
// Prisma connects as the postgres role and BYPASSES RLS, so these TypeScript
// checks are the real authorization gate for every session-scoped mutation.
// requireUser() (lib/auth.ts) authenticates; these helpers authorize.
//
// All helpers throw Error("not_found_or_forbidden") without distinguishing
// "doesn't exist" from "not yours" — a probe must not learn which.

import { prisma } from "@/lib/prisma";

const SESSION_AUTH_SELECT = {
  id: true,
  createdBy: true,
  isGroup: true,
  status: true,
  startedAt: true,
} as const;

export type SessionAuthRow = {
  id: string;
  createdBy: string;
  isGroup: boolean;
  status: string;
  startedAt: Date | null;
};

/** The session's creator, or throws. Returns the session auth row so callers
 *  don't re-query for status/isGroup. */
export async function requireSessionOwner(
  sessionId: string,
  userId: string,
): Promise<SessionAuthRow> {
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: SESSION_AUTH_SELECT,
  });
  if (!session || session.createdBy !== userId) {
    throw new Error("not_found_or_forbidden");
  }
  return session;
}

/** Creator OR SessionParticipant. Solo sessions have no participant rows —
 *  the creator check covers them. Single round-trip. */
export async function requireSessionMember(
  sessionId: string,
  userId: string,
): Promise<SessionAuthRow> {
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: {
      ...SESSION_AUTH_SELECT,
      participants: { where: { userId }, select: { userId: true }, take: 1 },
    },
  });
  if (
    !session ||
    (session.createdBy !== userId && session.participants.length === 0)
  ) {
    throw new Error("not_found_or_forbidden");
  }
  return {
    id: session.id,
    createdBy: session.createdBy,
    isGroup: session.isGroup,
    status: session.status,
    startedAt: session.startedAt,
  };
}

/** Member access resolved through a sample id; returns the sample's real
 *  sessionId (never trust a client-supplied one alongside a sample id).
 *  Single round-trip — this guards the 800ms-debounced auto-save hot path. */
export async function requireSampleMember(
  sessionSampleId: string,
  userId: string,
): Promise<{ sessionId: string }> {
  const sample = await prisma.sessionSample.findUnique({
    where: { id: sessionSampleId },
    select: {
      sessionId: true,
      session: {
        select: {
          createdBy: true,
          participants: { where: { userId }, select: { userId: true }, take: 1 },
        },
      },
    },
  });
  if (
    !sample ||
    (sample.session.createdBy !== userId &&
      sample.session.participants.length === 0)
  ) {
    throw new Error("not_found_or_forbidden");
  }
  return { sessionId: sample.sessionId };
}

/** Owner access resolved through a sample id; returns the sample's sessionId. */
export async function requireSampleOwner(
  sessionSampleId: string,
  userId: string,
): Promise<{ sessionId: string }> {
  const sample = await prisma.sessionSample.findUnique({
    where: { id: sessionSampleId },
    select: { sessionId: true, session: { select: { createdBy: true } } },
  });
  if (!sample || sample.session.createdBy !== userId) {
    throw new Error("not_found_or_forbidden");
  }
  return { sessionId: sample.sessionId };
}

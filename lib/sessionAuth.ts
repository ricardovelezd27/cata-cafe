// Shared session authorization helpers for server actions.
//
// Prisma connects as the postgres role and BYPASSES RLS, so these TypeScript
// checks are the real authorization gate for every session-scoped mutation.
// requireUser() (lib/auth.ts) authenticates; these helpers authorize.
//
// All helpers throw Error("not_found_or_forbidden") without distinguishing
// "doesn't exist" from "not yours" — a probe must not learn which.
//
// Every helper also returns the session `status` so callers can run
// assertSessionWritable() — a closed session is read-only for everyone.

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

// Re-exported from the pure module so callers keep one import site.
export { assertSessionWritable, isSessionClosed } from "@/lib/sessionState";

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

/** Also carries the two session fields scoring must never take from the
 *  client: `cupsPerSample` decides whether uniformity/defect penalties apply
 *  (≥5 cups) and `format` decides which JSON column an evaluation lands in. */
export type SampleAuthRow = {
  sessionId: string;
  status: string;
  cupsPerSample: number;
  format: string;
};

/** Member access resolved through a sample id; returns the sample's real
 *  sessionId (never trust a client-supplied one alongside a sample id) plus
 *  the session status for assertSessionWritable. Single round-trip — this
 *  guards the 800ms-debounced auto-save hot path. */
export async function requireSampleMember(
  sessionSampleId: string,
  userId: string,
): Promise<SampleAuthRow> {
  const sample = await prisma.sessionSample.findUnique({
    where: { id: sessionSampleId },
    select: {
      sessionId: true,
      session: {
        select: {
          createdBy: true,
          status: true,
          cupsPerSample: true,
          format: true,
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
  return {
    sessionId: sample.sessionId,
    status: sample.session.status,
    cupsPerSample: sample.session.cupsPerSample,
    format: sample.session.format,
  };
}

/** Owner access resolved through a sample id; returns the sample's sessionId
 *  and the session status. */
export async function requireSampleOwner(
  sessionSampleId: string,
  userId: string,
): Promise<SampleAuthRow> {
  const sample = await prisma.sessionSample.findUnique({
    where: { id: sessionSampleId },
    select: {
      sessionId: true,
      session: {
        select: { createdBy: true, status: true, cupsPerSample: true, format: true },
      },
    },
  });
  if (!sample || sample.session.createdBy !== userId) {
    throw new Error("not_found_or_forbidden");
  }
  return {
    sessionId: sample.sessionId,
    status: sample.session.status,
    cupsPerSample: sample.session.cupsPerSample,
    format: sample.session.format,
  };
}

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
  isAsync: true,
  status: true,
  startedAt: true,
  closesAt: true,
  referenceMode: true,
} as const;

export type SessionAuthRow = {
  id: string;
  createdBy: string;
  isGroup: boolean;
  isAsync: boolean;
  status: string;
  startedAt: Date | null;
  closesAt: Date | null;
  /** "anchor" | "free" (B1), read server-side so no path trusts the client. */
  referenceMode: string;
};

// Re-exported from the pure module so callers keep one import site.
export { assertSessionWritable, assertSessionStarted, isSessionClosed, isSessionExpired } from "@/lib/sessionState";

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
    isAsync: session.isAsync,
    status: session.status,
    startedAt: session.startedAt,
    closesAt: session.closesAt,
    referenceMode: session.referenceMode,
  };
}

/** Also carries the two session fields scoring must never take from the
 *  client: `cupsPerSample` sizes the cup deduction
 *  (lib/scoring.ts cupDeduction) and `format` decides which JSON column an evaluation lands in. */
export type SampleAuthRow = {
  sessionId: string;
  /** The sample's own `revealed` flag (S10 WP3a, X3): a revealed sample of an
   *  open session is frozen for evaluation (`evaluationWriteRefusal` in lib/sessionState.ts). */
  revealed: boolean;
  status: string;
  cupsPerSample: number;
  format: string;
  // The session's "Referencia" sample, so the evaluation write paths can pin
  // its affective ratings (lib/referenceRules.ts) without a second query.
  referenceSampleId: string | null;
  /** "anchor" | "free" (B1): decides whether the active reference is pinned. Read here so no server path trusts the client. */
  referenceMode: string;
  // Cutover + start rules (assertSessionWritable / assertSessionStarted).
  closesAt: Date | null;
  isGroup: boolean;
  isAsync: boolean;
  startedAt: Date | null;
  isOwner: boolean;
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
      revealed: true,
      session: {
        select: {
          createdBy: true,
          status: true,
          closesAt: true,
          isGroup: true,
          isAsync: true,
          startedAt: true,
          cupsPerSample: true,
          format: true,
          referenceSampleId: true,
          referenceMode: true,
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
    revealed: sample.revealed,
    status: sample.session.status,
    cupsPerSample: sample.session.cupsPerSample,
    format: sample.session.format,
    referenceSampleId: sample.session.referenceSampleId,
    referenceMode: sample.session.referenceMode,
    closesAt: sample.session.closesAt,
    isGroup: sample.session.isGroup,
    isAsync: sample.session.isAsync,
    startedAt: sample.session.startedAt,
    isOwner: sample.session.createdBy === userId,
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
      revealed: true,
      session: {
        select: {
          createdBy: true,
          status: true,
          closesAt: true,
          isGroup: true,
          isAsync: true,
          startedAt: true,
          cupsPerSample: true,
          format: true,
          referenceSampleId: true,
          referenceMode: true,
        },
      },
    },
  });
  if (!sample || sample.session.createdBy !== userId) {
    throw new Error("not_found_or_forbidden");
  }
  return {
    sessionId: sample.sessionId,
    revealed: sample.revealed,
    status: sample.session.status,
    cupsPerSample: sample.session.cupsPerSample,
    format: sample.session.format,
    referenceSampleId: sample.session.referenceSampleId,
    referenceMode: sample.session.referenceMode,
    closesAt: sample.session.closesAt,
    isGroup: sample.session.isGroup,
    isAsync: sample.session.isAsync,
    startedAt: sample.session.startedAt,
    isOwner: true,
  };
}

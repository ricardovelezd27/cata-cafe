import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import {
  exactEmailMatches,
  impactOf,
  planAccountDeletion,
  type AccountDeletionImpact,
  type DeletionFixture,
} from "@/lib/accountDeletion/plan";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Reads what the database holds for ONE person, in the shape the pure planner
 * takes. Read only. The caller authorizes (it must be the person's own id).
 * Pass the transaction client to re-read inside deleteAccount's transaction.
 */
export async function loadDeletionFixture(
  user: { id: string; email?: string | null; is_anonymous?: boolean },
  db: Db = prisma,
): Promise<DeletionFixture> {
  const userId = user.id;
  const email = user.email ? user.email.trim().toLowerCase() : null;

  const [ownedSessions, participations, evaluations, ownedGroups, liveOwnedCoffees] =
    await Promise.all([
      db.cuppingSession.findMany({
        where: { createdBy: userId },
        select: { id: true, isGroup: true, status: true },
      }),
      db.sessionParticipant.findMany({
        where: { userId },
        select: { sessionId: true, excludedFromResults: true },
      }),
      db.evaluation.findMany({
        where: { cupperId: userId },
        select: { sessionSample: { select: { sessionId: true } } },
      }),
      db.tastingGroup.findMany({ where: { createdBy: userId }, select: { id: true } }),
      db.coffee.count({ where: { createdBy: userId, deletedAt: null } }),
    ]);

  const ownedIds = ownedSessions.map((s) => s.id);
  const othersBySession = new Map<string, number>();
  if (ownedIds.length > 0) {
    const rows = await db.sessionSample.findMany({
      where: { sessionId: { in: ownedIds } },
      select: {
        sessionId: true,
        _count: { select: { evaluations: { where: { cupperId: { not: userId } } } } },
      },
    });
    for (const r of rows) {
      othersBySession.set(r.sessionId, (othersBySession.get(r.sessionId) ?? 0) + r._count.evaluations);
    }
  }

  // Other people who JOINED the person's sessions (status "joined"/"owner";
  // anything but "invited" counts, so an unexpected value keeps the session).
  const joinedBySession = new Map<string, number>();
  if (ownedIds.length > 0) {
    const joined = await db.sessionParticipant.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: ownedIds }, userId: { not: userId }, status: { not: "invited" } },
      _count: { _all: true },
    });
    for (const j of joined) joinedBySession.set(j.sessionId, j._count._all);
  }

  // Members that are someone else: linked to another id, or pending by an
  // address that is not the person's own.
  const groupIds = ownedGroups.map((g) => g.id);
  const otherMembersByGroup = new Map<string, number>();
  if (groupIds.length > 0) {
    const members = await db.tastingGroupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, userId: true, email: true },
    });
    for (const m of members) {
      const isSelf = m.userId === userId || (!m.userId && exactEmailMatches([m], email).length > 0);
      if (isSelf) continue;
      otherMembersByGroup.set(m.groupId, (otherMembersByGroup.get(m.groupId) ?? 0) + 1);
    }
  }

  return {
    userId,
    email,
    isAnonymous: user.is_anonymous === true,
    isSuperAdmin: isSuperAdminEmail(email),
    ownedSessions: ownedSessions.map((s) => ({
      id: s.id,
      isGroup: s.isGroup,
      status: s.status,
      otherCupperEvaluations: othersBySession.get(s.id) ?? 0,
      otherJoinedParticipants: joinedBySession.get(s.id) ?? 0,
    })),
    participations,
    evaluationSessionIds: evaluations.map((e) => e.sessionSample.sessionId),
    ownedGroups: groupIds.map((id) => ({ id, otherMembers: otherMembersByGroup.get(id) ?? 0 })),
    liveOwnedCoffees,
  };
}

/** Counts for the confirm dialog. Self only: takes the signed-in user. */
export async function getAccountDeletionImpact(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
}): Promise<AccountDeletionImpact> {
  return impactOf(planAccountDeletion(await loadDeletionFixture(user)));
}

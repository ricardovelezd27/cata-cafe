// Derives the current user's "co-cupper" network: everyone they've shared a
// group cupping session with (as owner or participant), most-recent session
// first, with session/evaluation counts. Extracted from
// app/[locale]/app/team/page.tsx so the derivation has a single source of
// truth — the page consumes this with no visual change.

import { prisma } from "@/lib/prisma";

export interface CoCupperCandidate {
  userId: string;
  displayName: string;
  role: string;
  sessionCount: number;
  evaluationCount: number;
  lastSessionName: string;
  lastSessionDate: Date;
}

export async function getCoCupperCandidates(
  userId: string,
): Promise<CoCupperCandidate[]> {
  // Step 1: collect all group session IDs the current user is involved in
  const [asParticipant, asCreator] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where: { userId },
      select: { sessionId: true },
    }),
    prisma.cuppingSession.findMany({
      where: { createdBy: userId, isGroup: true },
      select: { id: true },
    }),
  ]);

  const sessionIds = [
    ...new Set([
      ...asParticipant.map((p) => p.sessionId),
      ...asCreator.map((s) => s.id),
    ]),
  ];

  // Step 2: all other participants across those sessions (most-recent first)
  const rows =
    sessionIds.length > 0
      ? await prisma.sessionParticipant.findMany({
          where: { sessionId: { in: sessionIds }, userId: { not: userId } },
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            session: { select: { name: true, date: true } },
          },
          orderBy: { session: { date: "desc" } },
        })
      : [];

  // Deduplicate — keep first occurrence (most recent session) per userId
  const seen = new Set<string>();
  const cupperMap = new Map<
    string,
    { displayName: string; role: string; sessionCount: number; lastSessionDate: Date; lastSessionName: string }
  >();

  for (const row of rows) {
    if (!seen.has(row.userId)) {
      seen.add(row.userId);
      cupperMap.set(row.userId, {
        displayName: row.user.displayName,
        role: row.user.role,
        sessionCount: 1,
        lastSessionDate: row.session.date,
        lastSessionName: row.session.name,
      });
    } else {
      cupperMap.get(row.userId)!.sessionCount++;
    }
  }

  // Step 3: evaluation counts per cupper
  const cupperIds = [...cupperMap.keys()];
  const evalCounts =
    cupperIds.length > 0
      ? await prisma.evaluation.groupBy({
          by: ["cupperId"],
          where: { cupperId: { in: cupperIds } },
          _count: { id: true },
        })
      : [];

  const evalCountMap = new Map(evalCounts.map((e) => [e.cupperId, e._count.id]));

  return [...cupperMap.entries()].map(([id, data]) => ({
    userId: id,
    displayName: data.displayName,
    role: data.role,
    sessionCount: data.sessionCount,
    evaluationCount: evalCountMap.get(id) ?? 0,
    lastSessionName: data.lastSessionName,
    lastSessionDate: data.lastSessionDate,
  }));
}

// Coffee-history sync, shared by the close routine (lib/closeSession.ts) and
// the session-delete path. Plain library functions — NOT server actions. The
// old exported `syncCoffeeHistory` action was a public HTTP endpoint that never
// checked session ownership; callers must authorize (requireSessionOwner or
// equivalent) BEFORE calling anything here.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Upserts UserCoffeeHistory for every revealed, coffee-linked sample with
 *  submitted evaluations in the session. Idempotent — safe to re-run.
 *  `includeUnrevealed` is used by the delete path only: once the session is
 *  gone, blindness is moot and the cupper should still keep the coffee. */
export async function syncCoffeeHistoryForSession(
  sessionId: string,
  opts: { includeUnrevealed?: boolean; db?: Db } = {},
) {
  const db = opts.db ?? prisma;
  const samples = await db.sessionSample.findMany({
    where: {
      sessionId,
      coffeeId: { not: null },
      ...(opts.includeUnrevealed ? {} : { revealed: true }),
    },
    include: {
      evaluations: {
        where: { isDraft: false },
        select: {
          id: true,
          cupperId: true,
          individualScore: true,
          sessionSampleId: true,
        },
      },
      aggregateScore: {
        select: { communityScore: true },
      },
    },
  });

  const session = await db.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });

  const tastedAt = session?.date ?? new Date();
  const upserts = [];

  for (const sample of samples) {
    if (!sample.coffeeId) continue;
    const coffeeId = sample.coffeeId;
    const communityScore = sample.aggregateScore?.communityScore ?? null;

    for (const evaluation of sample.evaluations) {
      upserts.push(
        db.userCoffeeHistory.upsert({
          where: {
            userId_coffeeId_sessionId: {
              userId: evaluation.cupperId,
              coffeeId,
              sessionId,
            },
          },
          create: {
            userId: evaluation.cupperId,
            coffeeId,
            evaluationId: evaluation.id,
            sessionId,
            individualScore: evaluation.individualScore,
            communityScore,
            tastedAt,
          },
          update: {
            individualScore: evaluation.individualScore,
            communityScore,
          },
        }),
      );
    }
  }

  // One transaction instead of one round-trip per evaluation. At 100 samples ×
  // dozens of cuppers this collapses thousands of sequential upserts into a
  // single batched call, keeping closeSession well under the action timeout.
  // When already inside a transaction (delete path) just await sequentially.
  if (upserts.length > 0) {
    if (opts.db) {
      for (const u of upserts) await u;
    } else {
      await prisma.$transaction(upserts);
    }
  }

  return { ok: true, rows: upserts.length };
}

export type HistorySnapshot = {
  v: 1;
  sessionName: string;
  format: string;
  date: string;
  cupsPerSample: number;
  sampleLabel: string;
  /** Only THIS cupper's own module data — never another participant's. */
  myEvaluation: {
    descriptive: unknown;
    affective: unknown;
    combined: unknown;
  };
};

/**
 * Before a session is deleted: make sure every cupper keeps a self-contained
 * coffee-history row for every coffee-linked sample they submitted (revealed
 * or not), and stamp it with a snapshot of their OWN evaluation + the session
 * metadata. The session/evaluation FKs then go NULL on delete (SetNull) and
 * the profile / coffee-detail pages read `snapshot` instead of the relation.
 * Must run inside the same transaction as the delete.
 */
export async function detachCoffeeHistoryForSession(
  db: Prisma.TransactionClient,
  sessionId: string,
): Promise<{ detached: number }> {
  const session = await db.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { name: true, format: true, date: true, cupsPerSample: true },
  });
  if (!session) return { detached: 0 };

  // Ensure rows exist for everything submitted (incl. unrevealed samples).
  await syncCoffeeHistoryForSession(sessionId, { includeUnrevealed: true, db });

  const samples = await db.sessionSample.findMany({
    where: { sessionId, coffeeId: { not: null } },
    select: {
      coffeeId: true,
      label: true,
      evaluations: {
        where: { isDraft: false },
        select: {
          cupperId: true,
          descriptiveData: true,
          affectiveData: true,
          combinedData: true,
        },
      },
    },
  });

  const now = new Date();
  let detached = 0;
  for (const sample of samples) {
    if (!sample.coffeeId) continue;
    for (const ev of sample.evaluations) {
      const snapshot: HistorySnapshot = {
        v: 1,
        sessionName: session.name,
        format: session.format,
        date: session.date.toISOString(),
        cupsPerSample: session.cupsPerSample,
        sampleLabel: sample.label,
        myEvaluation: {
          descriptive: ev.descriptiveData,
          affective: ev.affectiveData,
          combined: ev.combinedData,
        },
      };
      const res = await db.userCoffeeHistory.updateMany({
        where: { userId: ev.cupperId, coffeeId: sample.coffeeId, sessionId },
        data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, detachedAt: now },
      });
      detached += res.count;
    }
  }

  // Cut the FKs ourselves BEFORE the caller deletes the session. Relying on
  // the DB's ON DELETE SET NULL fails here: the rows above were written in
  // this same transaction, so Postgres re-checks every FK on them when the
  // session's SET NULL action updates sessionId — and by then the cascade
  // has already removed the evaluations, so the still-set evaluationId
  // violates user_coffee_history_evaluationId_fkey (P2003, seen 2026-09-24
  // on every closed session with submitted coffee-linked evaluations).
  await db.userCoffeeHistory.updateMany({
    where: { sessionId },
    data: { sessionId: null, evaluationId: null },
  });
  return { detached };
}

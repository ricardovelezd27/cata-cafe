// Coffee-history sync, shared by the close routine (lib/closeSession.ts) and
// the session-delete path. Plain library functions — NOT server actions. The
// old exported `syncCoffeeHistory` action was a public HTTP endpoint that never
// checked session ownership; callers must authorize (requireSessionOwner or
// equivalent) BEFORE calling anything here.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { historyCommunityScore } from "@/lib/historyRules";

type Db = Prisma.TransactionClient | typeof prisma;

type LabelRowInput = {
  userId: string;
  evaluationId: string;
  sessionId: string;
  individualScore: number | null;
  tastedAt: Date;
  snapshot: Prisma.InputJsonValue;
};

/**
 * Find-or-create the LABEL-ONLY (coffeeId NULL) history row of one evaluation.
 * The (userId, coffeeId, sessionId) unique does not dedupe NULL coffeeIds, so
 * the row is keyed on its evaluation instead: one submitted evaluation = one
 * (cupper, sample) pair = at most one label-only row. Sequential, so it is safe
 * inside the delete transaction and idempotent on re-run. Callers are
 * single-flight (close is an idempotent updateMany; assign/delete are owner
 * actions), so no DB-level partial unique index is needed.
 */
async function ensureLabelRows(db: Db, rows: LabelRowInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const existing = await db.userCoffeeHistory.findMany({
    where: { coffeeId: null, evaluationId: { in: rows.map((r) => r.evaluationId) } },
    select: { id: true, evaluationId: true },
  });
  const byEval = new Map(existing.map((e) => [e.evaluationId, e.id]));
  for (const r of rows) {
    const id = byEval.get(r.evaluationId);
    if (id) {
      await db.userCoffeeHistory.update({
        where: { id },
        data: { individualScore: r.individualScore, snapshot: r.snapshot },
      });
    } else {
      await db.userCoffeeHistory.create({
        data: {
          userId: r.userId,
          coffeeId: null,
          evaluationId: r.evaluationId,
          sessionId: r.sessionId,
          individualScore: r.individualScore,
          communityScore: null,
          tastedAt: r.tastedAt,
          snapshot: r.snapshot,
        },
      });
    }
  }
  return rows.length;
}

/** Upserts UserCoffeeHistory for every revealed, coffee-linked sample with
 *  submitted evaluations in the session, plus a label-only (coffeeId NULL) row
 *  for every submitted evaluation on a coffee-LESS sample (F-express-2).
 *  When a coffee-less sample later gets a coffee, its label-only rows are
 *  REPLACED by the normal coffee row (deleted in the same batch). Idempotent.
 */
export async function syncCoffeeHistoryForSession(
  sessionId: string,
  opts: { db?: Db } = {},
) {
  const db = opts.db ?? prisma;
  const samples = await db.sessionSample.findMany({
    where: {
      sessionId,
      coffeeId: { not: null },
      revealed: true,
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
        select: { communityScore: true, participantCount: true },
      },
    },
  });

  const session = await db.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });

  const tastedAt = session?.date ?? new Date();
  const upserts = [];

  // Assignment replaces: drop the label-only rows of evaluations whose sample
  // now has a (revealed) coffee, BEFORE the coffee rows are upserted.
  const linkedEvalIds = samples.flatMap((sm) => sm.evaluations.map((e) => e.id));
  if (linkedEvalIds.length > 0) {
    upserts.push(
      db.userCoffeeHistory.deleteMany({
        where: { coffeeId: null, evaluationId: { in: linkedEvalIds } },
      }),
    );
  }

  for (const sample of samples) {
    if (!sample.coffeeId) continue;
    const coffeeId = sample.coffeeId;
    // S8-04: null unless a real included evaluation exists (lib/historyRules.ts).
    const communityScore = historyCommunityScore(sample.aggregateScore);

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

  // Coffee-less samples: one label-only row per submitted evaluation.
  const lessSamples = await db.sessionSample.findMany({
    where: { sessionId, coffeeId: null },
    select: {
      label: true,
      evaluations: {
        where: { isDraft: false },
        select: { id: true, cupperId: true, individualScore: true },
      },
    },
  });
  const labelRows: LabelRowInput[] = lessSamples.flatMap((sm) =>
    sm.evaluations.map((e) => ({
      userId: e.cupperId,
      evaluationId: e.id,
      sessionId,
      individualScore: e.individualScore,
      tastedAt,
      snapshot: { v: 1, sampleLabel: sm.label } as unknown as Prisma.InputJsonValue,
    })),
  );
  const labelCount = await ensureLabelRows(db, labelRows);

  return { ok: true, rows: upserts.length + labelCount };
}

export type HistorySnapshot = {
  v: 1;
  sessionName: string;
  format: string;
  date: string;
  cupsPerSample: number;
  sampleLabel: string;
  /** Label-only row of a never-revealed sample (S8-16). Carries NO coffee field. */
  unrevealed?: true;
  /** Only THIS cupper's own module data — never another participant's. */
  myEvaluation: {
    descriptive: unknown;
    affective: unknown;
    combined: unknown;
  };
};

/**
 * Before a session is deleted: make sure every cupper keeps a self-contained
 * coffee-history row for every REVEALED coffee-linked sample they submitted
 * (a never-revealed sample stays blind: deleting an open blind session must not
 * leak the coffee name into cuppers' history, S8-02 F-sesiones-11), and stamp it with a snapshot of their OWN evaluation + the session
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

  await syncCoffeeHistoryForSession(sessionId, { db });

  const now = new Date();
  let detached = 0;
  const snapshotOf = (
    label: string,
    ev: { descriptiveData: unknown; affectiveData: unknown; combinedData: unknown },
    unrevealed: boolean,
  ): Prisma.InputJsonValue => {
    const snap: HistorySnapshot = {
      v: 1,
      sessionName: session.name,
      format: session.format,
      date: session.date.toISOString(),
      cupsPerSample: session.cupsPerSample,
      sampleLabel: label,
      ...(unrevealed ? { unrevealed: true as const } : {}),
      myEvaluation: {
        descriptive: ev.descriptiveData,
        affective: ev.affectiveData,
        combined: ev.combinedData,
      },
    };
    return snap as unknown as Prisma.InputJsonValue;
  };

  // Label-only rows (S8-16). A coffee-LESS sample already got its row from the
  // sync above; here it gets the full own-evaluation snapshot. A never-revealed
  // coffee-linked sample (D8) gets a row with coffeeId NULL: only the sample
  // label, the session metadata and the cupper's OWN evaluation — the select
  // below deliberately never reads the coffee, so nothing can leak into it.
  const labelSamples = await db.sessionSample.findMany({
    where: { sessionId, OR: [{ coffeeId: null }, { revealed: false }] },
    select: {
      label: true,
      coffeeId: true,
      evaluations: {
        where: { isDraft: false },
        select: {
          id: true,
          cupperId: true,
          individualScore: true,
          descriptiveData: true,
          affectiveData: true,
          combinedData: true,
        },
      },
    },
  });
  const labelRows: LabelRowInput[] = labelSamples.flatMap((sm) =>
    sm.evaluations.map((ev) => ({
      userId: ev.cupperId,
      evaluationId: ev.id,
      sessionId,
      individualScore: ev.individualScore,
      tastedAt: session.date,
      snapshot: snapshotOf(sm.label, ev, sm.coffeeId !== null),
    })),
  );
  await ensureLabelRows(db, labelRows);
  if (labelRows.length > 0) {
    const res = await db.userCoffeeHistory.updateMany({
      where: { coffeeId: null, evaluationId: { in: labelRows.map((r) => r.evaluationId) } },
      data: { detachedAt: now },
    });
    detached += res.count;
  }

  const samples = await db.sessionSample.findMany({
    where: { sessionId, coffeeId: { not: null }, revealed: true },
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

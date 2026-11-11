import "server-only";
import { effectiveClientTs } from "@/lib/offline/clientWrite";
import type { tryComputeEvaluationDerived } from "@/lib/evaluation";
import { submittedRefireArgs } from "@/lib/aggregateRefire";

// S8-18: the ONE write of an evaluation's content, shared by the live
// `upsertEvaluation` and the offline replay. Callers authorize first.
//
// Without a (valid) `clientTs` this is the legacy upsert, unchanged. With one
// the write is ordered ATOMICALLY in the database: a conditional update whose
// WHERE admits the row only if its `lastClientWriteAt` is null or not newer
// (the rule of `shouldApplyClientWrite`, expressed as a predicate), so the
// normal case (row exists, write is newest) is still ONE round trip.
// `applied: false` = a newer write already won; nothing was changed.

type Fields = NonNullable<ReturnType<typeof tryComputeEvaluationDerived>>;

function isCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === code;
}

/** The slice of the Prisma client this module uses (callers pass the singleton). */
export interface EvaluationWriteDb {
  evaluation: {
    upsert(args: Record<string, unknown>): Promise<{ id: string; isDraft?: boolean }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findUnique(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  $transaction<T>(fn: (tx: EvaluationWriteDb) => Promise<T>): Promise<T>;
}

// B-01 (S8-22): the S8-04 re-fire of an ALREADY SUBMITTED row (a no-op write
// naming "isDraft" so trg_recompute_aggregate runs) now happens in the SAME
// transaction as the data write, so a failure of the trigger rolls the data
// back instead of leaving new data with a stale aggregate. The draft auto-save
// hot path (row exists and is a draft) stays ONE statement, no transaction:
// its UPDATE is guarded by isDraft: true and only a miss falls to the
// transactional path.
export async function writeEvaluationOrdered(prisma: EvaluationWriteDb, input: {
  sessionSampleId: string;
  sessionId: string;
  cupperId: string;
  fields: Fields;
  clientTs: unknown;
}): Promise<{ id: string; applied: boolean }> {
  const { sessionSampleId, sessionId, cupperId, fields } = input;
  const key = { sessionSampleId_cupperId: { sessionSampleId, cupperId } };
  const ts = effectiveClientTs(input.clientTs, Date.now());

  if (ts === undefined) {
    // Legacy bundles without a stamp: the unordered upsert, atomic with the
    // re-fire when the row it replaced was already submitted.
    return prisma.$transaction(async (tx) => {
      const row = await tx.evaluation.upsert({
        where: key,
        create: { sessionSampleId, sessionId, cupperId, ...fields },
        update: { sessionId, ...fields },
        select: { id: true, isDraft: true },
      });
      if (row.isDraft === false) await tx.evaluation.updateMany(submittedRefireArgs(row.id));
      return { id: row.id, applied: true };
    });
  }

  const stamp = new Date(ts);
  const ordered = {
    ...key,
    OR: [{ lastClientWriteAt: null }, { lastClientWriteAt: { lte: stamp } }],
  };
  const data = { sessionId, ...fields, lastClientWriteAt: stamp };

  // Hot path: an existing DRAFT row, newest write. One statement.
  try {
    const row = await prisma.evaluation.update({
      where: { ...ordered, isDraft: true },
      data,
      select: { id: true },
    });
    return { id: row.id, applied: true };
  } catch (e) {
    if (!isCode(e, "P2025")) throw e;
  }

  // The row is submitted, absent, or a newer write won. Update + re-fire
  // atomically; null = no row admitted (a P2025 is a client-side miss, it does
  // not abort the Postgres transaction).
  const txUpdate = () =>
    prisma.$transaction(async (tx) => {
      let id: string;
      try {
        id = (await tx.evaluation.update({ where: ordered, data, select: { id: true } })).id;
      } catch (e) {
        if (!isCode(e, "P2025")) throw e;
        return null;
      }
      await tx.evaluation.updateMany(submittedRefireArgs(id));
      return id;
    });

  const updated = await txUpdate();
  if (updated) return { id: updated, applied: true };

  // No row admitted: either it does not exist yet (create it) or a newer write
  // already won (the create hits the unique key: ignore this one). A new row is
  // a draft, so there is nothing to re-fire. The create stays OUTSIDE the
  // transaction: a P2002 would abort it.
  try {
    const row = await prisma.evaluation.create({
      data: { sessionSampleId, sessionId, cupperId, ...fields, lastClientWriteAt: stamp },
      select: { id: true },
    });
    return { id: row.id, applied: true };
  } catch (e) {
    if (!isCode(e, "P2002")) throw e;
  }
  // The row exists. One more conditional update covers a concurrent first save
  // that took the create path; a second miss means a newer write is stored.
  const again = await txUpdate();
  if (again) return { id: again, applied: true };
  const current = await prisma.evaluation.findUnique({ where: key, select: { id: true } });
  if (!current) throw new Error("not_found");
  return { id: current.id, applied: false };
}

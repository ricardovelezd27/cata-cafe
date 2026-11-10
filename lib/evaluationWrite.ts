import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveClientTs } from "@/lib/offline/clientWrite";
import type { tryComputeEvaluationDerived } from "@/lib/evaluation";

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

export async function writeEvaluationOrdered(input: {
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
    const row = await prisma.evaluation.upsert({
      where: key,
      create: { sessionSampleId, sessionId, cupperId, ...fields },
      update: { sessionId, ...fields },
      select: { id: true },
    });
    return { id: row.id, applied: true };
  }

  const stamp = new Date(ts);
  const ordered = {
    ...key,
    OR: [{ lastClientWriteAt: null }, { lastClientWriteAt: { lte: stamp } }],
  };
  const tryUpdate = () =>
    prisma.evaluation.update({
      where: ordered,
      data: { sessionId, ...fields, lastClientWriteAt: stamp },
      select: { id: true },
    });

  try {
    const row = await tryUpdate();
    return { id: row.id, applied: true };
  } catch (e) {
    if (!isCode(e, "P2025")) throw e;
  }
  // No row admitted: either it does not exist yet (create it) or a newer write
  // already won (the create hits the unique key: ignore this one).
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
  try {
    const row = await tryUpdate();
    return { id: row.id, applied: true };
  } catch (e) {
    if (!isCode(e, "P2025")) throw e;
  }
  const current = await prisma.evaluation.findUnique({ where: key, select: { id: true } });
  if (!current) throw new Error("not_found");
  return { id: current.id, applied: false };
}

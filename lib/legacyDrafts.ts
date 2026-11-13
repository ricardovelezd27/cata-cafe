import type { Prisma } from "@/app/generated/prisma/client";
import { moduleKeyForFormat, tryComputeEvaluationDerived } from "@/lib/evaluation";
import { logWarn } from "@/lib/log";
import { isPinnedModule, pinReferenceAffective } from "@/lib/referenceRules";

/**
 * S10 WP1a (review M3 / second review H2, L6, L9): a draft saved BEFORE the
 * 2026-11 deploy has `evaluations.cups` NULL (the migration does not backfill),
 * which means "scored under the old rule". If its cupper submits AFTER the
 * deploy, the submit only flips `isDraft`, so the row would keep the old rule
 * for its individual score while the group aggregate (the trigger) already
 * counts it under the new one.
 *
 * Two steps, so the normal submit stays what it always was:
 *  1. `hasLegacyDrafts` runs OUTSIDE any transaction. From the first week after
 *     the deploy it returns false almost always, and the caller then does the
 *     plain `updateMany` (no interactive transaction, no connection held, no
 *     lock held across the per-row trigger).
 *  2. Only when legacy drafts exist does the caller open a transaction (with
 *     explicit limits) and run `recomputeLegacyDraftsInTx` right BEFORE the
 *     flip: every one of the caller's still-draft evaluations whose `cups` is
 *     NULL has its derived fields recomputed through the SAME function the save
 *     path uses (`tryComputeEvaluationDerived`, session `cupsPerSample` and
 *     format, the reference sample pinned exactly as `upsertEvaluation` pins it)
 *     and written, `cups` included. The write does not name "isDraft", so the
 *     aggregate trigger does not fire here: it fires once, on the flip, with the
 *     final values. The lookup is repeated inside the transaction (the first
 *     one ran outside), so a row that was submitted or rewritten in between is
 *     simply not found.
 *
 * Both lookups carry the same session condition the submit action guards on
 * (status not closed AND `closesAt` null or still in the future, evaluated by
 * the query with the `now` the caller passes), so a session that has just
 * expired is never rewritten (review L9).
 *
 * Already-submitted rows are never touched (a closed session is a record).
 * A legacy draft whose payload the derivation rejects (`invalid_input`) is
 * SKIPPED, not blocked: the cupper's submit still goes through and that row is
 * submitted with `cups` NULL, so it is scored under the old rule (the same as
 * if it had been submitted before the deploy). It is logged once per row with
 * ids only (`legacyDrafts.skipped_invalid`, no payload) (review L6).
 * Callers authorize first.
 */
type LegacyDraftArgs = {
  sessionId: string;
  cupperId: string;
  /** Limit to these samples (solo "Terminar cata" submits only some). */
  sampleIds?: readonly string[];
  /** Server clock the caller's own expiry guard uses. */
  now: Date;
};

function legacyWhere(args: LegacyDraftArgs): Prisma.EvaluationWhereInput {
  return {
    isDraft: true,
    cups: null,
    cupperId: args.cupperId,
    sessionSampleId: args.sampleIds ? { in: [...args.sampleIds] } : undefined,
    sessionSample: {
      sessionId: args.sessionId,
      session: {
        status: { not: "closed" },
        OR: [{ closesAt: null }, { closesAt: { gte: args.now } }],
      },
    },
  };
}

/** Cheap pre-check, run outside any transaction. */
export async function hasLegacyDrafts(
  client: Pick<Prisma.TransactionClient, "evaluation">,
  args: LegacyDraftArgs,
): Promise<boolean> {
  const row = await client.evaluation.findFirst({ where: legacyWhere(args), select: { id: true } });
  return row !== null;
}

/** Returns how many rows were rewritten. */
export async function recomputeLegacyDraftsInTx(
  tx: Pick<Prisma.TransactionClient, "evaluation">,
  args: LegacyDraftArgs & {
    format: string;
    cupsPerSample: number;
    referenceSampleId: string | null;
  },
): Promise<number> {
  const moduleKey = moduleKeyForFormat(args.format);
  const rows = await tx.evaluation.findMany({
    where: legacyWhere(args),
    select: {
      id: true,
      sessionSampleId: true,
      descriptiveData: true,
      affectiveData: true,
      combinedData: true,
    },
  });

  let rewritten = 0;
  for (const row of rows) {
    const raw =
      moduleKey === "descriptive"
        ? row.descriptiveData
        : moduleKey === "affective"
          ? row.affectiveData
          : row.combinedData;
    const stored =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const data =
      args.referenceSampleId === row.sessionSampleId && isPinnedModule(moduleKey)
        ? pinReferenceAffective(stored, args.cupsPerSample)
        : stored;
    const fields = tryComputeEvaluationDerived(moduleKey, data, args.cupsPerSample);
    if (!fields) {
      // Ids only: never the payload.
      logWarn({
        where: "legacyDrafts.skipped_invalid",
        sessionId: args.sessionId,
        userId: args.cupperId,
        evaluationId: row.id,
      });
      continue;
    }
    await tx.evaluation.update({
      where: { id: row.id },
      data: fields as unknown as Prisma.EvaluationUpdateInput,
    });
    rewritten += 1;
  }
  return rewritten;
}

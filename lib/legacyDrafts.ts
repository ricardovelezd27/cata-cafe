import type { Prisma } from "@/app/generated/prisma/client";
import { moduleKeyForFormat, tryComputeEvaluationDerived } from "@/lib/evaluation";
import { isPinnedModule, pinReferenceAffective } from "@/lib/referenceRules";

/**
 * S10 WP1a (review M3): a draft saved BEFORE the 2026-11 deploy has
 * `evaluations.cups` NULL (the migration does not backfill), which means "scored
 * under the old rule". If its cupper submits AFTER the deploy, the submit only
 * flips `isDraft`, so the row would keep the old rule for its individual score
 * while the group aggregate (the trigger) already counts it under the new one.
 *
 * This runs right BEFORE the flip, inside the same transaction: every one of the
 * caller's still-draft evaluations whose `cups` is NULL has its derived fields
 * recomputed through the SAME function the save path uses
 * (`tryComputeEvaluationDerived`, session `cupsPerSample` and format, the
 * reference sample pinned exactly as `upsertEvaluation` pins it) and written,
 * `cups` included. The write does not name "isDraft", so the aggregate trigger
 * does not fire here: it fires once, on the flip, with the final values.
 *
 * Already-submitted rows are never touched (a closed session is a record), and a
 * payload the derivation rejects (`invalid_input`) is left as it is.
 * Callers authorize first. Returns how many rows were rewritten.
 */
export async function recomputeLegacyDraftsInTx(
  tx: Pick<Prisma.TransactionClient, "evaluation">,
  args: {
    sessionId: string;
    cupperId: string;
    /** Limit to these samples (solo "Terminar cata" submits only some). */
    sampleIds?: readonly string[];
    format: string;
    cupsPerSample: number;
    referenceSampleId: string | null;
  },
): Promise<number> {
  const moduleKey = moduleKeyForFormat(args.format);
  const rows = await tx.evaluation.findMany({
    where: {
      isDraft: true,
      cups: null,
      cupperId: args.cupperId,
      sessionSampleId: args.sampleIds ? { in: [...args.sampleIds] } : undefined,
      sessionSample: {
        sessionId: args.sessionId,
        session: { status: { not: "closed" } },
      },
    },
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
    if (!fields) continue;
    await tx.evaluation.update({
      where: { id: row.id },
      data: fields as unknown as Prisma.EvaluationUpdateInput,
    });
    rewritten += 1;
  }
  return rewritten;
}

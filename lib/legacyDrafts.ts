import type { Prisma } from "@/app/generated/prisma/client";
import { moduleKeyForFormat, tryComputeEvaluationDerived } from "@/lib/evaluation";
import { logWarn } from "@/lib/log";
import { pinReferenceAffective, shouldPinReference, stashBeforePin } from "@/lib/referenceRules";

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

type LegacyRewriteContext = {
  sessionId: string;
  cupperId: string;
  format: string;
  cupsPerSample: number;
  referenceSampleId: string | null;
  /** B1: the session's reference mode; a "free" reference is scored like any sample. */
  referenceMode: unknown;
};

type LegacyRow = {
  id: string;
  sessionSampleId: string;
  descriptiveData: unknown;
  affectiveData: unknown;
  combinedData: unknown;
};

const LEGACY_ROW_SELECT = {
  id: true,
  sessionSampleId: true,
  descriptiveData: true,
  affectiveData: true,
  combinedData: true,
} as const;

/** Rewrites ONE legacy row (cups NULL, still a draft) under the current rule;
 *  returns 1 when it was written, 0 when skipped or already newer. Shared by the
 *  submit-time pass and the owner's post-close acceptance (S10 WP4b). */
async function rewriteLegacyRow(
  tx: Pick<Prisma.TransactionClient, "evaluation">,
  row: LegacyRow,
  ctx: LegacyRewriteContext,
): Promise<number> {
  const moduleKey = moduleKeyForFormat(ctx.format);
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
  const pins = shouldPinReference({
    mode: ctx.referenceMode,
    moduleKey,
    isActiveReference: ctx.referenceSampleId === row.sessionSampleId,
  });
  const data = pins ? pinReferenceAffective(stored, ctx.cupsPerSample) : stored;
  // S10 WP5b (B2): the stored row is the one being pinned, so its stash is carried over
  // (or created from its current values). Shared by the submit-time pass and the owner's acceptance.
  const refStash = pins ? stashBeforePin(stored, data) : null;
  const fields = tryComputeEvaluationDerived(moduleKey, data, ctx.cupsPerSample, { refStash });
  if (!fields) {
    // Ids only: never the payload.
    logWarn({
      where: "legacyDrafts.skipped_invalid",
      sessionId: ctx.sessionId,
      userId: ctx.cupperId,
      evaluationId: row.id,
    });
    return 0;
  }
  // Third review L-1: the row was read above, so an autosave (which now writes `cups`) may
  // have rewritten it since. The write names the same two conditions the read used
  // (`cups` NULL, still a draft): a row that no longer matches is left exactly as the
  // newer save wrote it, and is not counted.
  const res = await tx.evaluation.updateMany({
    where: { id: row.id, cups: null, isDraft: true },
    data: fields as unknown as Prisma.EvaluationUpdateManyMutationInput,
  });
  return res.count;
}

/** Returns how many rows were rewritten. */
export async function recomputeLegacyDraftsInTx(
  tx: Pick<Prisma.TransactionClient, "evaluation">,
  args: LegacyDraftArgs & {
    format: string;
    cupsPerSample: number;
    referenceSampleId: string | null;
    /** B1: the session's reference mode; a "free" reference is scored like any sample. */
    referenceMode: unknown;
  },
): Promise<number> {
  const rows = await tx.evaluation.findMany({
    where: legacyWhere(args),
    select: LEGACY_ROW_SELECT,
  });

  let rewritten = 0;
  for (const row of rows) {
    rewritten += await rewriteLegacyRow(tx, row, {
      sessionId: args.sessionId,
      cupperId: args.cupperId,
      format: args.format,
      cupsPerSample: args.cupsPerSample,
      referenceSampleId: args.referenceSampleId,
      referenceMode: args.referenceMode,
    });
  }
  return rewritten;
}

/** S10 WP4b: the owner accepts ONE complete draft after the close. The session
 *  is closed, so `legacyWhere` (open sessions only) does not apply; this reads
 *  the one row by id and rewrites it the same way (cups NULL -> derived fields
 *  and `cups` written, reference pinned as the save path pins it), right before
 *  the caller flips `isDraft`. A row that is not a legacy draft is left alone.
 *  Callers authorize first. Returns 1 when rewritten. */
export async function recomputeLegacyDraftByIdInTx(
  tx: Pick<Prisma.TransactionClient, "evaluation">,
  args: LegacyRewriteContext & { evaluationId: string },
): Promise<number> {
  const row = await tx.evaluation.findFirst({
    where: { id: args.evaluationId, isDraft: true, cups: null },
    select: LEGACY_ROW_SELECT,
  });
  if (!row) return 0;
  return rewriteLegacyRow(tx, row, args);
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { computeEvaluationDerived, type EvalModuleKey } from "@/lib/evaluation";
import { writeEvaluationOrdered, type EvaluationWriteDb } from "@/lib/evaluationWrite";
import { resolvePinnedPayload, shouldPinReference } from "@/lib/referenceRules";
import { lockSessionRowShared } from "@/lib/sessionLock";

// S10 WP5b review H1 (TODO(kim-validar:B2)): the ONE entry point that writes an
// evaluation module of a sample that is, was or may be the pinned reference.
// Shared by the live `upsertEvaluation` and the offline replay. Callers
// authorize first.
//
// A module the page produced UNDER the pin (`pinnedView`) must never overwrite
// the ratings the server restored when the sample stopped being the reference,
// and a save in flight while the owner changes the reference must be judged
// against the CURRENT reference, not the one the request started with. So when
// the sample was pinned at authorization time OR the payload claims a pinned
// view, the write runs in ONE transaction that first takes a SHARE lock on the
// session row (setReferenceSample's pointer update needs the exclusive lock, so
// it cannot interleave), re-reads the session's active reference and mode and
// the stored module, resolves the payload (lib/referenceRules.ts
// resolvePinnedPayload) and writes. Every other save is the plain one-statement
// hot path, exactly as before.

type Args = {
  sessionSampleId: string;
  sessionId: string;
  cupperId: string;
  moduleKey: EvalModuleKey;
  cupsPerSample: number;
  posted: Record<string, unknown>;
  /** The page produced this module while the sample was the pinned reference. */
  pinnedView: boolean;
  /** The sample was the pinned reference when the request was authorized. */
  pinnedAtAuth: boolean;
  clientTs: unknown;
};

export async function writeEvaluationPinAware(args: Args): Promise<{ id: string; applied: boolean }> {
  // A duplicate FIRST save (two tabs, or a replay racing a live save) hits the
  // unique constraint inside the transaction, which aborts it (25P02 on every later
  // statement). Catch the violation OUTSIDE the transaction and run the whole write
  // once more: it finds the row and updates it.
  try {
    return await writeOnce(args);
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") {
      return writeOnce(args);
    }
    throw e;
  }
}

async function writeOnce(args: Args): Promise<{ id: string; applied: boolean }> {
  const { moduleKey } = args;
  if (moduleKey === "descriptive" || (!args.pinnedView && !args.pinnedAtAuth)) {
    const fields = computeEvaluationDerived(moduleKey, args.posted, args.cupsPerSample);
    return writeEvaluationOrdered(prisma as unknown as EvaluationWriteDb, {
      sessionSampleId: args.sessionSampleId,
      sessionId: args.sessionId,
      cupperId: args.cupperId,
      fields,
      clientTs: args.clientTs,
    });
  }

  return prisma.$transaction(
    async (tx) => {
      // LOCK ORDER (lib/sessionLock.ts): the session row first (shared), then the sample
      // key-share of the evaluation write. Reference changes take it exclusively first.
      // S10 WP6b: waits at most LOCK_TIMEOUT_MS (5 s) and answers `busy_retry` on a timeout,
      // like every other session-row lock (the first statement of this transaction).
      await lockSessionRowShared(tx, args.sessionId);
      const sess = await tx.cuppingSession.findUniqueOrThrow({
        where: { id: args.sessionId },
        select: { referenceSampleId: true, referenceMode: true },
      });
      const stored = await tx.evaluation.findUnique({
        where: {
          sessionSampleId_cupperId: { sessionSampleId: args.sessionSampleId, cupperId: args.cupperId },
        },
        select: { affectiveData: true, combinedData: true },
      });
      const raw = moduleKey === "affective" ? stored?.affectiveData : stored?.combinedData;
      const storedModule =
        raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
      const pinsNow = shouldPinReference({
        mode: sess.referenceMode,
        moduleKey,
        isActiveReference: sess.referenceSampleId === args.sessionSampleId,
      });
      const { data, refStash } = resolvePinnedPayload({
        pinsNow,
        pinnedView: args.pinnedView,
        moduleKey,
        posted: args.posted,
        stored: storedModule,
        cupsPerSample: args.cupsPerSample,
      });
      const fields = computeEvaluationDerived(moduleKey, data, args.cupsPerSample, { refStash });
      // writeEvaluationOrdered's own nested transactions run inline in this one.
      const db = {
        evaluation: tx.evaluation,
        $transaction: <T>(fn: (t: EvaluationWriteDb) => Promise<T>) => fn(db as unknown as EvaluationWriteDb),
      } as unknown as EvaluationWriteDb;
      return writeEvaluationOrdered(db, {
        sessionSampleId: args.sessionSampleId,
        sessionId: args.sessionId,
        cupperId: args.cupperId,
        fields,
        clientTs: args.clientTs,
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

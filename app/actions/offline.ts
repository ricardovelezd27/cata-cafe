"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireSampleMember, requireSampleOwner } from "@/lib/sessionAuth";
import { isSessionExpired } from "@/lib/sessionState";
// NOTE: no assertSessionWritable throw here — a closed or expired session must
// not burn the replay's retry budget. Replay answers with a status instead:
// `replay*` return "closed" (the client keeps the draft as `closed_unsent` and
// says so); the legacy `syncEvaluation` keeps returning "discarded" because
// service-worker-cached bundles still map it to "synced" (S8-05, F-offline-1).
import {
  computeEvaluationDerived,
  moduleKeyForFormat,
  type EvalModuleKey,
} from "@/lib/evaluation";
import { isPinnedModule, pinReferenceAffective } from "@/lib/referenceRules";
import { replayOverExisting, submittedRefireArgs } from "@/lib/aggregateRefire";

// Conflict-aware replay of an offline evaluation draft, called on reconnect.
// Authorization stays identical to the live path: Prisma scoped by cupperId
// (never a direct Supabase select), so RLS/ownership rules are preserved.
//
// Rules (the spec's `status` enum maps to our `isDraft` boolean):
//   - no existing row            → create (defaults isDraft=true)      → synced
//   - existing isDraft=true      → local wins; overwrite data + scores → synced
//   - existing isDraft=false     → already submitted elsewhere:
//        !force, group           → write nothing                       → conflict
//         force                  → overwrite content, keep submitted   → synced
//        solo (owner's own row)  → overwrite content, keep submitted   → synced
//
// `isDraft`/`submittedAt` are never mutated to a different value here. The
// results view recomputes from raw evaluations, but history and the coffee
// profile read the STORED aggregate (aggregate_scores, trigger-written), so
// replacing a submitted row ends with a guarded no-op write on "isDraft" that
// re-fires the trigger (S8-04, F-offline-7; lib/aggregateRefire.ts).
export type ReplayStatus = "synced" | "conflict" | "closed" | "pending";

type EvaluationReplayInput = {
  sessionSampleId: string;
  moduleKey: EvalModuleKey;
  data: Record<string, unknown>;
  cupsPerSample: number;
  force?: boolean;
};

// Shared body of syncEvaluation / replayEvaluation. NOT exported: every export
// of a "use server" file is a public endpoint. Authorization is identical to
// the live path (requireSampleMember below).
async function replayEvaluationCore(input: EvaluationReplayInput): Promise<ReplayStatus> {
  const user = await requireUser({ skipProfileUpsert: true });
  // Same authorization as the live upsertEvaluation path: session member only.
  // Also resolves the sample's real sessionId in one round-trip.
  const auth = await requireSampleMember(input.sessionSampleId, user.id);
  const { sessionId, cupsPerSample, format, referenceSampleId } = auth;

  // The session closed (or its `closesAt` passed) while this draft was offline. Its submitted data
  // stands; a stale local edit can no longer be applied (aggregates and
  // history are final). Report "closed" so the client stops retrying AND keeps
  // the draft visible as unsent, instead of showing it as synced.
  if (isSessionExpired(auth)) return "closed";

  // A participant's draft written before the master started a live session
  // (the cup screen normally prevents it): keep it pending on the device, never
  // discard it. The hook maps "pending" to a failed replay without retries.
  if (auth.isGroup && !auth.isAsync && !auth.startedAt && !auth.isOwner) {
    return "pending";
  }

  const existing = await prisma.evaluation.findUnique({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId: input.sessionSampleId,
        cupperId: user.id,
      },
    },
    select: { id: true, isDraft: true },
  });

  // Group: a submitted row is a conflict unless forced. Solo: one person, no
  // one else's data, so replaying over the owner's own submitted row applies.
  if (
    replayOverExisting({
      existingIsDraft: existing ? existing.isDraft : null,
      force: input.force === true,
      isGroup: auth.isGroup,
    }) === "conflict"
  ) {
    return "conflict";
  }

  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
    throw new Error("invalid_input");
  }

  // moduleKey / cupsPerSample come from the session row, never the client —
  // identical to the live upsertEvaluation path (input fields kept for API
  // compatibility with queued offline blobs).
  // Same reference pin as the live path (lib/referenceRules.ts).
  const moduleKey = moduleKeyForFormat(format);
  const data =
    referenceSampleId === input.sessionSampleId && isPinnedModule(moduleKey)
      ? pinReferenceAffective(input.data, cupsPerSample)
      : input.data;
  const fields = computeEvaluationDerived(moduleKey, data, cupsPerSample);

  const saved = await prisma.evaluation.upsert({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId: input.sessionSampleId,
        cupperId: user.id,
      },
    },
    create: {
      sessionSampleId: input.sessionSampleId,
      sessionId,
      cupperId: user.id,
      ...fields,
    },
    update: { sessionId, ...fields },
    select: { id: true },
  });

  // S8-04 (F-offline-7): re-fire the aggregate trigger when the row replaced
  // was already submitted (matches nothing for a draft). Idempotent, so a
  // replay delivered twice after a WebView resume is harmless.
  await prisma.evaluation.updateMany(submittedRefireArgs(saved.id));

  return "synced";
}

/** Legacy contract kept for cached client bundles: a closed or expired session
 *  answers "discarded". New code calls replayEvaluation. */
export async function syncEvaluation(
  input: EvaluationReplayInput,
): Promise<{ status: "synced" | "conflict" | "discarded" | "pending" }> {
  const status = await replayEvaluationCore(input);
  return { status: status === "closed" ? "discarded" : status };
}

/** Offline replay of an evaluation module. A closed or expired session returns
 *  "closed" and writes nothing; the client keeps the draft (`closed_unsent`)
 *  and tells the cupper, instead of showing it as synced. */
export async function replayEvaluation(
  input: EvaluationReplayInput,
): Promise<{ status: ReplayStatus }> {
  return { status: await replayEvaluationCore(input) };
}

/** Owner-only physical module replay. Returns a status instead of throwing for
 *  a closed session (a thrown code reaches the browser as an opaque digest). */
export async function replayPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}): Promise<{ status: "synced" | "closed" }> {
  const user = await requireUser({ skipProfileUpsert: true });
  const auth = await requireSampleOwner(input.sessionSampleId, user.id);
  if (isSessionExpired(auth)) return { status: "closed" };
  await prisma.physicalEvaluation.upsert({
    where: { sessionSampleId: input.sessionSampleId },
    create: {
      sessionSampleId: input.sessionSampleId,
      evaluatedBy: user.id,
      data: input.data as never,
    },
    update: { data: input.data as never },
  });
  return { status: "synced" };
}

/** Owner-only extrinsic module replay; same contract as replayPhysical. */
export async function replayExtrinsic(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}): Promise<{ status: "synced" | "closed" }> {
  const user = await requireUser({ skipProfileUpsert: true });
  const auth = await requireSampleOwner(input.sessionSampleId, user.id);
  if (isSessionExpired(auth)) return { status: "closed" };
  await prisma.extrinsicData.upsert({
    where: { sessionSampleId: input.sessionSampleId },
    create: {
      sessionSampleId: input.sessionSampleId,
      data: input.data as never,
      revealedBy: user.id,
      revealedAt: new Date(),
    },
    update: {
      data: input.data as never,
      revealedBy: user.id,
      revealedAt: new Date(),
    },
  });
  return { status: "synced" };
}

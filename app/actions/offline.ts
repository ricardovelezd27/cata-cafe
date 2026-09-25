"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireSampleMember } from "@/lib/sessionAuth";
// NOTE: no assertSessionWritable throw here — a closed session must not burn
// the replay's retry budget; it returns "discarded" instead (see below).
import {
  computeEvaluationDerived,
  moduleKeyForFormat,
  type EvalModuleKey,
} from "@/lib/evaluation";
import { isPinnedModule, pinReferenceAffective } from "@/lib/referenceRules";

// Conflict-aware replay of an offline evaluation draft, called on reconnect.
// Authorization stays identical to the live path: Prisma scoped by cupperId
// (never a direct Supabase select), so RLS/ownership rules are preserved.
//
// Rules (the spec's `status` enum maps to our `isDraft` boolean):
//   - no existing row            → create (defaults isDraft=true)      → synced
//   - existing isDraft=true      → local wins; overwrite data + scores → synced
//   - existing isDraft=false     → already submitted elsewhere:
//        !force                  → write nothing                       → conflict
//         force                  → overwrite content, keep submitted   → synced
//
// `isDraft`/`submittedAt` are never modified here. The results view recomputes
// group aggregates from raw evaluations, so a forced content replace is
// reflected without re-running the submit trigger.
export async function syncEvaluation(input: {
  sessionSampleId: string;
  moduleKey: EvalModuleKey;
  data: Record<string, unknown>;
  cupsPerSample: number;
  force?: boolean;
}): Promise<{ status: "synced" | "conflict" | "discarded" }> {
  const user = await requireUser({ skipProfileUpsert: true });
  // Same authorization as the live upsertEvaluation path: session member only.
  // Also resolves the sample's real sessionId in one round-trip.
  const { sessionId, status, cupsPerSample, format, referenceSampleId } = await requireSampleMember(
    input.sessionSampleId,
    user.id,
  );

  // The session closed while this draft was offline. Its submitted data
  // stands; a stale local edit can no longer be applied (aggregates and
  // history are final). Report "discarded" so the client clears the pending
  // flag instead of retrying forever.
  if (status === "closed") return { status: "discarded" };

  const existing = await prisma.evaluation.findUnique({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId: input.sessionSampleId,
        cupperId: user.id,
      },
    },
    select: { id: true, isDraft: true },
  });

  if (existing && existing.isDraft === false && !input.force) {
    return { status: "conflict" };
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

  await prisma.evaluation.upsert({
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

  return { status: "synced" };
}

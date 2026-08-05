"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireSampleMember } from "@/lib/sessionAuth";
import { computeEvaluationDerived, type EvalModuleKey } from "@/lib/evaluation";

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
}): Promise<{ status: "synced" | "conflict" }> {
  const user = await requireUser({ skipProfileUpsert: true });
  // Same authorization as the live upsertEvaluation path: session member only.
  // Also resolves the sample's real sessionId in one round-trip.
  const { sessionId } = await requireSampleMember(input.sessionSampleId, user.id);

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

  const fields = computeEvaluationDerived(
    input.moduleKey,
    input.data,
    input.cupsPerSample,
  );

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

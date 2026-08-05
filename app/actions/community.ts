"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  requireSessionOwner,
  requireSampleOwner,
} from "@/lib/sessionAuth";
import { syncCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import type { CloseEmailSummary } from "@/lib/closeEmail";

// ─── Submit all draft evaluations for a session ───────────────────────────────
export async function submitAllEvaluations(sessionId: string) {
  const user = await requireUser();

  // Single batched update instead of one round-trip per draft eval. The aggregate
  // trigger is FOR EACH ROW, so it still fires once per updated evaluation.
  await prisma.evaluation.updateMany({
    where: {
      isDraft: true,
      cupperId: user.id,
      sessionSample: { sessionId },
    },
    data: { isDraft: false, submittedAt: new Date() },
  });

  await maybeAutoCloseSoloSession(sessionId, user.id);

  revalidatePath(`/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// Solo sessions have no group "maestro" close flow — before this existed they
// stayed "draft"/"active" forever and never fed UserCoffeeHistory. A solo
// session auto-closes when its owner has a submitted evaluation for EVERY
// sample (partial submits keep it open so the owner can keep cupping).
// Closing also reveals coffee-linked samples: solo blind ends at submit, and
// syncCoffeeHistoryForSession only picks up revealed samples.
async function maybeAutoCloseSoloSession(sessionId: string, userId: string) {
  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { isGroup: true, status: true, createdBy: true },
  });
  if (
    !session ||
    session.isGroup ||
    session.createdBy !== userId ||
    session.status === "closed"
  ) {
    return;
  }

  const [sampleCount, submittedCount] = await Promise.all([
    prisma.sessionSample.count({ where: { sessionId } }),
    prisma.evaluation.count({
      where: {
        sessionSample: { sessionId },
        cupperId: userId,
        isDraft: false,
      },
    }),
  ]);
  if (sampleCount === 0 || submittedCount < sampleCount) return;

  await prisma.sessionSample.updateMany({
    where: { sessionId, coffeeId: { not: null }, revealed: false },
    data: { revealed: true },
  });
  await prisma.cuppingSession.update({
    where: { id: sessionId },
    data: { status: "closed" },
  });
  await syncCoffeeHistoryForSession(sessionId);
}

// ─── Submit a single sample's evaluation (triggers aggregate) ─────────────────
export async function submitSampleEvaluation(sessionSampleId: string) {
  const user = await requireUser();

  const evaluation = await prisma.evaluation.findUnique({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId,
        cupperId: user.id,
      },
    },
    select: { id: true, isDraft: true, sessionSample: { select: { sessionId: true } } },
  });

  if (!evaluation || !evaluation.isDraft) return { ok: true };

  await prisma.evaluation.update({
    where: { id: evaluation.id },
    data: { isDraft: false, submittedAt: new Date() },
  });

  revalidatePath(`/app/sessions/${evaluation.sessionSample.sessionId}/results`);
  return { ok: true };
}

// ─── Submit an evaluation (set isDraft=false) ─────────────────────────────────
export async function submitEvaluation(evaluationId: string) {
  const user = await requireUser();

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: { id: true, cupperId: true, sessionSample: { select: { sessionId: true } } },
  });

  if (!evaluation || evaluation.cupperId !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { isDraft: false, submittedAt: new Date() },
  });

  revalidatePath(
    `/app/sessions/${evaluation.sessionSample.sessionId}/results`,
  );
  return { ok: true };
}

// ─── Start a session (maestro moves past invite screen) ───────────────────────
export async function startSession(sessionId: string) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.cuppingSession.update({
    where: { id: sessionId },
    data: { startedAt: new Date() },
  });

  revalidatePath(`/app/sessions/${sessionId}/cup`);
  return { ok: true };
}

// ─── Close a session ──────────────────────────────────────────────────────────
export async function closeSession(sessionId: string) {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);

  await prisma.cuppingSession.update({
    where: { id: sessionId },
    data: { status: "closed" },
  });

  await syncCoffeeHistoryForSession(sessionId);

  // Group sessions only: email every participant their individual CVA PDF + the
  // anonymous group summary. This is best-effort and MUST NOT fail or block the
  // close — isolate it entirely from the action's success path.
  let emailSummary: CloseEmailSummary | null = null;
  if (session.isGroup) {
    try {
      const { sendCloseEmails } = await import("@/lib/closeEmail");
      emailSummary = await sendCloseEmails(sessionId);
    } catch (err) {
      console.warn(
        `[closeSession] sendCloseEmails threw for session ${sessionId} (close not affected): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  revalidatePath(`/app/sessions/${sessionId}/results`);
  revalidatePath(`/app/sessions/${sessionId}/cup`);
  return { ok: true, emailSummary };
}

// ─── Reveal a sample (link coffee identity) ───────────────────────────────────
export async function revealSample(sampleId: string, coffeeId?: string) {
  const user = await requireUser();
  const { sessionId } = await requireSampleOwner(sampleId, user.id);

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { revealed: true, ...(coffeeId ? { coffeeId } : {}) },
  });

  revalidatePath(`/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// ─── Complete onboarding for a guest (anonymous) user ────────────────────────
// Called right after supabase.auth.signInAnonymously() on the client, before
// joinViaToken. Upsert (not update) because the DB trigger normally creates
// the Profile row on signup, but we can't depend on its timing relative to
// this call — the upsert makes either ordering safe.
export async function completeGuestOnboarding(name: string) {
  const user = await requireUser({ skipProfileUpsert: true });
  const displayName = name.trim() || "Catador";

  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName, onboardingCompleted: true },
    update: { displayName, onboardingCompleted: true },
  });

  return { ok: true };
}

// ─── Join a session via invite token ─────────────────────────────────────────
export async function joinViaToken(token: string, locale: string = "es") {
  const user = await requireUser();

  const invite = await prisma.sessionInvite.findUnique({
    where: { token },
    select: {
      id: true,
      sessionId: true,
      maxUses: true,
      useCount: true,
      expiresAt: true,
      session: { select: { startedAt: true } },
    },
  });

  if (!invite) throw new Error("invalid_token");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error("token_expired");
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    throw new Error("token_exhausted");
  }

  const admin = createAdminClient();

  // Atomically increment useCount and upsert participant
  await prisma.$transaction(async (tx) => {
    await tx.sessionInvite.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
    });

    // Use admin client to bypass RLS for the participant insert
    const { error: upsertError } = await admin.from("session_participants").upsert(
      {
        sessionId: invite.sessionId,
        userId: user.id,
        status: "joined",
      },
      { onConflict: "sessionId,userId" },
    );
    if (upsertError) throw new Error(upsertError.message);
  });

  // If maestro hasn't started the session yet, send participant to waiting room
  if (!invite.session.startedAt) {
    redirect(`/${locale}/app/sessions/${invite.sessionId}/waiting`);
  }

  redirect(`/${locale}/app/sessions/${invite.sessionId}/cup`);
}

// ─── Create an invite token ───────────────────────────────────────────────────
export async function createInviteToken(
  sessionId: string,
  maxUses?: number,
  expiresAt?: string,
): Promise<{ token: string }> {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const token = crypto.randomUUID();

  await prisma.sessionInvite.create({
    data: {
      sessionId,
      token,
      maxUses: maxUses ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: user.id,
    },
  });

  return { token };
}

// ─── Exclude / re-include a participant from group results (owner only) ──────
// Sets session_participants.excludedFromResults, then re-fires the aggregate
// trigger for every submitted evaluation in the session so community scores,
// penalties and attrAverages recompute without the excluded cuppers. The
// trigger only fires on `UPDATE OF "isDraft"`, so a no-op write to that column
// is enough to re-run it. Descriptor frequency recomputes on the next page load.
export async function setParticipantExclusion(
  sessionId: string,
  participantUserId: string,
  excluded: boolean,
) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId, userId: participantUserId } },
    data: { excludedFromResults: excluded },
  });

  // Re-fire trg_recompute_aggregate for the whole session. Touching "isDraft"
  // (even to its current value) satisfies `AFTER UPDATE OF "isDraft"`; the
  // WHEN (NEW."isDraft" = false) clause keeps it to submitted evaluations.
  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false
  `;

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true, excluded };
}

// ─── Recompute aggregate scores for all samples in a session (owner only) ────
// Self-healing recompute: re-fires trg_recompute_aggregate for every submitted
// evaluation in the session via a no-op write to "isDraft" (same pattern as
// setParticipantExclusion). The DB trigger is the single source of truth for
// communityScore, penalties and attrAverages — it applies the exclusion and
// completeness filters that a TS-side recomputation would have to duplicate.
// Owner-initiated and rare, so the per-row trigger storm is acceptable.
export async function refreshAggregateScores(sessionId: string) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.$executeRaw`
    UPDATE evaluations e
    SET "isDraft" = e."isDraft"
    FROM session_samples ss
    WHERE e."sessionSampleId" = ss.id
      AND ss."sessionId" = ${sessionId}
      AND e."isDraft" = false
  `;

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// NOTE: the old `syncCoffeeHistory` server action moved to
// lib/coffeeHistory.ts as syncCoffeeHistoryForSession(). It was a public HTTP
// endpoint with no ownership check; the lib function is called internally by
// closeSession after requireSessionOwner.

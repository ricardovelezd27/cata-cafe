"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
    update: {},
  });
  return user;
}

// ─── Submit all draft evaluations for a session ───────────────────────────────
export async function submitAllEvaluations(sessionId: string) {
  const user = await requireUser();

  const draftEvals = await prisma.evaluation.findMany({
    where: {
      isDraft: true,
      cupperId: user.id,
      sessionSample: { sessionId },
    },
    select: { id: true },
  });

  for (const ev of draftEvals) {
    await prisma.evaluation.update({
      where: { id: ev.id },
      data: { isDraft: false, submittedAt: new Date() },
    });
  }

  revalidatePath(`/app/sessions/${sessionId}/results`);
  return { ok: true };
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

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, createdBy: true },
  });

  if (!session || session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

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

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, createdBy: true },
  });

  if (!session || session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.cuppingSession.update({
    where: { id: sessionId },
    data: { status: "closed" },
  });

  await syncCoffeeHistory(sessionId);

  revalidatePath(`/app/sessions/${sessionId}/results`);
  revalidatePath(`/app/sessions/${sessionId}/cup`);
  return { ok: true };
}

// ─── Reveal a sample (link coffee identity) ───────────────────────────────────
export async function revealSample(sampleId: string, coffeeId?: string) {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: { sessionId: true },
  });

  if (!sample) throw new Error("not_found");

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sample.sessionId },
    select: { createdBy: true },
  });

  if (!session || session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { revealed: true, ...(coffeeId ? { coffeeId } : {}) },
  });

  revalidatePath(`/app/sessions/${sample.sessionId}/results`);
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

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { createdBy: true },
  });

  if (!session || session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

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

// ─── Recompute attrAverages for all samples in a session (owner only) ────────
export async function refreshAggregateScores(sessionId: string) {
  const user = await requireUser();

  const session = await prisma.cuppingSession.findFirst({
    where: { id: sessionId, createdBy: user.id },
    select: {
      format: true,
      samples: {
        select: {
          id: true,
          evaluations: {
            where: { isDraft: false },
            select: { affectiveData: true, combinedData: true },
          },
        },
      },
    },
  });
  if (!session) throw new Error("not_found_or_forbidden");

  for (const sample of session.samples) {
    if (sample.evaluations.length === 0) continue;

    const attrAverages: Record<string, number> = {};

    for (const attr of AFFECTIVE_ATTRIBUTES) {
      const key = `${attr.id}_final`;
      const vals = sample.evaluations
        .map((e) => {
          const data = (
            session.format === "affective" ? e.affectiveData : e.combinedData
          ) as Record<string, unknown> | null;
          const v = data?.[key];
          return typeof v === "number" ? v : null;
        })
        .filter((v): v is number => v !== null);

      if (vals.length > 0) {
        attrAverages[attr.label] =
          Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      }
    }

    await prisma.aggregateScore.updateMany({
      where: { sessionSampleId: sample.id },
      data: { attrAverages, computedAt: new Date() },
    });
  }

  revalidatePath(`/es/app/sessions/${sessionId}/results`);
  revalidatePath(`/en/app/sessions/${sessionId}/results`);
  return { ok: true };
}

// ─── Sync coffee history after session close ──────────────────────────────────
// Upserts UserCoffeeHistory for all revealed samples with submitted evaluations.
export async function syncCoffeeHistory(sessionId: string) {
  const user = await requireUser();

  const samples = await prisma.sessionSample.findMany({
    where: { sessionId, revealed: true, coffeeId: { not: null } },
    include: {
      evaluations: {
        where: { isDraft: false },
        select: {
          id: true,
          cupperId: true,
          individualScore: true,
          sessionSampleId: true,
        },
      },
      aggregateScore: {
        select: { communityScore: true },
      },
    },
  });

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { date: true },
  });

  for (const sample of samples) {
    if (!sample.coffeeId) continue;
    const communityScore = sample.aggregateScore?.communityScore ?? null;

    for (const evaluation of sample.evaluations) {
      await prisma.userCoffeeHistory.upsert({
        where: {
          userId_coffeeId_sessionId: {
            userId: evaluation.cupperId,
            coffeeId: sample.coffeeId,
            sessionId,
          },
        },
        create: {
          userId: evaluation.cupperId,
          coffeeId: sample.coffeeId,
          evaluationId: evaluation.id,
          sessionId,
          individualScore: evaluation.individualScore,
          communityScore,
          tastedAt: session?.date ?? new Date(),
        },
        update: {
          individualScore: evaluation.individualScore,
          communityScore,
        },
      });
    }
  }

  return { ok: true };
}

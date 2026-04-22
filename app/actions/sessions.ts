"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  return user;
}

export async function createSession(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  samples: { label: string }[];
  locale?: string;
}) {
  const user = await requireUser();

  const session = await prisma.cuppingSession.create({
    data: {
      name: input.name,
      date: new Date(input.date),
      objective: input.objective,
      format: input.format,
      cupsPerSample: input.cupsPerSample,
      createdBy: user.id,
      samples: {
        create: input.samples.map((s, i) => ({
          label: s.label || `Muestra ${i + 1}`,
          position: i,
        })),
      },
    },
    select: { id: true },
  });

  const locale = input.locale || "es";
  redirect(`/${locale}/app/sessions/${session.id}/cup`);
}

export async function createGroupSession(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  samples: { label: string }[];
  isAsync: boolean;
  closesAt?: string;
}): Promise<{ sessionId: string; inviteToken: string }> {
  const user = await requireUser();

  const token = crypto.randomUUID();

  const session = await prisma.cuppingSession.create({
    data: {
      name: input.name,
      date: new Date(input.date),
      objective: input.objective,
      format: input.format,
      cupsPerSample: input.cupsPerSample,
      isGroup: true,
      isAsync: input.isAsync,
      status: "active",
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      createdBy: user.id,
      samples: {
        create: input.samples.map((s, i) => ({
          label: s.label || `Muestra ${i + 1}`,
          position: i,
        })),
      },
      participants: {
        create: {
          userId: user.id,
          status: "owner",
        },
      },
      invites: {
        create: {
          token,
          createdBy: user.id,
        },
      },
    },
    select: { id: true },
  });

  return { sessionId: session.id, inviteToken: token };
}

export async function upsertEvaluation(input: {
  sessionSampleId: string;
  moduleKey: "descriptive" | "affective" | "combined";
  data: Record<string, unknown>;
  cupsPerSample: number;
}) {
  const user = await requireUser();

  const dataField =
    input.moduleKey === "descriptive"
      ? "descriptiveData"
      : input.moduleKey === "affective"
        ? "affectiveData"
        : "combinedData";

  const { sum } = calcAffectiveSum(input.data);
  const rawScore =
    input.moduleKey === "descriptive" ? null : calcRawScore(input.data);
  const individual = calcIndividualScore(input.data, input.cupsPerSample);
  const individualScore = individual === "—" ? null : individual;

  const nonUniformCups =
    (input.data.tazas_no_uniformes as boolean[] | undefined) ?? [];
  const defectiveCups =
    (input.data.tazas_defectuosas as boolean[] | undefined) ?? [];
  const defectTypes =
    (input.data.defecto_tipo as string[] | undefined) ?? [];

  await prisma.evaluation.upsert({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId: input.sessionSampleId,
        cupperId: user.id,
      },
    },
    create: {
      sessionSampleId: input.sessionSampleId,
      cupperId: user.id,
      [dataField]: input.data,
      nonUniformCups,
      defectiveCups,
      defectTypes,
      affectiveSum: sum || null,
      rawScore,
      individualScore,
    },
    update: {
      [dataField]: input.data,
      nonUniformCups,
      defectiveCups,
      defectTypes,
      affectiveSum: sum || null,
      rawScore,
      individualScore,
    },
  });

  revalidatePath(`/app/sessions`);
  return { ok: true };
}

export async function upsertPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}) {
  const user = await requireUser();
  await prisma.physicalEvaluation.upsert({
    where: { sessionSampleId: input.sessionSampleId },
    create: {
      sessionSampleId: input.sessionSampleId,
      evaluatedBy: user.id,
      data: input.data as never,
    },
    update: { data: input.data as never },
  });
  return { ok: true };
}

export async function upsertExtrinsic(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}) {
  const user = await requireUser();
  await prisma.extrinsicData.upsert({
    where: { sessionSampleId: input.sessionSampleId },
    create: {
      sessionSampleId: input.sessionSampleId,
      data: input.data as never,
      revealedBy: user.id,
      revealedAt: new Date(),
    },
    update: { data: input.data as never },
  });
  return { ok: true };
}

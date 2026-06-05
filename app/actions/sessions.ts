"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { calcAffectiveSum, calcIndividualScore, calcRawScore } from "@/lib/scoring";

type CoffeeInput = {
  name: string;
  producer?: string;
  variety?: string;
  altitude?: string;
  roastLevel?: string;
  country?: string;
  region?: string;
};

type SampleInput = {
  label: string;
  coffeeIdx?: number;
};

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  await prisma.profile.upsert({
    where: { id: user.id },
    create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
    update: {},
  });
  return user;
}

async function createCoffees(coffees: CoffeeInput[], userId: string) {
  if (!coffees || coffees.length === 0) return [];
  // Run all creates in one transaction (single round-trip). $transaction with an
  // array preserves input order, so the returned ids stay index-aligned with
  // `coffees` for the `coffeeIdx` mapping below. (createMany can't return ids.)
  return prisma.$transaction(
    coffees.map((c) =>
      prisma.coffee.create({
        data: {
          name: c.name || "Sin nombre",
          producer: c.producer || null,
          variety: c.variety || null,
          altitude: c.altitude || null,
          roastLevel: c.roastLevel || null,
          country: c.country || null,
          region: c.region || null,
          createdBy: userId,
          isPublic: false,
        },
        select: { id: true },
      })
    )
  );
}

export async function createSession(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  coffees?: CoffeeInput[];
  samples: SampleInput[];
  locale?: string;
}) {
  const user = await requireUser();

  const createdCoffees = await createCoffees(input.coffees ?? [], user.id);

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
          coffeeId:
            typeof s.coffeeIdx === "number" && createdCoffees[s.coffeeIdx]
              ? createdCoffees[s.coffeeIdx].id
              : null,
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
  coffees?: CoffeeInput[];
  samples: SampleInput[];
  closesAt?: string;
}): Promise<{ sessionId: string; inviteToken: string }> {
  const user = await requireUser();

  const createdCoffees = await createCoffees(input.coffees ?? [], user.id);

  const token = crypto.randomUUID();

  const session = await prisma.cuppingSession.create({
    data: {
      name: input.name,
      date: new Date(input.date),
      objective: input.objective,
      format: input.format,
      cupsPerSample: input.cupsPerSample,
      isGroup: true,
      isAsync: !!input.closesAt,
      status: "active",
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      createdBy: user.id,
      samples: {
        create: input.samples.map((s, i) => ({
          label: s.label || `Muestra ${i + 1}`,
          position: i,
          coffeeId:
            typeof s.coffeeIdx === "number" && createdCoffees[s.coffeeIdx]
              ? createdCoffees[s.coffeeIdx].id
              : null,
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

  const result = await prisma.evaluation.upsert({
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
    select: { id: true },
  });

  revalidatePath(`/app/sessions`);
  return { ok: true, evaluationId: result.id };
}

export async function deleteSession(sessionId: string, locale: string = "es") {
  const user = await requireUser();

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: { createdBy: true },
  });

  if (!session || session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }

  await prisma.cuppingSession.delete({ where: { id: sessionId } });

  revalidatePath(`/${locale}/app/sessions`);
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

export async function checkSessionStarted(sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const session = await prisma.cuppingSession.findFirst({
    where: { id: sessionId },
    select: { startedAt: true },
  });
  return session?.startedAt != null;
}

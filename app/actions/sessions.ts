"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { computeEvaluationDerived } from "@/lib/evaluation";

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

  const fields = computeEvaluationDerived(
    input.moduleKey,
    input.data,
    input.cupsPerSample,
  );

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
      ...fields,
    },
    update: { ...fields },
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

export type SampleMetadataInput = {
  label: string;
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

export async function updateSampleMetadata(
  sampleId: string,
  input: SampleMetadataInput
) {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      sessionId: true,
      coffeeId: true,
      session: { select: { createdBy: true } },
    },
  });
  if (!sample) throw new Error("not_found");
  if (sample.session.createdBy !== user.id) throw new Error("forbidden");

  const coffeeData = {
    name: input.name || "Sin nombre",
    country: input.country || null,
    region: input.region || null,
    farm: input.farm || null,
    producer: input.producer || null,
    variety: input.variety || null,
    processType: input.processType || null,
    altitude: input.altitude || null,
    roastLevel: input.roastLevel || null,
  };

  if (sample.coffeeId) {
    await prisma.coffee.update({
      where: { id: sample.coffeeId },
      data: coffeeData,
    });
  } else {
    const coffee = await prisma.coffee.create({
      data: { ...coffeeData, createdBy: user.id, isPublic: false },
      select: { id: true },
    });
    await prisma.sessionSample.update({
      where: { id: sampleId },
      data: { coffeeId: coffee.id },
    });
  }

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { label: input.label || undefined },
  });

  revalidatePath(`/app/sessions/${sample.sessionId}/cup`);
  revalidatePath(`/app/sessions/${sample.sessionId}/results`);
  revalidatePath(`/app/sessions/${sample.sessionId}/print`);

  return { ok: true as const };
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

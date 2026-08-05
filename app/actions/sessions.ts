"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleMember,
  requireSampleOwner,
} from "@/lib/sessionAuth";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { notifyGroupOfSession, type GroupEmailSummary } from "@/app/actions/groups";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";

type CoffeeInput = {
  name: string;
  producer?: string;
  variety?: string;
  altitude?: string;
  roastLevel?: string;
  country?: string;
  region?: string;
  // When set, the entry references an existing Coffee (picked via the
  // "Usar café existente" picker) instead of creating a new row. Access is
  // re-validated server-side in resolveCoffees — never trusted from the client.
  existingCoffeeId?: string;
};

type SampleInput = {
  label: string;
  coffeeIdx?: number;
};

// Data-driven platform: a session can't be created without complete basic
// coffee data (N-series feedback + insights data-quality push). Server-side
// twin of the form's client validation — actions are public HTTP endpoints.
const REQUIRED_COFFEE_FIELDS = ["name", "variety", "country", "altitude"] as const;

function validateSessionInput(
  coffees: CoffeeInput[],
  samples: SampleInput[],
): string | null {
  if (!samples || samples.length === 0) return "no_samples";
  if (!coffees || coffees.length === 0) return "no_coffees";
  for (const c of coffees) {
    // Linked entries reference an already-created coffee; the data-quality
    // gate only applies to coffees being entered from scratch (an older
    // shared/public coffee may legitimately lack e.g. altitude).
    if (c.existingCoffeeId) continue;
    for (const field of REQUIRED_COFFEE_FIELDS) {
      if (!c[field]?.trim()) return "missing_coffee_fields";
    }
  }
  for (const s of samples) {
    if (typeof s.coffeeIdx !== "number" || !coffees[s.coffeeIdx]) {
      return "sample_without_coffee";
    }
  }
  return null;
}

// Resolves the wizard's coffee entries to database ids, index-aligned with the
// input array so the `coffeeIdx` sample mapping below stays untouched. Linked
// entries (existingCoffeeId) are re-validated against the caller's usable set
// (owned + public + shared-with-me) — a tampered id for someone else's private
// coffee returns the "coffee_not_found" error string instead. Non-linked
// entries are created in one transaction ($transaction with an array preserves
// input order; createMany can't return ids).
async function resolveCoffees(
  coffees: CoffeeInput[],
  userId: string,
): Promise<{ id: string }[] | "coffee_not_found"> {
  if (!coffees || coffees.length === 0) return [];

  const existingIds = [
    ...new Set(
      coffees
        .map((c) => c.existingCoffeeId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (existingIds.length > 0) {
    const usable = await prisma.coffee.findMany({
      where: { id: { in: existingIds }, AND: [usableCoffeeWhere(userId)] },
      select: { id: true },
    });
    if (usable.length !== existingIds.length) return "coffee_not_found";
  }

  const toCreate = coffees.filter((c) => !c.existingCoffeeId);
  const created =
    toCreate.length > 0
      ? await prisma.$transaction(
          toCreate.map((c) =>
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
                visibility: "private",
              },
              select: { id: true },
            }),
          ),
        )
      : [];

  let createdIdx = 0;
  return coffees.map((c) =>
    c.existingCoffeeId ? { id: c.existingCoffeeId } : created[createdIdx++],
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
}): Promise<{ ok: false; error: string } | void> {
  const user = await requireUser();

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };

  const createdCoffees = await resolveCoffees(input.coffees ?? [], user.id);
  if (createdCoffees === "coffee_not_found") {
    return { ok: false, error: "coffee_not_found" };
  }

  const session = await prisma.cuppingSession.create({
    data: {
      name: input.name,
      date: new Date(input.date),
      objective: input.objective,
      format: input.format,
      cupsPerSample: input.cupsPerSample,
      // A solo session is immediately cuppable — "draft" is meaningless for it.
      // Lifecycle: active → closed (auto, when all samples are submitted; see
      // submitAllEvaluations in app/actions/community.ts).
      status: "active",
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
  // Groups v2: optionally link the session to one of the owner's standing
  // tasting groups. When set, notifyGroup (default true) fires a best-effort
  // invitation email to every member right after creation.
  groupId?: string;
  notifyGroup?: boolean;
}): Promise<
  | { ok: true; sessionId: string; inviteToken: string; emailSummary?: GroupEmailSummary }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };

  if (input.groupId) {
    const group = await prisma.tastingGroup.findUnique({
      where: { id: input.groupId },
      select: { createdBy: true },
    });
    if (!group || group.createdBy !== user.id) {
      return { ok: false, error: "not_found_or_forbidden" };
    }
  }

  const createdCoffees = await resolveCoffees(input.coffees ?? [], user.id);
  if (createdCoffees === "coffee_not_found") {
    return { ok: false, error: "coffee_not_found" };
  }

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
      groupId: input.groupId ?? null,
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

  // Best-effort — a failed/skipped auto-invite email must never fail session
  // creation itself.
  let emailSummary: GroupEmailSummary | undefined;
  if (input.groupId && input.notifyGroup !== false) {
    try {
      emailSummary = await notifyGroupOfSession({
        groupId: input.groupId,
        sessionId: session.id,
      });
    } catch (err) {
      console.warn(
        `[createGroupSession] notifyGroupOfSession threw for session ${session.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { ok: true, sessionId: session.id, inviteToken: token, emailSummary };
}

// Prisma unique-constraint violation (duck-typed like app/actions/waitlist.ts —
// avoids importing error classes from the generated client).
function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

export async function upsertEvaluation(input: {
  sessionSampleId: string;
  // Kept for API compatibility with existing callers, but IGNORED — the
  // denormalized Evaluation.sessionId is resolved server-side from the sample
  // so a tampered sessionId can't mislabel Realtime events.
  sessionId: string;
  moduleKey: "descriptive" | "affective" | "combined";
  data: Record<string, unknown>;
  cupsPerSample: number;
}) {
  const user = await requireUser({ skipProfileUpsert: true });
  const { sessionId } = await requireSampleMember(input.sessionSampleId, user.id);

  const fields = computeEvaluationDerived(
    input.moduleKey,
    input.data,
    input.cupsPerSample,
  );

  const doUpsert = () =>
    prisma.evaluation.upsert({
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

  let result: { id: string };
  try {
    result = await doUpsert();
  } catch (e) {
    // Two concurrent first-saves can both take the create path of the upsert;
    // the loser hits the (sessionSampleId, cupperId) unique constraint. One
    // retry lands on the update path.
    if (!isP2002(e)) throw e;
    result = await doUpsert();
  }

  return { ok: true, evaluationId: result.id };
}

export async function deleteSession(sessionId: string, locale: string = "es") {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.cuppingSession.delete({ where: { id: sessionId } });

  revalidatePath(`/${locale}/app/sessions`);
}

// NOTE: deleteCoffee moved to app/actions/coffees.ts with the rest of the
// coffee CRUD actions.

export type UpdateSessionInput = {
  name?: string;
  date?: string;
  objective?: string | null;
  // Only valid for group sessions; null unlinks. A solo session must not carry
  // a groupId — the group page lists sessions by groupId and members would get
  // dead links to a session they can't open.
  groupId?: string | null;
  // format/cupsPerSample are LOCKED once any evaluation exists (scores are
  // derived from them); the server rejects regardless of what the form shows.
  format?: "descriptive" | "affective" | "combined";
  cupsPerSample?: number;
  locale?: string;
};

export async function updateSession(sessionId: string, input: UpdateSessionInput) {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);

  const data: {
    name?: string;
    date?: Date;
    objective?: string | null;
    groupId?: string | null;
    format?: string;
    cupsPerSample?: number;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: "invalid_name" };
    data.name = name;
  }
  if (input.date !== undefined) {
    const d = new Date(input.date);
    if (Number.isNaN(d.getTime())) return { ok: false as const, error: "invalid_date" };
    data.date = d;
  }
  if (input.objective !== undefined) {
    data.objective = input.objective?.trim() || null;
  }

  if (input.groupId !== undefined) {
    if (!session.isGroup) return { ok: false as const, error: "not_group_session" };
    if (input.groupId === null) {
      data.groupId = null;
    } else {
      const group = await prisma.tastingGroup.findUnique({
        where: { id: input.groupId },
        select: { createdBy: true },
      });
      if (!group || group.createdBy !== user.id) {
        return { ok: false as const, error: "not_found_or_forbidden" };
      }
      data.groupId = input.groupId;
    }
  }

  if (input.format !== undefined || input.cupsPerSample !== undefined) {
    const evalCount = await prisma.evaluation.count({
      where: { sessionSample: { sessionId } },
    });
    if (evalCount > 0) return { ok: false as const, error: "format_locked" };
    if (input.format !== undefined) data.format = input.format;
    if (input.cupsPerSample !== undefined) {
      if (
        !Number.isInteger(input.cupsPerSample) ||
        input.cupsPerSample < 1 ||
        input.cupsPerSample > 5
      ) {
        return { ok: false as const, error: "invalid_cups" };
      }
      data.cupsPerSample = input.cupsPerSample;
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.cuppingSession.update({ where: { id: sessionId }, data });
  }

  const locale = input.locale || "es";
  revalidatePath(`/${locale}/app/sessions`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}/cup`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}/results`);
  return { ok: true as const };
}

export async function addSessionSample(
  sessionId: string,
  input: { label?: string; coffeeId?: string | null; locale?: string },
) {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  if (input.coffeeId) {
    // Same re-validation as the wizard: the coffee must be usable by the
    // caller (owned + public + shared-with-me) — never trusted from the client.
    const usable = await prisma.coffee.findFirst({
      where: { id: input.coffeeId, AND: [usableCoffeeWhere(user.id)] },
      select: { id: true },
    });
    if (!usable) return { ok: false as const, error: "coffee_not_found" };
  }

  const max = await prisma.sessionSample.aggregate({
    where: { sessionId },
    _max: { position: true },
  });
  const position = (max._max.position ?? -1) + 1;

  const sample = await prisma.sessionSample.create({
    data: {
      sessionId,
      label: input.label?.trim() || `Muestra ${position + 1}`,
      position,
      coffeeId: input.coffeeId ?? null,
    },
    select: { id: true },
  });

  const locale = input.locale || "es";
  revalidatePath(`/${locale}/app/sessions/${sessionId}/cup`);
  return { ok: true as const, sampleId: sample.id };
}

// Label-only rename. Deliberately separate from updateSampleMetadata (which
// rewrites the linked coffee's fields and expects the full metadata input).
export async function renameSessionSample(sampleId: string, label: string) {
  const user = await requireUser();
  const { sessionId } = await requireSampleOwner(sampleId, user.id);

  const trimmed = label.trim();
  if (!trimmed) return { ok: false as const, error: "invalid_label" };

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { label: trimmed },
  });

  revalidatePath(`/es/app/sessions/${sessionId}/cup`);
  revalidatePath(`/en/app/sessions/${sessionId}/cup`);
  return { ok: true as const };
}

export async function removeSessionSample(sampleId: string, locale: string = "es") {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      sessionId: true,
      session: { select: { createdBy: true } },
      _count: { select: { evaluations: true } },
    },
  });
  if (!sample || sample.session.createdBy !== user.id) {
    throw new Error("not_found_or_forbidden");
  }
  // A sample with ANY cupper's evaluation is load-bearing data — refuse.
  // (Deleting would cascade evaluations/physical/extrinsic/aggregate rows.)
  if (sample._count.evaluations > 0) {
    return { ok: false as const, error: "sample_has_evaluations" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.sessionSample.delete({ where: { id: sampleId } });
    // Re-pack positions ascending so the (sessionId, position) unique key
    // stays dense; each shifted row lands on a slot vacated one step earlier.
    const rest = await tx.sessionSample.findMany({
      where: { sessionId: sample.sessionId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].position !== i) {
        await tx.sessionSample.update({
          where: { id: rest[i].id },
          data: { position: i },
        });
      }
    }
  });

  revalidatePath(`/${locale}/app/sessions/${sample.sessionId}/cup`);
  return { ok: true as const };
}

export async function upsertPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}) {
  const user = await requireUser({ skipProfileUpsert: true });
  await requireSampleMember(input.sessionSampleId, user.id);
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
      coffee: { select: { createdBy: true } },
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
    // Samples can point at coffees the session owner merely USES (picked
    // shared/public coffees) — only the coffee's own creator may edit the
    // coffee record itself. For non-owned coffees the label update below
    // still applies; the coffee edit is silently skipped.
    if (sample.coffee?.createdBy === user.id) {
      await prisma.coffee.update({
        where: { id: sample.coffeeId },
        data: coffeeData,
      });
    }
  } else {
    const coffee = await prisma.coffee.create({
      data: { ...coffeeData, createdBy: user.id, visibility: "private" },
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
  const user = await requireUser({ skipProfileUpsert: true });
  await requireSampleMember(input.sessionSampleId, user.id);
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
  return { ok: true };
}

// Boolean poller for the waiting room. Returns false (never throws) so a
// signed-out or non-member poller degrades gracefully; joinViaToken upserts
// the participant row before redirecting here, so real waiters always pass.
export async function checkSessionStarted(sessionId: string): Promise<boolean> {
  try {
    const user = await requireUser({ skipProfileUpsert: true });
    const session = await requireSessionMember(sessionId, user.id);
    return session.startedAt != null;
  } catch {
    return false;
  }
}

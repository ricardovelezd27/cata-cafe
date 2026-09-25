"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  withCodeRetry,
  generateUniqueCoffeeCodes,
  isCoffeeCodeCollision,
} from "@/lib/coffeeCode";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleMember,
  requireSampleOwner,
  assertSessionWritable,
} from "@/lib/sessionAuth";
import { detachCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import { computeEvaluationDerived, moduleKeyForFormat } from "@/lib/evaluation";
import { isPinnedModule, pinReferenceAffective } from "@/lib/referenceRules";
import * as v from "@/lib/validate";
import { notifyGroupOfSession, type GroupEmailSummary } from "@/app/actions/groups";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";

// Mirrors the standalone CoffeeForm's field set — wizard-created coffees land
// in the SAME coffees table with the same shape (no wizard-only subset).
type CoffeeInput = {
  name: string;
  producer?: string;
  variety?: string;
  altitude?: string;
  roastLevel?: string;
  country?: string;
  region?: string;
  farm?: string;
  species?: string;
  harvestYear?: string;
  processType?: string;
  certifications?: string[];
  notes?: string;
  // When set, the entry references an existing Coffee (picked via the
  // "Usar café existente" picker) instead of creating a new row. Access is
  // re-validated server-side in resolveCoffees — never trusted from the client.
  existingCoffeeId?: string;
};

type SampleInput = {
  label: string;
  coffeeIdx?: number;
};

// ─── Reference sample helpers ────────────────────────────────────────────────
// The reference ("Referencia") is the ONE sample the owner marks as the control
// the others are compared against. It lives on the session
// (CuppingSession.referenceSampleId, SetNull) and is display-only — scoring
// never reads it.

/** Validates the wizard's optional `referenceIdx` (index into `samples`).
 *  `null`/`undefined` = no reference. Out-of-range/NaN → "invalid_reference"
 *  (a `session.newForm.errors` key, NOT the P2003 ActionErrorCode). */
function parseReferenceIdx(
  raw: number | null | undefined,
  sampleCount: number,
): { ok: true; idx: number | null } | { ok: false; error: "invalid_reference" } {
  if (raw === undefined || raw === null) return { ok: true, idx: null };
  try {
    return { ok: true, idx: v.int(raw, "referenceIdx", 0, Math.max(0, sampleCount - 1)) };
  } catch {
    return { ok: false, error: "invalid_reference" };
  }
}

/** Sample ids only exist after the nested create, so the reference is stamped
 *  in a second statement inside the same transaction. Position-based so the
 *  same helper serves createSession, createGroupSession and duplicateSession. */
async function applyReferenceByPosition(
  tx: Prisma.TransactionClient,
  sessionId: string,
  samples: { id: string; position: number }[],
  position: number | null,
): Promise<void> {
  if (position === null) return;
  const ref = samples.find((s) => s.position === position);
  if (!ref) return;
  await tx.cuppingSession.update({
    where: { id: sessionId },
    data: { referenceSampleId: ref.id },
  });
}

// Data-quality gate relaxed 2026-09 per stakeholder decision ("valor antes
// que fricción") — everything but the name is progressive/fill-later. Kept
// as a loop over a (now single-element) list so a future field can be added
// back without restructuring the caller. Server-side twin of the form's
// client validation — actions are public HTTP endpoints.
const REQUIRED_COFFEE_FIELDS = ["name"] as const;

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
    // Altitude is optional now — only validated (plain number, msnm) when the
    // caller actually supplied one; an empty/missing altitude is valid.
    if (c.altitude?.trim()) {
      const altitude = Number(c.altitude);
      if (!Number.isFinite(altitude) || altitude <= 0 || altitude > 6000) {
        return "invalid_altitude";
      }
    }
  }
  for (const s of samples) {
    if (typeof s.coffeeIdx !== "number" || !coffees[s.coffeeIdx]) {
      return "sample_without_coffee";
    }
  }
  return null;
}

const SESSION_FORMATS = ["descriptive", "affective", "combined"] as const;
const MAX_SAMPLES = 100;

// Session-level fields (name/date/format/cups/objective/closesAt) — the
// sample/coffee rules live in validateSessionInput. Returns the wizard's
// error code (mapped to copy in messages.session.newForm.errors) or the
// normalized values. `new Date(input.date)` used to go straight to Prisma and
// an unparseable date crashed the whole multi-step form.
type SessionMeta = {
  name: string;
  date: Date;
  objective: string | null;
  format: (typeof SESSION_FORMATS)[number];
  cupsPerSample: number;
  closesAt: Date | null;
};

function validateSessionMeta(input: {
  name: unknown;
  date: unknown;
  objective?: unknown;
  format: unknown;
  cupsPerSample: unknown;
  samples: unknown;
  closesAt?: unknown;
}): { ok: true; meta: SessionMeta } | { ok: false; error: string } {
  const field = (f: string, fn: () => void): string | null => {
    try {
      fn();
      return null;
    } catch {
      return f;
    }
  };
  let name = "";
  let date = new Date(0);
  let objective: string | null = null;
  let format: SessionMeta["format"] = "combined";
  let cupsPerSample = 5;
  let closesAt: Date | null = null;

  const bad =
    field("invalid_name", () => {
      name = v.str(input.name, "name", { max: 120 })!;
    }) ??
    field("invalid_date", () => {
      date = v.isoDate(input.date, "date");
    }) ??
    field("invalid_objective", () => {
      objective = v.str(input.objective, "objective", { max: 1000, required: false });
    }) ??
    field("invalid_format", () => {
      format = v.oneOf(input.format, "format", SESSION_FORMATS);
    }) ??
    field("invalid_cups", () => {
      cupsPerSample = v.int(input.cupsPerSample, "cupsPerSample", 1, 5);
    }) ??
    field("too_many_samples", () => {
      v.list(input.samples, "samples", MAX_SAMPLES);
    }) ??
    field("invalid_closes_at", () => {
      // Date-only from the wizard → end of that day (UTC), so the daily cron
      // closes the session the morning AFTER the chosen date, not before it.
      closesAt = input.closesAt
        ? v.dateOnlyEndOfDay(input.closesAt, "closesAt", { future: true })
        : null;
    });
  if (bad) return { ok: false, error: bad };
  return { ok: true, meta: { name, date, objective, format, cupsPerSample, closesAt } };
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

  // Codes are pre-generated OUTSIDE the transaction: a per-create retry
  // inside a Postgres transaction can never work (the first P2002 aborts the
  // tx — every later statement fails with 25P02), so on a code collision the
  // WHOLE batch re-runs with fresh codes instead (bounded attempts; the
  // rolled-back attempt leaves no partial data). The array-form $transaction
  // preserves input order for the coffeeIdx mapping and keeps batch speed.
  const toCreate = coffees.filter((c) => !c.existingCoffeeId);
  let created: { id: string }[] = [];
  if (toCreate.length > 0) {
    const MAX_BATCH_ATTEMPTS = 5;
    let lastError: unknown;
    let done = false;
    for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS && !done; attempt++) {
      const codes = generateUniqueCoffeeCodes(toCreate.length);
      try {
        created = await prisma.$transaction(
          toCreate.map((c, i) =>
            prisma.coffee.create({
              data: {
                code: codes[i],
                name: c.name || "Sin nombre",
                producer: c.producer?.trim() || null,
                variety: c.variety?.trim() || null,
                altitude: c.altitude?.trim() || null,
                roastLevel: c.roastLevel?.trim() || null,
                country: c.country?.trim() || null,
                region: c.region?.trim() || null,
                farm: c.farm?.trim() || null,
                species: c.species?.trim() || null,
                harvestYear: c.harvestYear?.trim() || null,
                processType: c.processType?.trim() || null,
                certifications: c.certifications ?? [],
                notes: c.notes?.trim() || null,
                createdBy: userId,
                visibility: "private",
              },
              select: { id: true },
            }),
          ),
        );
        done = true;
      } catch (err) {
        if (!isCoffeeCodeCollision(err)) throw err;
        lastError = err;
      }
    }
    if (!done) throw lastError;
  }

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
  /** Index into `samples` of the reference sample; null/absent = none. */
  referenceIdx?: number | null;
  locale?: string;
}): Promise<{ ok: false; error: string } | void> {
  const user = await requireUser();

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };
  const metaResult = validateSessionMeta(input);
  if (!metaResult.ok) return metaResult;
  const meta = metaResult.meta;
  const refResult = parseReferenceIdx(input.referenceIdx, input.samples.length);
  if (!refResult.ok) return refResult;

  const createdCoffees = await resolveCoffees(input.coffees ?? [], user.id);
  if (createdCoffees === "coffee_not_found") {
    return { ok: false, error: "coffee_not_found" };
  }

  // redirect() stays OUTSIDE the transaction (it is implemented as a throw).
  const sessionId = await prisma.$transaction(async (tx) => {
    const session = await tx.cuppingSession.create({
      data: {
        name: meta.name,
        date: meta.date,
        objective: meta.objective,
        format: meta.format,
        cupsPerSample: meta.cupsPerSample,
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
      select: { id: true, samples: { select: { id: true, position: true } } },
    });
    await applyReferenceByPosition(tx, session.id, session.samples, refResult.idx);
    return session.id;
  });

  const locale = input.locale || "es";
  redirect(`/${locale}/app/sessions/${sessionId}/cup`);
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
  /** Index into `samples` of the reference sample; null/absent = none. */
  referenceIdx?: number | null;
}): Promise<
  | { ok: true; sessionId: string; inviteToken: string; emailSummary?: GroupEmailSummary }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };
  const metaResult = validateSessionMeta(input);
  if (!metaResult.ok) return metaResult;
  const meta = metaResult.meta;
  const refResult = parseReferenceIdx(input.referenceIdx, input.samples.length);
  if (!refResult.ok) return refResult;

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

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.cuppingSession.create({
      data: {
        name: meta.name,
        date: meta.date,
        objective: meta.objective,
        format: meta.format,
        cupsPerSample: meta.cupsPerSample,
        isGroup: true,
        isAsync: meta.closesAt !== null,
        status: "active",
        closesAt: meta.closesAt,
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
      select: { id: true, samples: { select: { id: true, position: true } } },
    });
    await applyReferenceByPosition(tx, created.id, created.samples, refResult.idx);
    return { id: created.id };
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
  // Kept for API compatibility but IGNORED — both are derived from the
  // session row (moduleKeyForFormat / cupsPerSample) so a tampered client can
  // neither skip the ≥5-cup penalties nor write into a column nobody reads.
  moduleKey: "descriptive" | "affective" | "combined";
  data: Record<string, unknown>;
  cupsPerSample: number;
}) {
  const user = await requireUser({ skipProfileUpsert: true });
  const auth = await requireSampleMember(input.sessionSampleId, user.id);
  // Closed sessions are read-only: a post-close edit would change raw data
  // without re-firing the aggregate trigger (it only fires on isDraft).
  assertSessionWritable(auth);
  const { sessionId } = auth;

  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
    throw new Error("invalid_input");
  }

  // The reference sample is the calibration anchor: its affective ratings
  // are pinned to 5 and its cups cleared on EVERY save, server-side, so no
  // client can move it (lib/referenceRules.ts). Descriptive data is untouched.
  const moduleKey = moduleKeyForFormat(auth.format);
  const data =
    auth.referenceSampleId === input.sessionSampleId && isPinnedModule(moduleKey)
      ? pinReferenceAffective(input.data, auth.cupsPerSample)
      : input.data;
  const fields = computeEvaluationDerived(moduleKey, data, auth.cupsPerSample);

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

// What deleting a session affects — feeds the confirm dialog so the owner
// sees (a) which coffees are involved and who OWNS them (the coffee records
// and their statistics belong to those owners and are kept) and (b) how many
// cuppers' evaluations go away. Owner-only.
export type DeleteImpact = {
  cupperCount: number;
  evaluationCount: number;
  coffees: { id: string; name: string; code: string | null; ownerName: string; ownedByMe: boolean }[];
};

export async function getDeleteImpact(sessionId: string): Promise<DeleteImpact> {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const [cuppers, evaluationCount, samples] = await Promise.all([
    prisma.evaluation.findMany({
      where: { sessionSample: { sessionId }, isDraft: false },
      select: { cupperId: true },
      distinct: ["cupperId"],
    }),
    prisma.evaluation.count({ where: { sessionSample: { sessionId } } }),
    prisma.sessionSample.findMany({
      where: { sessionId, coffeeId: { not: null } },
      select: {
        coffee: {
          select: {
            id: true,
            name: true,
            code: true,
            createdBy: true,
            creator: { select: { displayName: true } },
          },
        },
      },
    }),
  ]);

  const seen = new Set<string>();
  const coffees: DeleteImpact["coffees"] = [];
  for (const s of samples) {
    const c = s.coffee;
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    coffees.push({
      id: c.id,
      name: c.name,
      code: c.code,
      ownerName: c.creator.displayName,
      ownedByMe: c.createdBy === user.id,
    });
  }

  return { cupperCount: cuppers.length, evaluationCount, coffees };
}

// Deleting a session removes the event and every evaluation in it, but NOT
// the cuppers' coffee history: detachCoffeeHistoryForSession first makes sure
// each cupper has a self-contained history row per coffee (with a snapshot of
// their OWN evaluation), then the delete NULLs the session/evaluation FKs
// (SetNull) instead of cascading those rows away. Coffee records are never
// touched — they belong to their owners.
export async function deleteSession(sessionId: string, locale: string = "es") {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  await prisma.$transaction(
    async (tx) => {
      await detachCoffeeHistoryForSession(tx, sessionId);
      await tx.cuppingSession.delete({ where: { id: sessionId } });
    },
    { timeout: 30_000 },
  );

  revalidatePath(`/${locale}/app/sessions`);
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/profile/history`);
  return { ok: true as const };
}

// NOTE: deleteCoffee moved to app/actions/coffees.ts with the rest of the
// coffee CRUD actions.

// ─── Duplicate a session as a template (owner only) ───────────────────────────
// Copies the shell — metadata, samples with their coffee links, group link —
// but NEVER evaluations/participants/invites. Group sessions get a fresh owner
// participant row + invite token (same shape createGroupSession produces).
// closesAt is date-bound and deliberately not copied. Caller routes to /edit.
export async function duplicateSession(
  sessionId: string,
  locale: string = "es",
): Promise<{ ok: true; sessionId: string }> {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);

  const source = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    select: {
      name: true,
      objective: true,
      format: true,
      cupsPerSample: true,
      isGroup: true,
      groupId: true,
      referenceSampleId: true,
      samples: {
        orderBy: { position: "asc" },
        select: { id: true, label: true, position: true, coffeeId: true },
      },
    },
  });
  if (!source) throw new Error("not_found_or_forbidden");
  void session;

  // The reference travels with the template, remapped by position onto the
  // copied sample (ids are fresh in the copy).
  const refPosition =
    source.samples.find((s) => s.id === source.referenceSampleId)?.position ?? null;

  // Keep the group link only if the group still exists and is still ours.
  let groupId: string | null = null;
  if (source.isGroup && source.groupId) {
    const group = await prisma.tastingGroup.findUnique({
      where: { id: source.groupId },
      select: { createdBy: true },
    });
    if (group?.createdBy === user.id) groupId = source.groupId;
  }

  const prefix = locale === "en" ? "Copy of" : "Copia de";
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.cuppingSession.create({
      data: {
        name: `${prefix} ${source.name}`.slice(0, 120),
        date: new Date(),
        objective: source.objective,
        format: source.format,
        cupsPerSample: source.cupsPerSample,
        isGroup: source.isGroup,
        status: "active",
        createdBy: user.id,
        groupId,
        samples: {
          create: source.samples.map((s) => ({
            label: s.label,
            position: s.position,
            coffeeId: s.coffeeId,
          })),
        },
        ...(source.isGroup
          ? {
              participants: { create: { userId: user.id, status: "owner" } },
              invites: { create: { token: crypto.randomUUID(), createdBy: user.id } },
            }
          : {}),
      },
      select: { id: true, samples: { select: { id: true, position: true } } },
    });
    await applyReferenceByPosition(tx, created.id, created.samples, refPosition);
    return { id: created.id };
  });

  revalidatePath(`/${locale}/app/sessions`);
  return { ok: true, sessionId: copy.id };
}

// ─── Reference sample (owner only) ───────────────────────────────────────────
// Marks ONE sample as the "Referencia" the others are compared against, or
// clears it with `null`. Display-only — scoring never reads it. Called
// interactively (wizard step 2, edit page, master panel), hence ActionResult.
export async function setReferenceSample(
  sessionId: string,
  sampleId: string | null,
): Promise<ActionResult<{ referenceSampleId: string | null }>> {
  return run(
    "setReferenceSample",
    async () => {
      const user = await requireUser();
      assertSessionWritable(await requireSessionOwner(sessionId, user.id));

      let next: string | null = null;
      if (sampleId !== null) {
        const id = v.str(sampleId, "sampleId", { max: 64 })!;
        // The FK accepts ANY sample id — the session match is the real guard.
        const sample = await prisma.sessionSample.findFirst({
          where: { id, sessionId },
          select: { id: true },
        });
        if (!sample) throw new Error("not_found_or_forbidden");
        next = sample.id;
      }

      await prisma.cuppingSession.update({
        where: { id: sessionId },
        data: { referenceSampleId: next },
      });

      for (const l of ["es", "en"]) {
        revalidatePath(`/${l}/app/sessions/${sessionId}/cup`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/results`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/edit`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/waiting`);
      }
      return { referenceSampleId: next };
    },
    { sessionId },
  );
}

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
  assertSessionWritable(await requireSessionOwner(sessionId, user.id));

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
  const auth = await requireSampleOwner(sampleId, user.id);
  assertSessionWritable(auth);
  const { sessionId } = auth;

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

// Physical (green-bean) assessment is ONE row per sample, not per cupper, and
// the RLS policy `phys_all` is owner-only — so the TS gate is owner-only too.
// A participant must never be able to overwrite the maestro's assessment.
export async function upsertPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}) {
  const user = await requireUser({ skipProfileUpsert: true });
  assertSessionWritable(await requireSampleOwner(input.sessionSampleId, user.id));
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

// All fields optional: merge semantics (see updateSampleMetadata below) —
// a key ABSENT from the input leaves that coffee field untouched, distinct
// from an explicit "" (clear). The EditSampleMetadataForm caller still
// submits every key every time (its own type stays fully-required), but the
// action itself no longer assumes that.
export type SampleMetadataInput = {
  label?: string;
  name?: string;
  country?: string;
  region?: string;
  farm?: string;
  producer?: string;
  variety?: string;
  processType?: string;
  altitude?: string;
  roastLevel?: string;
};

// Coffee fields (besides name) where merge semantics apply: absent key ->
// untouched, present "" -> explicit clear to null, present non-empty -> set.
const CLEARABLE_COFFEE_FIELDS = [
  "country",
  "region",
  "farm",
  "producer",
  "variety",
  "processType",
  "altitude",
  "roastLevel",
] as const;

export async function updateSampleMetadata(
  sampleId: string,
  input: SampleMetadataInput
): Promise<{ ok: true; coffeeUpdated: boolean }> {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      sessionId: true,
      coffeeId: true,
      coffee: { select: { createdBy: true } },
      session: { select: { createdBy: true, status: true } },
    },
  });
  if (!sample) throw new Error("not_found_or_forbidden");
  if (sample.session.createdBy !== user.id) throw new Error("not_found_or_forbidden");
  assertSessionWritable(sample.session);

  let coffeeUpdated: boolean;

  if (sample.coffeeId) {
    // Samples can point at coffees the session owner merely USES (picked
    // shared/public coffees) — only the coffee's own creator may edit the
    // coffee record itself. For non-owned coffees the label update below
    // still applies; the coffee edit is silently skipped — surfaced to the
    // caller via coffeeUpdated: false so the UI can show a notice instead of
    // pretending the whole save succeeded.
    if (sample.coffee?.createdBy === user.id) {
      // Merge, don't overwrite: only keys actually present in the input
      // touch the coffee row. `undefined` (key absent) leaves the existing
      // value alone; an explicit "" clears it to null. `name` is exempt from
      // the clear rule — a blank/absent name never blanks the coffee's name
      // (also why it's typed `string`, not `string | null`, unlike the rest).
      const coffeeData: {
        name?: string;
      } & Partial<Record<(typeof CLEARABLE_COFFEE_FIELDS)[number], string | null>> = {};
      if (input.name !== undefined && input.name.trim() !== "") {
        coffeeData.name = input.name;
      }
      for (const field of CLEARABLE_COFFEE_FIELDS) {
        const value = input[field];
        if (value !== undefined) {
          coffeeData[field] = value === "" ? null : value;
        }
      }
      if (Object.keys(coffeeData).length > 0) {
        await prisma.coffee.update({
          where: { id: sample.coffeeId },
          data: coffeeData,
        });
      }
      coffeeUpdated = true;
    } else {
      coffeeUpdated = false;
    }
  } else {
    // Implicit create: no linked coffee yet, so (unlike the merge path
    // above) this needs a FULL object — every field not supplied defaults to
    // null, and a missing/blank name defaults to "Sin nombre".
    const coffee = await withCodeRetry((code) =>
      prisma.coffee.create({
        data: {
          code,
          name: input.name?.trim() ? input.name : "Sin nombre",
          country: input.country || null,
          region: input.region || null,
          farm: input.farm || null,
          producer: input.producer || null,
          variety: input.variety || null,
          processType: input.processType || null,
          altitude: input.altitude || null,
          roastLevel: input.roastLevel || null,
          createdBy: user.id,
          visibility: "private",
        },
        select: { id: true },
      }),
    );
    await prisma.sessionSample.update({
      where: { id: sampleId },
      data: { coffeeId: coffee.id },
    });
    coffeeUpdated = true;
  }

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { label: input.label || undefined },
  });

  revalidatePath(`/app/sessions/${sample.sessionId}/cup`);
  revalidatePath(`/app/sessions/${sample.sessionId}/results`);
  revalidatePath(`/app/sessions/${sample.sessionId}/print`);

  return { ok: true as const, coffeeUpdated };
}

// Extrinsic (reveal / origin) data is ONE row per sample and stamps
// revealedBy — owner-only, matching the `ext_all` RLS policy. Participants
// only ever READ it, and only once the sample is revealed (cup/page.tsx,
// cva-pdf route strip it otherwise).
export async function upsertExtrinsic(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
}) {
  const user = await requireUser({ skipProfileUpsert: true });
  assertSessionWritable(await requireSampleOwner(input.sessionSampleId, user.id));
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

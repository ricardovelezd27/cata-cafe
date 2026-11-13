"use server";

import { originFieldsChanged } from "@/lib/coffeeOrigin";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRegisteredUser, requireUserExpecting } from "@/lib/auth";
import { IDENTITY_CHANGED } from "@/lib/expectedUser";
import { run } from "@/lib/safeAction";
import { notifyFlagAfterGroupChange } from "@/lib/groupNotify";
import type { ActionResult } from "@/lib/actionResult";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  generateUniqueCoffeeCodes,
  isCoffeeCodeCollision,
  retryOnCodeCollision,
} from "@/lib/coffeeCode";
import {
  requireSessionOwner,
  requireSessionMember,
  requireSampleMember,
  requireSampleOwner,
  assertSessionWritable,
  assertSessionStarted,
} from "@/lib/sessionAuth";
import { assertSampleMetadataWritable, isPostCloseNaming } from "@/lib/sessionState";
import {
  detachCoffeeHistoryForSession,
  syncCoffeeHistoryForSession,
} from "@/lib/coffeeHistory";
import {
  canEditSessionSettings,
  evaluationWriteAllowed,
  extrinsicWriteAllowed,
  isSessionClosed,
  isSessionExpired,
  planClosesAtChange,
} from "@/lib/sessionState";
import { endOfDayInZone, normalizeZone } from "@/lib/closeRules";
import { lockSessionRow } from "@/lib/sessionLock";
import { REFERENCE_REPIN_REQUIRED, REFERENCE_REVEALED, removeSamplesInTx } from "@/lib/sampleRemoval";
import { coffeeDisplayName, deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { moduleKeyForFormat } from "@/lib/evaluation";
import { writeEvaluationPinAware } from "@/lib/evaluationPinWrite";
import {
  DEFAULT_REFERENCE_MODE,
  normalizeReferenceMode,
  pinWouldTouchRevealed,
  REFERENCE_MODES,
  shouldPinReference,
  planReferenceRestore,
  activeReferenceId,
  planAddReference,
  countRepinOverwrites,
  planReferenceRepin,
  planRemoveActive,
  type ReferenceMode,
} from "@/lib/referenceRules";
import * as v from "@/lib/validate";
import { expressSampleLabel, validateExpressInput } from "@/lib/expressSession";
import { blindReferencePosition, planBlindSamples } from "@/lib/blindLabels";
import {
  parseSamplePrepInput,
  pickSamplePrepInput,
  touchesSamplePrep,
  type SamplePrepInput,
  type SamplePrepUpdate,
} from "@/lib/samplePrep";
import { logInfo, logWarn } from "@/lib/log";
import { checkWizardBounds } from "@/lib/coffeeInputBounds";
import { CERTIFICATIONS } from "@/lib/constants";
import { notifyGroupOfSession, type GroupEmailSummary } from "@/app/actions/groups";
import {
  DEFAULT_NOTIFY_WHEN,
  NOTIFY_WHEN,
  noticeOutcome,
  notifyAtStartFlag,
  shouldNotifyAtCreate,
  shouldNotifyOnBecomingAsync,
} from "@/lib/groupNotify";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";
import { splitEvaluationCounts } from "@/lib/deleteImpact";
import { planAssignCoffee } from "@/lib/assignCoffee";
import { pruneUnreferencedCoffees } from "@/lib/wizardCoffees";
import { WARMUP_IDS, type WarmupId } from "@/lib/warmup/exercises";
import { safeLocale } from "@/lib/safeLocale";
import {
  changedFormatCups,
  isFormatLocked,
  nextSamplePosition,
  activeCopyPosition,
  planDuplicateSamples,
  repinNeedsConfirm,
  MAX_SESSION_SAMPLES,
  defaultSampleLabel,
} from "@/lib/sessionEdit";

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
  // re-validated server-side in linkedCoffeesUsable — never trusted from the client.
  existingCoffeeId?: string;
};

type SampleInput = SamplePrepInput & {
  /** Empty = "give me a random letter" (A4); anything else is kept verbatim. */
  label: string;
  coffeeIdx?: number;
};

/** Prep columns for one wizard sample (A9). Absent keys write nothing; the
 *  values were already validated by validateSessionInput. */
function samplePrepData(s: SampleInput): SamplePrepUpdate {
  return parseSamplePrepInput(pickSamplePrepInput(s as Record<string, unknown>));
}

/** B1: the wizard's / edit form's reference mode. Absent = "anchor" (today's
 *  behaviour); anything else but a listed value throws invalid_input. */
function parseReferenceModeInput(raw: unknown): ReferenceMode {
  return raw === undefined || raw === null
    ? DEFAULT_REFERENCE_MODE
    : v.oneOf(raw, "referenceMode", REFERENCE_MODES);
}

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
  await tx.sessionSample.update({ where: { id: ref.id }, data: { referenceRank: 1 } });
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
  // Shape and size first (S8-03): nothing below may call .trim() on a value
  // the client could have sent as a non-string.
  const outOfBounds = checkWizardBounds(coffees, samples, CERTIFICATIONS);
  if (outOfBounds) return outOfBounds;
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
    // A9: the optional per-sample prep data (roast date, notes, off-protocol).
    try {
      parseSamplePrepInput(pickSamplePrepInput(s as Record<string, unknown>));
    } catch {
      return "invalid_sample_prep";
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
  /** Owner's IANA zone when `closesAt` was set (null = UTC). */
  closesAtZone: string | null;
  warmupExerciseId: WarmupId | null;
};

/** Optional pre-cupping warm-up: "" / null / undefined → none; anything else
 *  must be one of WARMUP_IDS (throws invalid_input). */
function parseWarmupId(value: unknown, field = "warmupExerciseId"): WarmupId | null {
  if (value === null || value === undefined || value === "") return null;
  return v.oneOf(value, field, WARMUP_IDS);
}

function validateSessionMeta(input: {
  name: unknown;
  date: unknown;
  objective?: unknown;
  format: unknown;
  cupsPerSample: unknown;
  samples: unknown;
  closesAt?: unknown;
  closesAtZone?: unknown;
  warmupExerciseId?: unknown;
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
  let cupsPerSample = 2; // TODO(kim-validar:A2): same default as the wizard
  let closesAt: Date | null = null;
  const closesAtZone = input.closesAt ? normalizeZone(input.closesAtZone) : null;
  let warmupExerciseId: WarmupId | null = null;

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
      // Date-only from the wizard → END of that day in the owner's zone (UTC
      // when the form sent none), so writes stop at the owner's midnight and
      // the daily cron closes the session after it, never before.
      if (input.closesAt) {
        const d = endOfDayInZone(input.closesAt, closesAtZone);
        if (d.getTime() < Date.now() + 60_000) throw new Error("invalid_closes_at");
        closesAt = d;
      }
    }) ??
    field("invalid_warmup", () => {
      warmupExerciseId = parseWarmupId(input.warmupExerciseId);
    });
  if (bad) return { ok: false, error: bad };
  return {
    ok: true,
    meta: { name, date, objective, format, cupsPerSample, closesAt, closesAtZone, warmupExerciseId },
  };
}

// Wizard coffee entries. Linked entries (existingCoffeeId) are re-validated
// against the caller's usable set (owned + public + shared-with-me) — a
// tampered id for someone else's private coffee yields "coffee_not_found".
async function linkedCoffeesUsable(coffees: CoffeeInput[], userId: string): Promise<boolean> {
  const existingIds = [
    ...new Set(
      coffees
        .map((c) => c.existingCoffeeId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (existingIds.length === 0) return true;
  const usable = await prisma.coffee.findMany({
    where: { id: { in: existingIds }, AND: [usableCoffeeWhere(userId)] },
    select: { id: true },
  });
  return usable.length === existingIds.length;
}

// Creates the wizard's NEW coffees INSIDE the session's own transaction
// (S9-03, F-crear-sesion-9), so a failed session insert leaves no stray coffee.
// Returns ids index-aligned with the input array (the `coffeeIdx` mapping).
// Codes are pre-generated per attempt: a P2002 on a code aborts the whole
// Postgres transaction (25P02), so the CALLER retries the whole transaction
// with `retryOnCodeCollision` — a per-row retry can never work here.
async function createCoffeesInTx(
  tx: Prisma.TransactionClient,
  coffees: CoffeeInput[],
  userId: string,
): Promise<{ id: string }[]> {
  const toCreate = coffees.filter((c) => !c.existingCoffeeId);
  const codes = generateUniqueCoffeeCodes(toCreate.length);
  const created: { id: string }[] = [];
  for (const [i, c] of toCreate.entries()) {
    created.push(
      await tx.coffee.create({
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
    );
  }
  let createdIdx = 0;
  return coffees.map((c) =>
    c.existingCoffeeId ? { id: c.existingCoffeeId } : created[createdIdx++],
  );
}

// Interactive-transaction options for the create paths (up to 100 coffees are
// now created sequentially inside it).
const CREATE_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

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
  /** B1: "anchor" (default) or "free"; see lib/referenceRules.ts. */
  referenceMode?: string;
  /** Optional pre-cupping warm-up (WARMUP_IDS); null/absent = none. */
  warmupExerciseId?: string | null;
  locale?: string;
}): Promise<{ ok: false; error: string } | void> {
  // S8-10 T1, design (b): wizard validation codes keep the `{ ok:false, error }`
  // shape; run() only catches what is THROWN (guest, DB, expired session) so
  // the form stays mounted and the client can show copy. redirect() passes
  // through run() untouched.
  const result = await run("createSession", () => createSessionBody(input));
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function createSessionBody(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  coffees?: CoffeeInput[];
  samples: SampleInput[];
  referenceIdx?: number | null;
  referenceMode?: string;
  warmupExerciseId?: string | null;
  locale?: string;
}): Promise<{ ok: false; error: string } | void> {
  const user = await requireRegisteredUser();

  // Cards no sample references are never created (S8-10 T4, F-crear-sesion-9).
  input = { ...input, ...pruneUnreferencedCoffees(input.coffees ?? [], input.samples) };

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };
  const metaResult = validateSessionMeta(input);
  if (!metaResult.ok) return metaResult;
  const meta = metaResult.meta;
  const refResult = parseReferenceIdx(input.referenceIdx, input.samples.length);
  if (!refResult.ok) return refResult;
  const referenceMode = parseReferenceModeInput(input.referenceMode);

  if (!(await linkedCoffeesUsable(input.coffees ?? [], user.id))) {
    return { ok: false, error: "coffee_not_found" };
  }

  // A4: the letters are assigned at random (planned ONCE, outside the
  // retried transaction, so a code-collision retry keeps the same order).
  const blind = planBlindSamples(input.samples, randomInt, safeLocale(input.locale), "create");
  const referencePosition = blindReferencePosition(blind, refResult.idx);

  // redirect() stays OUTSIDE the transaction (it is implemented as a throw).
  const sessionId = await retryOnCodeCollision(() => prisma.$transaction(async (tx) => {
    const createdCoffees = await createCoffeesInTx(tx, input.coffees ?? [], user.id);
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
        warmupExerciseId: meta.warmupExerciseId,
        referenceMode,
        samples: {
          create: blind.map((b) => ({
            label: b.label,
            position: b.position,
            coffeeId:
              typeof b.sample.coffeeIdx === "number" && createdCoffees[b.sample.coffeeIdx]
                ? createdCoffees[b.sample.coffeeIdx].id
                : null,
            ...samplePrepData(b.sample),
          })),
        },
      },
      select: { id: true, samples: { select: { id: true, position: true } } },
    });
    await applyReferenceByPosition(tx, session.id, session.samples, referencePosition);
    return session.id;
  }, CREATE_TX_OPTIONS));

  // The locale reaches a redirect URL: whitelist it (`//evil.test` would be a
  // protocol-relative redirect).
  redirect(`/${safeLocale(input.locale)}/app/sessions/${sessionId}/cup`);
}

// ─── "Catar ahora" — express solo session ────────────────────────────────────
// Three taps from a phone: name → format → sample count → /cup. A separate
// action rather than a flag on createSession because that one `redirect()`s
// (cannot return a value) and speaks the wizard's own error codes; this one
// is called interactively, so it returns ActionResult through run().
// Samples are created WITHOUT a coffee (coffeeId null) — the owner can name
// a coffee on them after the session closes (see updateSampleMetadata) so
// express sessions still feed UserCoffeeHistory. `validateSessionInput` is
// untouched: the full wizard keeps requiring a coffee per sample. Rules and
// labels: lib/expressSession.ts (pure, unit-tested).
export async function createExpressSession(input: {
  name: string;
  format: string;
  sampleCount: number;
  locale?: string;
}): Promise<ActionResult<{ sessionId: string }>> {
  return run("createExpressSession", async () => {
    // Guests (anonymous QR walk-ups) never create assets — registered-only.
    const user = await requireRegisteredUser();

    const parsed = validateExpressInput(input);
    const locale = input.locale === "en" ? "en" : "es";

    const session = await prisma.cuppingSession.create({
      data: {
        name: parsed.name,
        date: new Date(),
        format: parsed.format,
        // One cup per sample: the express flow is a quick impression, not a
        // uniformity/defect protocol (one cup: uniformity does not exist, a defect costs 4).
        cupsPerSample: 1,
        status: "active",
        isGroup: false,
        createdBy: user.id,
        samples: {
          create: Array.from({ length: parsed.sampleCount }, (_, i) => ({
            label: expressSampleLabel(i, locale),
            position: i,
            coffeeId: null,
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath(`/${locale}/app/sessions`);
    revalidatePath(`/${locale}/app`);
    return { sessionId: session.id };
  });
}

type GroupSessionResult =
  | {
      ok: true;
      sessionId: string;
      inviteToken: string;
      emailSummary?: GroupEmailSummary;
      emailBlocked?: "rate_limited";
      /** A4: which sample (index in the posted `samples`) got which letter, so
       *  step 2 can show the owner the "Clave de muestras". Owner's own
       *  response only; participants never receive it. */
      sampleKey: { sourceIndex: number; label: string; position: number }[];
    }
  | { ok: false; error: string };

export async function createGroupSession(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  coffees?: CoffeeInput[];
  samples: SampleInput[];
  closesAt?: string;
  closesAtZone?: string;
  groupId?: string;
  notifyGroup?: boolean;
  /** C8: "create" | "start" - when a LIVE session emails its group (default start). */
  notifyGroupWhen?: string;
  referenceIdx?: number | null;
  /** B1: "anchor" (default) or "free"; see lib/referenceRules.ts. */
  referenceMode?: string;
  warmupExerciseId?: string | null;
  /** Locale for generated sample labels (Muestra A / Sample A). */
  locale?: string;
}): Promise<GroupSessionResult> {
  // S8-10 T1 (design b): thrown failures become `{ ok:false, error }` so the
  // wizard stays mounted with its state; validation codes pass through.
  const result = await run("createGroupSession", () => createGroupSessionBody(input));
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function createGroupSessionBody(input: {
  name: string;
  date: string;
  objective?: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  coffees?: CoffeeInput[];
  samples: SampleInput[];
  closesAt?: string;
  /** IANA zone of the owner's browser, so "end of the day" is THEIR day. */
  closesAtZone?: string;
  // Groups v2: optionally link the session to one of the owner's standing
  // tasting groups. When set, notifyGroup (default true) fires a best-effort
  // invitation email to every member right after creation.
  groupId?: string;
  notifyGroup?: boolean;
  notifyGroupWhen?: string;
  /** Index into `samples` of the reference sample; null/absent = none. */
  referenceIdx?: number | null;
  referenceMode?: string;
  /** Optional pre-cupping warm-up (WARMUP_IDS); null/absent = none. */
  warmupExerciseId?: string | null;
  locale?: string;
}): Promise<GroupSessionResult> {
  const user = await requireRegisteredUser();

  // Cards no sample references are never created (S8-10 T4, F-crear-sesion-9).
  input = { ...input, ...pruneUnreferencedCoffees(input.coffees ?? [], input.samples) };

  const invalid = validateSessionInput(input.coffees ?? [], input.samples);
  if (invalid) return { ok: false, error: invalid };
  const metaResult = validateSessionMeta(input);
  if (!metaResult.ok) return metaResult;
  const meta = metaResult.meta;
  const refResult = parseReferenceIdx(input.referenceIdx, input.samples.length);
  if (!refResult.ok) return refResult;
  const referenceMode = parseReferenceModeInput(input.referenceMode);

  if (input.groupId) {
    const group = await prisma.tastingGroup.findUnique({
      where: { id: input.groupId },
      select: { createdBy: true },
    });
    if (!group || group.createdBy !== user.id) {
      return { ok: false, error: "not_found_or_forbidden" };
    }
  }

  if (!(await linkedCoffeesUsable(input.coffees ?? [], user.id))) {
    return { ok: false, error: "coffee_not_found" };
  }

  const token = crypto.randomUUID();

  // C8: when a LIVE session's group is emailed. Absent = today's rule (start);
  // a tampered value throws invalid_input (run() maps it).
  const notifyWhen =
    input.notifyGroupWhen === undefined
      ? DEFAULT_NOTIFY_WHEN
      : v.oneOf(input.notifyGroupWhen, "notifyGroupWhen", NOTIFY_WHEN);

  // A4: random letters, planned once (see createSessionBody).
  const blind = planBlindSamples(input.samples, randomInt, safeLocale(input.locale), "create");
  const referencePosition = blindReferencePosition(blind, refResult.idx);

  const session = await retryOnCodeCollision(() => prisma.$transaction(async (tx) => {
    const createdCoffees = await createCoffeesInTx(tx, input.coffees ?? [], user.id);
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
        closesAtZone: meta.closesAtZone,
        createdBy: user.id,
        groupId: input.groupId ?? null,
        // S8-17 / C8: a LIVE session owes the group email at start
        // (startSession) unless the owner chose "at creation" (sent below).
        notifyGroupAtStart: notifyAtStartFlag({
          hasGroup: !!input.groupId,
          notify: input.notifyGroup !== false,
          isAsync: meta.closesAt !== null,
          notifyWhen,
        }),
        warmupExerciseId: meta.warmupExerciseId,
        referenceMode,
        samples: {
          create: blind.map((b) => ({
            label: b.label,
            position: b.position,
            coffeeId:
              typeof b.sample.coffeeIdx === "number" && createdCoffees[b.sample.coffeeIdx]
                ? createdCoffees[b.sample.coffeeIdx].id
                : null,
            ...samplePrepData(b.sample),
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
    await applyReferenceByPosition(tx, created.id, created.samples, referencePosition);
    return { id: created.id };
  }, CREATE_TX_OPTIONS));

  // Best-effort — a failed/skipped auto-invite email must never fail session
  // creation itself.
  let emailSummary: GroupEmailSummary | undefined;
  let emailBlocked: "rate_limited" | undefined;
  // ASYNC sessions notify at creation; LIVE ones notify from `startSession`
  // unless the owner chose "at creation" (C8; lib/groupNotify.ts). Either way
  // notifyGroupOfSession claims `groupNotifiedAt` atomically, so a later start
  // can never send a second email.
  if (
    input.groupId &&
    input.notifyGroup !== false &&
    shouldNotifyAtCreate({
      isGroup: true,
      isAsync: meta.closesAt !== null,
      hasGroup: true,
      alreadyNotified: false,
      notifyWhen,
    })
  ) {
    try {
      const notified = await notifyGroupOfSession({
        groupId: input.groupId,
        sessionId: session.id,
      });
      if (notified.ok) {
        // notifyGroupOfSession stamps groupNotifiedAt itself (S8-28 D-09).
        emailSummary = notified.data;
      } else if (notified.error === "rate_limited") emailBlocked = "rate_limited";
    } catch (err) {
      logWarn({
        where: "createGroupSession",
        message: "notify_group_threw",
        sessionId: session.id,
        code: (err as { code?: string })?.code ?? "unknown",
      });
    }
  }

  return {
    ok: true,
    sessionId: session.id,
    inviteToken: token,
    emailSummary,
    emailBlocked,
    sampleKey: blind.map((b) => ({ sourceIndex: b.sourceIndex, label: b.label, position: b.position })),
  };
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
  // neither change the cup deduction nor write into a column nobody reads.
  moduleKey: "descriptive" | "affective" | "combined";
  data: Record<string, unknown>;
  cupsPerSample: number;
  // S8-18: ms epoch of the cupper's edit on the device. OPTIONAL (cached bundles
  // omit it and behave exactly as before); a write older than the row's newest
  // accepted one is ignored server-side. Invalid values count as absent.
  clientTs?: number;
  // S10 WP8 (shared device): the user this page was RENDERED for. Optional;
  // absent = today's behaviour. When present and a DIFFERENT user is signed in
  // NOTHING is written and the answer is `{ ok: false, error: "identity_changed" }`
  // (not a throw: a thrown error reaches the browser as an opaque digest).
  // Nobody signed in, or an unreachable auth lookup, is NOT an identity change:
  // it throws `not_authenticated` exactly as requireUser() does.
  expectedUserId?: string;
  // S10 WP5b review H1: true when the page produced this module while the sample
  // was the pinned reference. If the sample is NOT pinned any more when the write
  // runs, the pinned keys keep the stored (restored) values; see
  // lib/referenceRules.ts resolvePinnedPayload. Absent = an ordinary save.
  pinnedView?: boolean;
}): Promise<
  { ok: true; evaluationId: string } | { ok: false; error: "identity_changed" | "sample_revealed" }
> {
  let user;
  try {
    user = await requireUserExpecting(input.expectedUserId, { skipProfileUpsert: true });
  } catch (e) {
    if (input.expectedUserId !== undefined && e instanceof Error && e.message === IDENTITY_CHANGED) {
      return { ok: false, error: IDENTITY_CHANGED };
    }
    throw e;
  }
  const auth = await requireSampleMember(input.sessionSampleId, user.id);
  // Closed sessions are read-only: a post-close edit would change raw data
  // without re-firing the aggregate trigger (it only fires on isDraft).
  assertSessionWritable(auth);
  assertSessionStarted(auth);
  // S10 WP3a (X3, TODO(kim-validar:X3)): a revealed sample of an open session is
  // frozen for ratings. Answered (not thrown) so the cup page keeps the draft
  // on the device and never paints the green "saved" state. Submitting an
  // existing draft (submitAllEvaluations) does not come through here.
  if (!evaluationWriteAllowed(auth)) return { ok: false, error: "sample_revealed" };
  const { sessionId } = auth;

  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
    throw new Error("invalid_input");
  }

  // The reference sample is the calibration anchor: its affective ratings
  // are pinned to 5 and its cups cleared on EVERY save, server-side, so no
  // client can move it (lib/referenceRules.ts). Descriptive data is untouched.
  const moduleKey = moduleKeyForFormat(auth.format);
  // B1: only in "anchor" mode (a "free" reference is scored like any sample).
  const pinsThisSample = shouldPinReference({
    mode: auth.referenceMode,
    moduleKey,
    isActiveReference: auth.referenceSampleId === input.sessionSampleId,
  });
  // S10 WP5b (B2 + review H1): the pinned write is decided inside the write's own
  // transaction against the session's CURRENT reference (lib/evaluationPinWrite.ts).
  const doUpsert = () =>
    writeEvaluationPinAware({
      sessionSampleId: input.sessionSampleId,
      sessionId,
      cupperId: user.id,
      moduleKey,
      cupsPerSample: auth.cupsPerSample,
      posted: input.data,
      pinnedView: input.pinnedView === true,
      pinnedAtAuth: pinsThisSample,
      clientTs: input.clientTs,
    });

  let result: { id: string; applied: boolean };
  try {
    result = await doUpsert();
  } catch (e) {
    // Two concurrent first-saves can both take the create path of the upsert;
    // the loser hits the (sessionSampleId, cupperId) unique constraint. One
    // retry lands on the update path.
    if (!isP2002(e)) throw e;
    result = await doUpsert();
  }

  // S8-18: a newer write already won (lib/evaluationWrite.ts). Nothing changed,
  // so there is nothing to re-fire; the caller still sees a success.
  if (!result.applied) {
    logInfo({
      where: "upsertEvaluation.staleClientWrite",
      userId: user.id,
      sessionId,
      evaluationId: result.id,
    });
    return { ok: true, evaluationId: result.id };
  }

  // S8-04 (F-solo-2): the re-fire of an already submitted row happens INSIDE
  // writeEvaluationOrdered, in the same transaction as the data write
  // (S8-22 B-01); a draft save (the 800 ms hot path) stays one statement.
  return { ok: true, evaluationId: result.id };
}

// What deleting a session affects — feeds the confirm dialog so the owner
// sees (a) which coffees are involved and who OWNS them (the coffee records
// and their statistics belong to those owners and are kept) and (b) how many
// cuppers' evaluations go away. Owner-only.
export type DeleteImpact = {
  cupperCount: number;
  evaluationCount: number;
  /** Submitted vs draft split of `evaluationCount`. */
  submittedCount: number;
  draftCount: number;
  /** Members who joined (the owner is not counted). */
  participantCount: number;
  coffees: { id: string; name: string; code: string | null; ownerName: string; ownedByMe: boolean }[];
};

export async function getDeleteImpact(sessionId: string): Promise<DeleteImpact> {
  const user = await requireUser();
  await requireSessionOwner(sessionId, user.id);

  const [cuppers, evaluationCount, submittedTotal, participantCount, samples] = await Promise.all([
    prisma.evaluation.findMany({
      where: { sessionSample: { sessionId }, isDraft: false },
      select: { cupperId: true },
      distinct: ["cupperId"],
    }),
    prisma.evaluation.count({ where: { sessionSample: { sessionId } } }),
    prisma.evaluation.count({ where: { sessionSample: { sessionId }, isDraft: false } }),
    prisma.sessionParticipant.count({ where: { sessionId, status: "joined" } }),
    prisma.sessionSample.findMany({
      where: { sessionId, coffeeId: { not: null } },
      select: {
        coffee: {
          select: {
            id: true,
            name: true,
            deletedAt: true,
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
      name: coffeeDisplayName(c, deletedCoffeeLabel("es")),
      code: c.code,
      ownerName: c.creator.displayName,
      ownedByMe: c.createdBy === user.id,
    });
  }

  const { submittedCount, draftCount } = splitEvaluationCounts(evaluationCount, submittedTotal);
  return {
    cupperCount: cuppers.length,
    evaluationCount,
    submittedCount,
    draftCount,
    participantCount,
    coffees,
  };
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
): Promise<{ ok: true; sessionId: string; droppedCoffees: number }> {
  const user = await requireRegisteredUser();
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
      referenceMode: true,
      warmupExerciseId: true,
      samples: {
        orderBy: { position: "asc" },
        select: { id: true, label: true, position: true, coffeeId: true, referenceRank: true },
      },
    },
  });
  if (!source) throw new Error("not_found_or_forbidden");
  void session;

  // Every reference travels with the template (B8 default (a): all ranks)
  // together with its sample; the active one is the source's pointer, re-aimed
  // at the copy of the SAME sample below. Coffees the caller can no longer use
  // (anonymized since, unshared) are NOT copied: the sample stays, coffee-less,
  // with its label (F-sesiones-8).
  const linkedIds = [
    ...new Set(source.samples.map((s) => s.coffeeId).filter((id): id is string => id !== null)),
  ];
  const usable =
    linkedIds.length === 0
      ? []
      : await prisma.coffee.findMany({
          where: { id: { in: linkedIds }, AND: [usableCoffeeWhere(user.id)] },
          select: { id: true },
        });
  // A4: auto-labelled samples get a fresh random order (never the source's
  // letter <-> coffee mapping); owner-typed labels keep label and position.
  const plan = planDuplicateSamples(
    source.samples,
    new Set(usable.map((c) => c.id)),
    randomInt,
    safeLocale(locale),
  );
  const copyActivePosition = activeCopyPosition(plan.samples, source.referenceSampleId);

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
        warmupExerciseId: source.warmupExerciseId,
        // B1: the copy keeps the template's reference mode.
        referenceMode: source.referenceMode,
        samples: {
          create: plan.samples.map((s) => ({
            label: s.label,
            position: s.position,
            coffeeId: s.coffeeId,
            referenceRank: s.referenceRank,
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
    // Ranks were copied with the samples; only the active pointer needs the
    // fresh sample id (found by the copy's new position).
    const activeCopy =
      copyActivePosition === null
        ? undefined
        : created.samples.find((s) => s.position === copyActivePosition);
    if (activeCopy) {
      await tx.cuppingSession.update({
        where: { id: created.id },
        data: { referenceSampleId: activeCopy.id },
      });
    }
    return { id: created.id };
  });

  revalidatePath(`/${safeLocale(locale)}/app/sessions`);
  return { ok: true, sessionId: copy.id, droppedCoffees: plan.droppedCoffees };
}

// ─── Reference sample (owner only) ───────────────────────────────────────────
// References ACCUMULATE (S6 multi-reference): naming a sample that is not yet
// a reference gives it `referenceRank = max + 1` (max 3) and makes it the
// ACTIVE one (`referenceSampleId`); earlier references keep their pinned
// 79.00 data but unlock. Naming an existing reference is a no-op. `null`
// removes ONLY the active reference and the previous one becomes active
// again. Display-only — scoring never reads any of this. Called
// interactively (wizard step 2, edit page, master panel), hence ActionResult.
export async function setReferenceSample(
  sessionId: string,
  sampleId: string | null,
  confirmRepin: boolean = false,
): Promise<ActionResult<{ referenceSampleId: string | null; restored?: number }>> {
  return run(
    "setReferenceSample",
    async () => {
      const user = await requireUser();
      assertSessionWritable(await requireSessionOwner(sessionId, user.id));

      let targetId: string | null = null;
      if (sampleId !== null) {
        const id = v.str(sampleId, "sampleId", { max: 64 })!;
        // The FK accepts ANY sample id — the session match is the real guard.
        const sample = await prisma.sessionSample.findFirst({
          where: { id, sessionId },
          select: { id: true },
        });
        if (!sample) throw new Error("not_found_or_forbidden");
        targetId = sample.id;
      }

      // Re-pin mid-session (S6 CP-C2): evaluations the cuppers already wrote
      // for the NEW active reference are rewritten to the 79.00 anchor in the
      // same transaction as the pointer move, so no reader ever sees a
      // reference whose stored rows disagree with the pin. `planReferenceRepin`
      // echoes `isDraft` into SET on purpose — that is what re-fires
      // trg_recompute_aggregate for submitted rows (UPDATE OF "isDraft").
      // The one sanctioned server-side rewrite of a submitted evaluation.
      // Earlier references are never touched (they keep their pinned rows).
      let repinned = 0;
      let restored = 0;
      let active: string | null = null;
      await prisma.$transaction(async (tx) => {
        // LOCK ORDER (lib/sessionLock.ts): the session row FIRST, before any
        // sample/evaluation row, so a cupper's pinned save (FOR SHARE on the
        // session, then a sample key-share) can never deadlock with this change.
        await lockSessionRow(tx, sessionId);
        // Read the ranks inside the transaction so two owners' tabs cannot
        // both pick the same next rank (the unique key is the backstop).
        const rows = await tx.sessionSample.findMany({
          where: { sessionId },
          select: { id: true, referenceRank: true },
        });
        // B1: the mode is read INSIDE the transaction. In "free" mode nothing is
        // pinned, so there is nothing to re-pin and nothing to confirm: the
        // pointer and the ranks move and cuppers' ratings are never touched.
        const sess = await tx.cuppingSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { format: true, cupsPerSample: true, referenceMode: true },
        });
        const pinsWhenActive = shouldPinReference({
          mode: sess.referenceMode,
          moduleKey: moduleKeyForFormat(sess.format),
          isActiveReference: true,
        });
        let repinTarget: string | null = null;
        const activeBefore = activeReferenceId(rows);
        let removedActiveId: string | null = null;
        if (targetId === null) {
          const plan = planRemoveActive(rows);
          removedActiveId = plan.removeId;
          if (plan.removeId) {
            await tx.sessionSample.update({
              where: { id: plan.removeId },
              data: { referenceRank: null },
            });
          }
          active = plan.activeId;
          // B-05: the earlier reference is the pinned anchor again; rewrite
          // its stored rows to 79.00 like the forward path does, but (S8-27)
          // only after the owner confirmed when that would overwrite ratings
          // cuppers already saved (rows already at the anchor need nothing).
          // Anchor mode only (B1).
          if (plan.repinId && pinsWhenActive) {
            const evs = await tx.evaluation.findMany({
              where: { sessionSampleId: plan.repinId },
              select: { id: true, isDraft: true, affectiveData: true, combinedData: true },
            });
            const overwrites = countRepinOverwrites(
              evs,
              moduleKeyForFormat(sess.format),
              sess.cupsPerSample,
            );
            // S10 WP3a review H1: never REWRITE the ratings of a sample that was already revealed.
            const target = await tx.sessionSample.findUniqueOrThrow({
              where: { id: plan.repinId },
              select: { revealed: true },
            });
            if (
              pinWouldTouchRevealed({
                mode: sess.referenceMode,
                moduleKey: moduleKeyForFormat(sess.format),
                targetRevealed: target.revealed,
                overwrites,
              })
            ) {
              throw new Error("reference_revealed");
            }
            if (overwrites > 0 && !confirmRepin) throw new Error("conflict");
            repinTarget = plan.repinId;
          }
        } else {
          const plan = planAddReference(rows, targetId);
          if (plan.kind === "full") throw new Error("invalid_input");
          if (plan.kind === "add") {
            // B2 default (a): replacing cuppers' saved ratings with the 79.00
            // anchor is allowed, but only after the owner confirmed it. The
            // count is read in this transaction so it cannot go stale. Anchor
            // mode only: a free reference never rewrites anything (B1).
            // S10 WP5b (B2-b, TODO(kim-validar:B2)): the originals are kept
            // aside under `ref_previo` (planReferenceRepin) and come back when
            // this sample stops being the active reference.
            if (pinsWhenActive) {
              // S10 WP3a review H1: thrown BEFORE any write.
              const target = await tx.sessionSample.findUniqueOrThrow({
                where: { id: targetId },
                select: { revealed: true },
              });
              const targetEvs = await tx.evaluation.findMany({
                where: { sessionSampleId: targetId },
                select: { id: true, isDraft: true, affectiveData: true, combinedData: true },
              });
              if (
                pinWouldTouchRevealed({
                  mode: sess.referenceMode,
                  moduleKey: moduleKeyForFormat(sess.format),
                  targetRevealed: target.revealed,
                  overwrites: countRepinOverwrites(
                    targetEvs,
                    moduleKeyForFormat(sess.format),
                    sess.cupsPerSample,
                  ),
                })
              ) {
                throw new Error("reference_revealed");
              }
              const existing = await tx.evaluation.count({ where: { sessionSampleId: targetId } });
              if (
                repinNeedsConfirm({
                  isAlreadyReference: false,
                  evaluationCount: existing,
                  confirmRepin,
                })
              ) {
                throw new Error("conflict");
              }
              repinTarget = targetId;
            }
            await tx.sessionSample.update({
              where: { id: targetId },
              data: { referenceRank: plan.rank },
            });
          }
          active = plan.activeId;
        }
        const session = await tx.cuppingSession.update({
          where: { id: sessionId },
          data: { referenceSampleId: active },
          select: { format: true, cupsPerSample: true },
        });
        // S10 WP5b (B2, TODO(kim-validar:B2)): the sample that STOPPED being the
        // active pinned reference (removed, or unlocked because a newer one was
        // named) gets each cupper's previous ratings back, same transaction.
        // Anchor mode only: free mode never pinned, so nothing was stashed.
        const stoppedPinning = targetId === null ? removedActiveId : activeBefore;
        if (stoppedPinning && stoppedPinning !== active && pinsWhenActive) {
          const stoppedEvals = await tx.evaluation.findMany({
            where: { sessionSampleId: stoppedPinning },
            select: { id: true, isDraft: true, affectiveData: true, combinedData: true },
          });
          const { plan: restore, skipped } = planReferenceRestore(
            stoppedEvals,
            moduleKeyForFormat(session.format),
            session.cupsPerSample,
          );
          for (const { id, data } of restore) {
            await tx.evaluation.update({ where: { id }, data: data as Prisma.EvaluationUpdateInput });
          }
          restored = restore.filter((r) => r.restored).length;
          for (const evaluationId of skipped) {
            logWarn({ where: "setReferenceSample", sessionId, evaluationId, message: "restore_skipped_invalid" });
          }
        }
        if (!repinTarget) return;
        const moduleKey = moduleKeyForFormat(session.format);
        if (!pinsWhenActive) return;
        const evaluations = await tx.evaluation.findMany({
          where: { sessionSampleId: repinTarget },
          select: { id: true, isDraft: true, affectiveData: true, combinedData: true },
        });
        const plan = planReferenceRepin(evaluations, moduleKey, session.cupsPerSample);
        for (const { id, data } of plan) {
          await tx.evaluation.update({ where: { id }, data });
        }
        repinned = plan.length;
        // One evaluation.update per cupper fires the aggregate trigger, so a
        // big group can exceed Prisma's 5s default interactive timeout.
      }, { timeout: 15000 });
      if (repinned > 0) {
        logInfo({ where: "setReferenceSample", sessionId, message: "reference_repinned", count: repinned });
      }
      if (restored > 0) {
        logInfo({ where: "setReferenceSample", sessionId, message: "reference_ratings_restored", count: restored });
      }

      for (const l of ["es", "en"]) {
        revalidatePath(`/${l}/app/sessions/${sessionId}/cup`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/results`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/edit`);
        revalidatePath(`/${l}/app/sessions/${sessionId}/waiting`);
      }
      // `restored` only when something was given back (a zero never changes the shape).
      return restored > 0 ? { referenceSampleId: active, restored } : { referenceSampleId: active };
    },
    { sessionId },
  );
}

export type UpdateSessionInput = {
  name?: string;
  date?: string;
  objective?: string | null;
  // Group sessions only (S6 CP-C3): "YYYY-MM-DD" sets an automatic close at
  // the end of that day (UTC) and flips isAsync on; "" / null clears both.
  closesAt?: string | null;
  /** IANA zone of the owner's browser; sent together with a changed closesAt. */
  closesAtZone?: string | null;
  // Only valid for group sessions; null unlinks. A solo session must not carry
  // a groupId — the group page lists sessions by groupId and members would get
  // dead links to a session they can't open.
  groupId?: string | null;
  // format/cupsPerSample are LOCKED once any evaluation exists (scores are
  // derived from them); the server rejects regardless of what the form shows.
  format?: "descriptive" | "affective" | "combined";
  cupsPerSample?: number;
  /** B1: "anchor" | "free"; changing it is refused once the format is locked. */
  referenceMode?: string;
  /** Optional pre-cupping warm-up (WARMUP_IDS); null clears it. */
  warmupExerciseId?: string | null;
  locale?: string;
};

/** `groupNotice` (C8): set when this edit gave a ticked live session a closing
 *  date and so sent the group notice that would have gone out at the start. */
type UpdateSessionResult =
  | { ok: true; groupNotice?: "sent" | "partial" | "rate_limited" | "failed" }
  | { ok: false; error: string };

export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput,
): Promise<UpdateSessionResult> {
  // S8-10 T6: a thrown failure (expired auth, DB) becomes `{ ok:false, error }`
  // instead of an opaque digest; the specific codes below keep their shape.
  const result = await run("updateSession", () => updateSessionBody(sessionId, input), { sessionId });
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function updateSessionBody(
  sessionId: string,
  input: UpdateSessionInput,
): Promise<UpdateSessionResult> {
  const user = await requireUser();
  const session = await requireSessionOwner(sessionId, user.id);
  // Closed OR past its closing date = read-only, including a new closing date
  // or clearing it (S10 WP4a, Kim C9: nothing reopens; TODO(kim-validar:C9)).
  // Server clock. This action keeps its own `{ ok, error }` shape (not run()),
  // so the code is returned rather than thrown.
  if (!canEditSessionSettings(session)) return { ok: false as const, error: "session_closed" };

  const data: {
    name?: string;
    date?: Date;
    objective?: string | null;
    groupId?: string | null;
    notifyGroupAtStart?: boolean;
    format?: string;
    cupsPerSample?: number;
    referenceMode?: ReferenceMode;
    closesAt?: Date | null;
    closesAtZone?: string | null;
    isAsync?: boolean;
    startedAt?: Date;
    warmupExerciseId?: string | null;
  } = {};

  if (input.closesAt !== undefined) {
    try {
      // The stored zone decides whether an unchanged day is a no-op (legacy
      // rows are UTC); the posted zone decides what a NEW day means.
      const stored = await prisma.cuppingSession.findUnique({
        where: { id: sessionId },
        select: {
          closesAt: true,
          closesAtZone: true,
          startedAt: true,
          samples: { where: { evaluations: { some: {} } }, select: { id: true }, take: 1 },
        },
      });
      const plan = planClosesAtChange(
        {
          isGroup: session.isGroup,
          closesAt: stored?.closesAt ?? null,
          closesAtZone: stored?.closesAtZone ?? null,
          startedAt: stored?.startedAt ?? null,
          hasActivity: (stored?.samples.length ?? 0) > 0,
        },
        input.closesAt,
        Date.now(),
        input.closesAtZone,
      );
      if (plan) {
        data.closesAt = plan.closesAt;
        data.closesAtZone = plan.closesAtZone;
        data.isAsync = plan.isAsync;
        if (plan.startedAt) data.startedAt = plan.startedAt;
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "invalid_closes_at";
      return { ok: false as const, error: code };
    }
  }

  // lib/validate on every client-posted value (S8-10 T6): same bounds and
  // codes as the wizard's validateSessionMeta.
  if (input.name !== undefined) {
    try {
      data.name = v.str(input.name, "name", { max: 120 })!;
    } catch {
      return { ok: false as const, error: "invalid_name" };
    }
  }
  if (input.date !== undefined) {
    try {
      data.date = v.isoDate(input.date, "date");
    } catch {
      return { ok: false as const, error: "invalid_date" };
    }
  }
  if (input.objective !== undefined) {
    try {
      data.objective =
        input.objective === null
          ? null
          : v.str(input.objective, "objective", { max: 1000, required: false });
    } catch {
      return { ok: false as const, error: "invalid_objective" };
    }
  }
  if (input.warmupExerciseId !== undefined) {
    let next: WarmupId | null;
    try {
      next = parseWarmupId(input.warmupExerciseId);
    } catch {
      return { ok: false as const, error: "invalid_warmup" };
    }
    // Locked once the cupping started or anyone has evaluated: changing it
    // would re-arm the overlay mid-cupping for everyone (S6 warm-up v3).
    const current = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: {
        warmupExerciseId: true,
        samples: { where: { evaluations: { some: {} } }, select: { id: true }, take: 1 },
      },
    });
    if (next !== (current?.warmupExerciseId ?? null)) {
      if (session.startedAt || (current?.samples.length ?? 0) > 0) {
        return { ok: false as const, error: "warmup_locked" };
      }
      data.warmupExerciseId = next;
    }
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
    // S8-17: the "notify the group at start" tick was made for the group the
    // owner picked at creation. If the group changes (or is removed) the start
    // email must not go to a different group the owner never ticked it for;
    // they can notify from the group page. An unchanged re-post keeps the flag.
    const storedGroup = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: { groupId: true },
    });
    const flag = notifyFlagAfterGroupChange(storedGroup?.groupId ?? null, data.groupId ?? null);
    if (flag !== undefined) data.notifyGroupAtStart = flag;
  }

  if (input.format !== undefined || input.cupsPerSample !== undefined) {
    let format: string | undefined;
    let cups: number | undefined;
    try {
      if (input.format !== undefined) format = v.oneOf(input.format, "format", SESSION_FORMATS);
    } catch {
      return { ok: false as const, error: "invalid_format" };
    }
    try {
      if (input.cupsPerSample !== undefined) {
        cups = v.int(input.cupsPerSample, "cupsPerSample", 1, 5);
      }
    } catch {
      return { ok: false as const, error: "invalid_cups" };
    }
    // Only what actually differs counts as a change: the form re-posts the
    // stored format/cups, and a harmless rename must not hit the lock.
    const stored = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: { format: true, cupsPerSample: true },
    });
    const changed = changedFormatCups(stored ?? { format: "", cupsPerSample: 0 }, {
      format,
      cupsPerSample: cups,
    });
    if (changed.format !== undefined || changed.cupsPerSample !== undefined) {
      const evalCount = await prisma.evaluation.count({
        where: { sessionSample: { sessionId } },
      });
      if (isFormatLocked(session.startedAt, evalCount)) {
        return { ok: false as const, error: "format_locked" };
      }
      if (changed.format !== undefined) data.format = changed.format;
      if (changed.cupsPerSample !== undefined) data.cupsPerSample = changed.cupsPerSample;
    }
  }

  // B1: the reference mode freezes with the format (before the start and before
  // any evaluation), because it decides whether the reference is pinned at
  // 79.00. The server reads the stored value (session.referenceMode); an
  // unchanged re-post is a no-op, so a harmless rename never hits the lock.
  if (input.referenceMode !== undefined) {
    let mode: ReferenceMode;
    try {
      mode = v.oneOf(input.referenceMode, "referenceMode", REFERENCE_MODES);
    } catch {
      return { ok: false as const, error: "invalid_input" };
    }
    if (mode !== normalizeReferenceMode(session.referenceMode)) {
      const evalCount = await prisma.evaluation.count({
        where: { sessionSample: { sessionId } },
      });
      if (isFormatLocked(session.startedAt, evalCount)) {
        return { ok: false as const, error: "format_locked" };
      }
      data.referenceMode = mode;
    }
  }

  // C8: a LIVE session ticked "notify at start" that this edit turns async has
  // no start any more -> the group notice goes out now (decision in
  // lib/groupNotify.ts) and the flag is cleared in the same write, so exactly
  // one of {creation, start, this edit} sends it.
  let noticeGroupId: string | null = null;
  if (data.isAsync === true) {
    const cur = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: {
        isGroup: true,
        isAsync: true,
        groupId: true,
        notifyGroupAtStart: true,
        groupNotifiedAt: true,
        startedAt: true,
      },
    });
    if (cur) {
      const effectiveGroupId = data.groupId !== undefined ? data.groupId : cur.groupId;
      const effectiveFlag = data.notifyGroupAtStart ?? cur.notifyGroupAtStart;
      if (
        effectiveGroupId &&
        shouldNotifyOnBecomingAsync({
          isGroup: cur.isGroup,
          wasAsync: cur.isAsync,
          becomesAsync: true,
          hasGroup: true,
          notifyGroupAtStart: effectiveFlag,
          alreadyNotified: cur.groupNotifiedAt !== null,
          started: cur.startedAt !== null,
        })
      ) {
        data.notifyGroupAtStart = false;
        noticeGroupId = effectiveGroupId;
      }
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.cuppingSession.update({ where: { id: sessionId }, data });
  }

  // Best effort and non-blocking, like createGroupSession / startSession: the
  // save already happened; a refusal or failure is reported, never thrown.
  // notifyGroupOfSession claims `groupNotifiedAt` atomically and releases it
  // when nothing went out.
  let groupNotice: "sent" | "partial" | "rate_limited" | "failed" | undefined;
  if (noticeGroupId) {
    try {
      const res = await notifyGroupOfSession({ groupId: noticeGroupId, sessionId });
      if (res.ok) groupNotice = noticeOutcome(res.data);
      else if (res.error === "rate_limited") groupNotice = "rate_limited";
      else if (res.error !== "invalid_input") groupNotice = "failed";
    } catch (err) {
      groupNotice = "failed";
      logWarn({
        where: "updateSession",
        message: "notify_group_on_async_threw",
        sessionId,
        code: (err as { code?: string })?.code ?? "unknown",
      });
    }
  }

  const locale = safeLocale(input.locale);
  revalidatePath(`/${locale}/app/sessions`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}/cup`);
  revalidatePath(`/${locale}/app/sessions/${sessionId}/results`);
  return { ok: true as const, groupNotice };
}

// Sample add/rename/remove write to session_samples, which is NOT in the
// supabase_realtime publication. Touching the session row's updatedAt makes
// the existing `cupping_sessions` UPDATE subscription (CupClient, waiting
// room) fire, and those clients router.refresh() + reconcile (S6 CP-C4,
// option (a) — no new publication table, no SQL). Keep it next to the write
// (same transaction when there is one).
type SessionToucher = { cuppingSession: { update: typeof prisma.cuppingSession.update } };
async function touchSession(db: SessionToucher, sessionId: string): Promise<void> {
  await db.cuppingSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}

type AddSampleResult = { ok: true; sampleId: string } | { ok: false; error: string };

export async function addSessionSample(
  sessionId: string,
  input: { label?: string; coffeeId?: string | null; locale?: string },
): Promise<AddSampleResult> {
  const result = await run("addSessionSample", () => addSessionSampleBody(sessionId, input), {
    sessionId,
  });
  return result.ok ? result.data : { ok: false, error: result.error };
}

async function addSessionSampleBody(
  sessionId: string,
  input: { label?: string; coffeeId?: string | null; locale?: string },
): Promise<AddSampleResult> {
  const user = await requireUser();
  assertSessionWritable(await requireSessionOwner(sessionId, user.id));
  const locale = safeLocale(input.locale);

  let label: string | null;
  try {
    label = v.str(input.label, "label", { max: 120, required: false });
  } catch {
    return { ok: false, error: "invalid_label" };
  }

  if (input.coffeeId) {
    // Same re-validation as the wizard: the coffee must be usable by the
    // caller (owned + public + shared-with-me) — never trusted from the client.
    const usable = await prisma.coffee.findFirst({
      where: { id: input.coffeeId, AND: [usableCoffeeWhere(user.id)] },
      select: { id: true },
    });
    if (!usable) return { ok: false, error: "coffee_not_found" };
  }

  // The position is computed INSIDE the transaction and a unique-key collision
  // (two owner tabs adding at once) retries with a fresh max (S8-10 T6).
  let sample: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !sample; attempt++) {
    try {
      sample = await prisma.$transaction(async (tx) => {
        const count = await tx.sessionSample.count({ where: { sessionId } });
        if (count >= MAX_SESSION_SAMPLES) throw new Error("too_many_samples");
        const max = await tx.sessionSample.aggregate({
          where: { sessionId },
          _max: { position: true },
        });
        const position = nextSamplePosition(max._max.position);
        const created = await tx.sessionSample.create({
          data: {
            sessionId,
            label: label ?? defaultSampleLabel(position, locale),
            position,
            coffeeId: input.coffeeId ?? null,
          },
          select: { id: true },
        });
        await touchSession(tx, sessionId);
        return created;
      });
    } catch (e) {
      if (e instanceof Error && e.message === "too_many_samples") {
        return { ok: false, error: "too_many_samples" };
      }
      if (!isP2002(e) || attempt === 2) throw e;
    }
  }
  if (!sample) throw new Error("conflict");

  revalidatePath(`/${locale}/app/sessions/${sessionId}/cup`);
  return { ok: true, sampleId: sample.id };
}

// Label-only rename. Deliberately separate from updateSampleMetadata (which
// rewrites the linked coffee's fields and expects the full metadata input).
export async function renameSessionSample(sampleId: string, label: string) {
  const user = await requireUser();
  const auth = await requireSampleOwner(sampleId, user.id);
  assertSessionWritable(auth);
  const { sessionId } = auth;

  let trimmed: string;
  try {
    trimmed = v.str(label, "label", { max: 120 })!;
  } catch {
    return { ok: false as const, error: "invalid_label" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.sessionSample.update({
      where: { id: sampleId },
      data: { label: trimmed },
    });
    await touchSession(tx, sessionId);
  });

  revalidatePath(`/es/app/sessions/${sessionId}/cup`);
  revalidatePath(`/en/app/sessions/${sessionId}/cup`);
  return { ok: true as const };
}

export async function removeSessionSample(sampleId: string, locale: string = "es") {
  const user = await requireUser();

  // Owner gate + closed/expired guard (F-sesiones-3, closed half). A closed
  // session returns a code instead of throwing so the client can show copy.
  const auth = await requireSampleOwner(sampleId, user.id);
  if (isSessionExpired(auth)) return { ok: false as const, error: "session_closed" };
  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: { id: true, sessionId: true },
  });
  if (!sample) throw new Error("not_found_or_forbidden");

  // A sample with ANY cupper's evaluation, physical or origin data is
  // load-bearing (deleting cascades all of it). The count is taken INSIDE the
  // transaction so a first evaluation landing between the check and the delete
  // cannot be cascaded away (S8-10 T5; F-sesiones-3, race half).
  const refused = await prisma.$transaction(async (tx) => {
    // LOCK ORDER (lib/sessionLock.ts): the session row before the sample row below.
    await lockSessionRow(tx, sample.sessionId);
    // (S8-27: removeSamplesInTx may throw REFERENCE_REPIN_REQUIRED; the
    // transaction rolls back and the catch below turns it into a code.)
    // READ COMMITTED does not stop a cupper's first auto-save from committing
    // between the counts and the delete. Row-lock the sample first: the
    // FK key-share lock that an evaluation/physical/extrinsic INSERT takes on
    // its parent conflicts with FOR UPDATE, so a concurrent insert either
    // lands before the lock (and is counted) or waits until we are done.
    await tx.$queryRaw`SELECT id FROM session_samples WHERE id = ${sampleId} FOR UPDATE`;
    const [evaluations, physical, extrinsic] = await Promise.all([
      tx.evaluation.count({ where: { sessionSampleId: sampleId } }),
      tx.physicalEvaluation.count({ where: { sessionSampleId: sampleId } }),
      tx.extrinsicData.count({ where: { sessionSampleId: sampleId } }),
    ]);
    if (evaluations > 0) return "sample_has_evaluations" as const;
    if (physical > 0 || extrinsic > 0) return "sample_has_data" as const;
    // Delete + reference-rank compaction + position re-pack (lib/sampleRemoval.ts,
    // shared with the solo "Terminar cata" finish, S8-05).
    await removeSamplesInTx(tx, sample.sessionId, [sampleId], { onReactivate: "refuse" });
    await touchSession(tx, sample.sessionId);
    return null;
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === REFERENCE_REPIN_REQUIRED) {
      return "reference_repin_required" as const;
    }
    if (e instanceof Error && e.message === REFERENCE_REVEALED) {
      return "reference_revealed" as const;
    }
    throw e;
  });
  if (refused) return { ok: false as const, error: refused };

  revalidatePath(`/${safeLocale(locale)}/app/sessions/${sample.sessionId}/cup`);
  return { ok: true as const };
}

// Physical (green-bean) assessment is ONE row per sample, not per cupper, and
// the RLS policy `phys_all` is owner-only — so the TS gate is owner-only too.
// A participant must never be able to overwrite the maestro's assessment.
export async function upsertPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
  /** S10 WP8: see upsertEvaluation. Absent = today's behaviour. */
  expectedUserId?: string;
}): Promise<{ ok: true } | { ok: false; error: "identity_changed" }> {
  let user;
  try {
    user = await requireUserExpecting(input.expectedUserId, { skipProfileUpsert: true });
  } catch (e) {
    if (input.expectedUserId !== undefined && e instanceof Error && e.message === IDENTITY_CHANGED) {
      return { ok: false, error: IDENTITY_CHANGED };
    }
    throw e;
  }
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
export type SampleMetadataInput = SamplePrepInput & {
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

/** True when the input carries at least one non-blank coffee field (name or
 *  any clearable field). A label-only save on a coffee-less sample must not
 *  mint a coffee. */
function hasAnyCoffeeField(input: SampleMetadataInput): boolean {
  if (input.name?.trim()) return true;
  return CLEARABLE_COFFEE_FIELDS.some((f) => (input[f] ?? "").trim() !== "");
}

export async function updateSampleMetadata(
  sampleId: string,
  input: SampleMetadataInput
): Promise<{ ok: true; coffeeUpdated: boolean }> {
  const user = await requireRegisteredUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      sessionId: true,
      coffeeId: true,
      offProtocol: true,
      coffee: {
        select: {
          createdBy: true,
          deletedAt: true,
          country: true,
          region: true,
          farm: true,
          producer: true,
          variety: true,
          processType: true,
          altitude: true,
          roastLevel: true,
        },
      },
      // closesAt: assertSessionWritable is expiry-aware (S8-22 A-05), so a
      // label edit stops at the deadline, not at the next 06:00 UTC cron.
      session: { select: { createdBy: true, status: true, closesAt: true } },
    },
  });
  if (!sample) throw new Error("not_found_or_forbidden");
  if (sample.session.createdBy !== user.id) throw new Error("not_found_or_forbidden");

  // Post-close coffee naming — the SECOND sanctioned post-close write (the
  // first is upsertExtrinsic on a revealed sample, via ExtrinsicEditDialog). Express sessions create
  // their samples without a coffee; the owner may name one AFTER the session
  // closed so the cupping still feeds UserCoffeeHistory. Allowed only when:
  // owner (checked above) AND the sample has no coffee yet AND the call
  // actually names a coffee. Anything else on a closed session stays
  // read-only (session_closed), including label-only renames.
  const postCloseNaming = isPostCloseNaming(sample.session, sample, hasAnyCoffeeField(input));
  assertSampleMetadataWritable(sample.session, sample, hasAnyCoffeeField(input));

  // A9: per-sample prep data. Same merge semantics as the coffee fields (absent
  // key = untouched, "" = clear) and validated before anything is written.
  // NOT a sanctioned post-close write: on a closed or expired session it is
  // refused even when the call also names a coffee (postCloseNaming).
  const prepUpdate = parseSamplePrepInput(
    pickSamplePrepInput(input as Record<string, unknown>),
    Date.now(),
    sample.offProtocol,
  );
  if (touchesSamplePrep(prepUpdate) && isSessionExpired(sample.session)) {
    throw new Error("session_closed");
  }

  let coffeeUpdated: boolean;

  if (sample.coffeeId) {
    // Samples can point at coffees the session owner merely USES (picked
    // shared/public coffees) — only the coffee's own creator may edit the
    // coffee record itself. For non-owned coffees the label update below
    // still applies; the coffee edit is silently skipped — surfaced to the
    // caller via coffeeUpdated: false so the UI can show a notice instead of
    // pretending the whole save succeeded. An anonymized coffee (deletedAt)
    // takes the same path: its identifying fields must never be rewritten.
    if (sample.coffee?.createdBy === user.id && !sample.coffee.deletedAt) {
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
          data: {
            ...coffeeData,
            // F-cafes-9: stamp the origin edit only when an origin field really changed.
            ...(originFieldsChanged(sample.coffee, coffeeData) ? { originEditedAt: new Date() } : {}),
          },
        });
      }
      coffeeUpdated = true;
    } else {
      coffeeUpdated = false;
    }
  } else if (!hasAnyCoffeeField(input)) {
    // Coffee-less sample (express sessions create them on purpose) and the
    // caller only touched the label: nothing to create. Minting a private
    // "Sin nombre" coffee here used to be the trap — every label rename on
    // such a sample left a ghost coffee in the owner's library. Not a refused
    // edit, so the "coffee not owned" notice must NOT show.
    coffeeUpdated = true;
  } else {
    // Implicit create: no linked coffee yet, so (unlike the merge path
    // above) this needs a FULL object — every field not supplied defaults to
    // null, and a missing/blank name defaults to "Sin nombre".
    // Create + link in ONE transaction (S8-10 T10, F-express-3): a failed link
    // used to leave an orphan coffee that the next try duplicated. A code
    // collision aborts the surrounding Postgres tx (25P02), so the WHOLE
    // transaction is retried with a fresh pre-generated code.
    let attempts = 0;
    for (;;) {
      const [code] = generateUniqueCoffeeCodes(1);
      try {
        await prisma.$transaction(async (tx) => {
          const coffee = await tx.coffee.create({
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
          });
          // Guarded link: a concurrent call that already linked a coffee makes
          // count 0 -> conflict, rolling back this tx (incl. the coffee create).
          // `conflict` is not a code collision, so the retry loop rethrows it.
          const linked = await tx.sessionSample.updateMany({
            where: { id: sampleId, coffeeId: null },
            // Named after the close: the close routine revealed every coffee-linked
            // sample, so this one is revealed on the spot (nothing is blind any more).
            data: { coffeeId: coffee.id, ...(postCloseNaming ? { revealed: true } : {}) },
          });
          if (linked.count === 0) throw new Error("conflict");
        });
        break;
      } catch (err) {
        if (!isCoffeeCodeCollision(err) || ++attempts >= 5) throw err;
      }
    }
    coffeeUpdated = true;
  }

  if (!postCloseNaming) {
    await prisma.$transaction(async (tx) => {
      await tx.sessionSample.update({
        where: { id: sampleId },
        data: { label: input.label || undefined, ...prepUpdate },
      });
      await touchSession(tx, sample.sessionId);
    });
  } else {
    // The session already closed without a history row for this sample (no
    // coffee at close time) — same idempotent sync the close routine runs.
    await syncCoffeeHistoryForSession(sample.sessionId);
    for (const l of ["es", "en"] as const) {
      revalidatePath(`/${l}/app/profile/history`);
      revalidatePath(`/${l}/app/coffees`);
    }
  }

  // Locale-prefixed: a bare "/app/..." path matches no cached page (S9-03 review).
  for (const l of ["es", "en"] as const) {
    revalidatePath(`/${l}/app/sessions/${sample.sessionId}/cup`);
    revalidatePath(`/${l}/app/sessions/${sample.sessionId}/results`);
    revalidatePath(`/${l}/app/sessions/${sample.sessionId}/print`);
  }

  return { ok: true as const, coffeeUpdated };
}

/**
 * "Asignar café" on a coffee-less sample (S8-10 T10, F-express-3). Returns an
 * ActionResult so the results dialog can toast instead of crashing: either
 * links an EXISTING coffee the caller may use (usableCoffeeWhere, else
 * `coffee_not_usable`) or creates one and links it in one transaction (the
 * create half is updateSampleMetadata's). Owner only; refuses a sample that
 * already has a coffee (`conflict`). The post-close sanction is unchanged:
 * on a closed session the sample is revealed and history is re-synced.
 */
export async function assignSampleCoffee(
  sampleId: string,
  input: Parameters<typeof planAssignCoffee>[0],
): Promise<ActionResult<{ linked: boolean }>> {
  return run("assignSampleCoffee", async () => {
    const user = await requireRegisteredUser();
    const plan = planAssignCoffee(input);
    const sample = await requireSampleOwner(sampleId, user.id);
    // Open sessions follow the normal write guard; a closed one is allowed
    // here ONLY because the sample is coffee-less (checked below).
    if (!isSessionClosed(sample)) assertSessionWritable(sample);

    const current = await prisma.sessionSample.findUnique({
      where: { id: sampleId },
      select: { coffeeId: true },
    });
    if (!current) throw new Error("not_found_or_forbidden");
    if (current.coffeeId) throw new Error("conflict");

    if (plan.mode === "create") {
      await updateSampleMetadata(sampleId, plan.fields);
      return { linked: false };
    }

    const coffee = await prisma.coffee.findFirst({
      where: { id: plan.coffeeId, ...usableCoffeeWhere(user.id) },
      select: { id: true },
    });
    if (!coffee) throw new Error("coffee_not_usable");

    const closed = isSessionClosed(sample);
    const res = await prisma.sessionSample.updateMany({
      where: { id: sampleId, coffeeId: null },
      data: { coffeeId: coffee.id, ...(closed ? { revealed: true } : {}) },
    });
    if (res.count === 0) throw new Error("conflict");

    // Locale-aware (a bare "/app/…" path matches no cached page).
    for (const l of ["es", "en"]) {
      if (closed) {
        revalidatePath(`/${l}/app/profile/history`);
        revalidatePath(`/${l}/app/coffees`);
      }
      revalidatePath(`/${l}/app/sessions/${sample.sessionId}/cup`);
      revalidatePath(`/${l}/app/sessions/${sample.sessionId}/results`);
      revalidatePath(`/${l}/app/sessions/${sample.sessionId}/print`);
    }
    if (closed) await syncCoffeeHistoryForSession(sample.sessionId);
    return { linked: true };
  });
}

// Extrinsic (reveal / origin) data is ONE row per sample and stamps
// revealedBy — owner-only, matching the `ext_all` RLS policy. Participants
// only ever READ it, and only once the sample is revealed (cup/page.tsx,
// cva-pdf route strip it otherwise).
//
// POST-CLOSE WRITE (S8-12, F-resultados-4): the FIRST sanctioned write on a
// closed/expired session (the second is updateSampleMetadata naming a
// coffee-less sample). Allowed only for the owner AND a REVEALED sample
// (extrinsicWriteAllowed), otherwise `session_closed`. Such a write stamps
// `editedAt` so reports can say "Origen editado el <fecha>".
// Origin edits after close are an intended, allowed exception.
export async function upsertExtrinsic(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
  /** S10 WP8: see upsertEvaluation. Absent = today's behaviour; a mismatch is
   *  the ActionResult error `identity_changed`. */
  expectedUserId?: string;
}): Promise<ActionResult<{ edited: boolean }>> {
  return run("upsertExtrinsic", async () => {
    const user = await requireUserExpecting(input.expectedUserId, { skipProfileUpsert: true });
    const auth = await requireSampleOwner(input.sessionSampleId, user.id);
    const over = isSessionExpired(auth);
    if (over) {
      const sample = await prisma.sessionSample.findUnique({
        where: { id: input.sessionSampleId },
        select: { revealed: true },
      });
      if (!extrinsicWriteAllowed({ over, revealed: sample?.revealed === true })) {
        throw new Error("session_closed");
      }
    }
    const editedAt = over ? new Date() : null;
    await prisma.extrinsicData.upsert({
      where: { sessionSampleId: input.sessionSampleId },
      create: {
        sessionSampleId: input.sessionSampleId,
        data: input.data as never,
        revealedBy: user.id,
        revealedAt: new Date(),
        ...(editedAt ? { editedAt } : {}),
      },
      update: {
        data: input.data as never,
        revealedBy: user.id,
        revealedAt: new Date(),
        ...(editedAt ? { editedAt } : {}),
      },
    });
    if (over) {
      revalidatePath(`/es/app/sessions/${auth.sessionId}/results`);
      revalidatePath(`/en/app/sessions/${auth.sessionId}/results`);
    }
    return { edited: over };
  });
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

/** Waiting-room poller for the synced warm-up (S6 warm-up v3 PR3). Kept
 *  SEPARATE from `checkSessionStarted` on purpose: service-worker-cached
 *  bundles still call that one and `if (started)` on an object is always
 *  true. `serverNow` lets the client measure clock skew. Null (never throws)
 *  for a signed-out or non-member poller. */
export async function getWaitingState(sessionId: string): Promise<{
  startedAt: string | null;
  warmupStartedAt: string | null;
  warmupExerciseId: string | null;
  serverNow: string;
} | null> {
  try {
    const user = await requireUser({ skipProfileUpsert: true });
    await requireSessionMember(sessionId, user.id);
    const row = await prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      select: { startedAt: true, warmupStartedAt: true, warmupExerciseId: true },
    });
    if (!row) return null;
    return {
      startedAt: row.startedAt?.toISOString() ?? null,
      warmupStartedAt: row.warmupStartedAt?.toISOString() ?? null,
      warmupExerciseId: row.warmupExerciseId,
      serverNow: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

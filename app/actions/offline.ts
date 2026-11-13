"use server";

import { prisma } from "@/lib/prisma";
import { requireUserExpecting } from "@/lib/auth";
import { IDENTITY_CHANGED } from "@/lib/expectedUser";
import { requireSampleMember, requireSampleOwner } from "@/lib/sessionAuth";
import { evaluationWriteRefusal, extrinsicWriteAllowed, isSessionExpired } from "@/lib/sessionState";
// NOTE: no assertSessionWritable throw here — a closed or expired session must
// not burn the replay's retry budget. Replay answers with a status instead:
// `replay*` return "closed" (the client keeps the draft as `closed_unsent` and
// says so); the legacy `syncEvaluation` keeps returning "discarded" because
// service-worker-cached bundles still map it to "synced" (S8-05, F-offline-1).
import {
  moduleKeyForFormat,
  tryComputeEvaluationDerived,
  type EvalModuleKey,
} from "@/lib/evaluation";
import { resolvePinnedPayload, shouldPinReference } from "@/lib/referenceRules";
import { writeEvaluationPinAware } from "@/lib/evaluationPinWrite";
import { effectiveClientTs } from "@/lib/offline/clientWrite";
import { isModuleSendable, planLateDraftWrite } from "@/lib/lateContributions";
import { isEvaluationComplete } from "@/lib/closeRules";
import { logInfo } from "@/lib/log";
import { replayOverExisting } from "@/lib/aggregateRefire";

// Conflict-aware replay of an offline evaluation draft, called on reconnect.
// Authorization stays identical to the live path: Prisma scoped by cupperId
// (never a direct Supabase select), so RLS/ownership rules are preserved.
//
// Rules (the spec's `status` enum maps to our `isDraft` boolean):
//   - no existing row            → create (defaults isDraft=true)      → synced
//   - existing isDraft=true      → local wins; overwrite data + scores → synced
//   - existing isDraft=false     → already submitted elsewhere:
//        !force, group           → write nothing                       → conflict
//         force                  → overwrite content, keep submitted   → synced
//        solo (owner's own row)  → overwrite content, keep submitted   → synced
//
// `isDraft`/`submittedAt` are never mutated to a different value here. The
// results view recomputes from raw evaluations, but history and the coffee
// profile read the STORED aggregate (aggregate_scores, trigger-written), so
// replacing a submitted row ends with a guarded no-op write on "isDraft" that
// re-fires the trigger (S8-04, F-offline-7; lib/aggregateRefire.ts).
//
// S8-09: two more RETURNED statuses so a permanent failure is visible instead of
// retried forever (F-offline-4, F-sesiones-5): "gone" = the sample/session no
// longer exists for this user (deleted, removed, membership lost; the auth
// helpers throw one code for both, so they cannot be told apart) and "rejected"
// = the payload is not an object. The client parks both as `orphaned`.
//
// S10 WP8b: "identity_changed" is answered ONLY when a user IS signed in and it
// is a DIFFERENT one than the draft's owner (the same positive finding the live
// writes answer). The client keeps the draft pending exactly as for "pending"
// (no attempt burnt) and also latches the tab. Nobody signed in or an
// unreachable auth lookup stay "pending".
export type ReplayStatus =
  | "synced"
  | "conflict"
  | "closed"
  // S10 WP3a review M3: the sample was revealed on a still-open session. A distinct answer
  // (not "closed") so the client parks it as `revealed_unsent`. Cached bundles cannot call a
  // new build's action ids, so widening the union breaks nobody.
  | "revealed"
  | "pending"
  | "gone"
  | "rejected"
  | "identity_changed";

type OwnerReplayStatus = "synced" | "closed" | "gone" | "rejected" | "pending" | "identity_changed";

// The replay's authentication step. With `expectedUserId` (the user the draft
// was saved for) the guard runs FIRST and without throwing: a DIFFERENT signed-in
// user returns "identity_changed" (S10 WP8b: the caller answers
// "identity_changed"); nobody signed in returns null and the caller answers
// "pending" (the draft stays pending, no attempt is burnt either way).
// Without it this is requireUser() exactly as before.
async function replayUser(expectedUserId: string | undefined) {
  try {
    return await requireUserExpecting(expectedUserId, { skipProfileUpsert: true });
  } catch (err) {
    if (expectedUserId !== undefined && err instanceof Error) {
      if (err.message === IDENTITY_CHANGED) return "identity_changed" as const;
      if (err.message === "not_authenticated") return null;
    }
    throw err;
  }
}

function isGone(err: unknown): boolean {
  return err instanceof Error && err.message === "not_found_or_forbidden";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

type EvaluationReplayInput = {
  sessionSampleId: string;
  moduleKey: EvalModuleKey;
  data: Record<string, unknown>;
  cupsPerSample: number;
  force?: boolean;
  // S8-18: ms epoch of the draft's last edit (OfflineModuleData.updatedAt). Optional.
  clientTs?: number;
  /** S10 WP5b review H1: the blob was produced while the sample was the pinned reference. */
  pinnedView?: boolean;
  /** M4 (S10 WP8): the user the draft was saved for. When given and different
   *  from the signed-in user, nothing is written and the answer is "pending"
   *  (the draft stays pending, no attempt burnt). Absent = legacy behaviour. */
  expectedUserId?: string;
};

// Shared body of syncEvaluation / replayEvaluation. NOT exported: every export
// of a "use server" file is a public endpoint. Authorization is identical to
// the live path (requireSampleMember below).
async function replayEvaluationCore(input: EvaluationReplayInput): Promise<ReplayStatus> {
  const user = await replayUser(input.expectedUserId);
  if (user === "identity_changed") return "identity_changed";
  if (!user) return "pending";
  // Same authorization as the live upsertEvaluation path: session member only.
  // Also resolves the sample's real sessionId in one round-trip.
  let auth: Awaited<ReturnType<typeof requireSampleMember>>;
  try {
    auth = await requireSampleMember(input.sessionSampleId, user.id);
  } catch (err) {
    if (isGone(err)) return "gone";
    throw err; // anything else is transient: the client retries
  }
  const { sessionId, cupsPerSample, format, referenceSampleId } = auth;

  // The session closed (or its `closesAt` passed) while this draft was offline. Its submitted data
  // stands; a stale local edit can no longer be applied (aggregates and
  // history are final). Report "closed" so the client stops retrying AND keeps
  // the draft visible as unsent, instead of showing it as synced.
  // S10 WP3a (X3): a sample revealed on a still-open session is frozen for
  // ratings too; the draft is kept on the device exactly like the closed case
  // (`closed_unsent`), never an error and never a silent overwrite.
  const refusal = evaluationWriteRefusal(auth);
  if (refusal === "closed") return "closed";
  if (refusal === "revealed") return "revealed";

  // A participant's draft written before the master started a live session
  // (the cup screen normally prevents it): keep it pending on the device, never
  // discard it. The hook maps "pending" to a failed replay without retries.
  if (auth.isGroup && !auth.isAsync && !auth.startedAt && !auth.isOwner) {
    return "pending";
  }

  const existing = await prisma.evaluation.findUnique({
    where: {
      sessionSampleId_cupperId: {
        sessionSampleId: input.sessionSampleId,
        cupperId: user.id,
      },
    },
    select: { id: true, isDraft: true },
  });

  // Group: a submitted row is a conflict unless forced. Solo: one person, no
  // one else's data, so replaying over the owner's own submitted row applies.
  if (
    replayOverExisting({
      existingIsDraft: existing ? existing.isDraft : null,
      force: input.force === true,
      isGroup: auth.isGroup,
    }) === "conflict"
  ) {
    return "conflict";
  }

  if (!isPlainObject(input.data)) return "rejected";

  // moduleKey / cupsPerSample come from the session row, never the client —
  // identical to the live upsertEvaluation path (input fields kept for API
  // compatibility with queued offline blobs).
  // Same reference pin as the live path (lib/referenceRules.ts).
  const moduleKey = moduleKeyForFormat(format);
  // B1: the pin applies only in "anchor" mode.
  const pinsThisSample = shouldPinReference({
    mode: auth.referenceMode,
    moduleKey,
    isActiveReference: referenceSampleId === input.sessionSampleId,
  });
  // A thrown invalid_input would make useOfflineSync retry and leave the draft
  // pending forever (S8-10). Out-of-bounds data is reachable only with a
  // tampered or legacy blob and can never become valid: report the
  // non-retryable "rejected" (S8-09 replay contract).
  // S10 WP5b (B2 + review H1): the pinned write is decided inside the write's own
  // transaction against the session's CURRENT reference (lib/evaluationPinWrite.ts);
  // a blob that does not know the stash can never set or drop it.
  let saved: { id: string; applied: boolean };
  try {
    saved = await writeEvaluationPinAware({
      sessionSampleId: input.sessionSampleId,
      sessionId,
      cupperId: user.id,
      moduleKey,
      cupsPerSample,
      posted: input.data,
      pinnedView: input.pinnedView === true,
      pinnedAtAuth: pinsThisSample,
      clientTs: input.clientTs,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "invalid_input") return "rejected";
    throw e;
  }

  // S8-18 (F-offline-2): a newer write already won. The server holds newer data
  // than this draft, so the answer is "synced" (the client's own `ifUpdatedAt`
  // guard keeps a newer LOCAL edit pending). Nothing changed: no re-fire.
  if (!saved.applied) {
    logInfo({
      where: "replayEvaluation.staleClientWrite",
      userId: user.id,
      sessionId,
      evaluationId: saved.id,
    });
    return "synced";
  }

  // S8-04 (F-offline-7): the re-fire for a replaced submitted row runs inside
  // writeEvaluationOrdered, atomically with the data write (S8-22 B-01).

  return "synced";
}

/** Legacy contract kept for cached client bundles: a closed or expired session
 *  answers "discarded". New code calls replayEvaluation. */
export async function syncEvaluation(
  input: EvaluationReplayInput,
): Promise<{ status: "synced" | "conflict" | "discarded" | "pending" }> {
  const status = await replayEvaluationCore(input);
  // Cached bundles only know synced|conflict|discarded|pending and retry on a
  // throw, so the new permanent outcomes surface as the codes they used to.
  if (status === "gone") throw new Error("not_found_or_forbidden");
  if (status === "rejected") throw new Error("invalid_input");
  // Cached bundles do not know `identity_changed`: for them it is "pending".
  if (status === "identity_changed") return { status: "pending" };
  return { status: status === "closed" || status === "revealed" ? "discarded" : status };
}

/** Offline replay of an evaluation module. A closed or expired session returns
 *  "closed" and writes nothing; the client keeps the draft (`closed_unsent`)
 *  and tells the cupper, instead of showing it as synced. */
export async function replayEvaluation(
  input: EvaluationReplayInput,
): Promise<{ status: ReplayStatus }> {
  return { status: await replayEvaluationCore(input) };
}

// ─── C1c (S10 WP4b, Kim C1): a complete note left only on the device ─────────
// `TODO(kim-validar:C1)`. The session closed before this module reached the
// server. The cupper may send it to the owner, who decides whether to include it
// (acceptLateEvaluation). SANCTIONED post-close write, and it writes a DRAFT row
// only: it never sets isDraft = false, submittedAt or acceptedLateAt, so the
// aggregate trigger never runs and no score changes until the owner accepts.
//
// Answers a status like the replay actions and never throws for an expected case:
//   synced        the draft is on the server (created, updated, or the server already
//                 held newer data of the same draft)
//   conflict      nothing is written: either a SUBMITTED row exists (reason "submitted") or the
//                 server already held a draft of this sample when the session closed (reason
//                 "saved_before_close": the organizer can accept THAT version)
//   pending       not sent: nobody signed in, or the session is not closed (an open or
//                 merely expired session takes the normal replay)
//   gone          the sample or membership no longer exists
//   rejected      not a group session, not a plain object, not complete, or invalid data
//   identity_changed  a different user is signed in (shared device)
// Everything is derived from the session row (format, cups, reference pin), never
// from the client.
export type LateDraftStatus = "synced" | "conflict" | "pending" | "gone" | "rejected" | "identity_changed";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

export async function submitLateDraft(input: {
  sessionSampleId: string;
  /** Ignored (kept so the client can name the module it holds): the column comes from the session's format. */
  moduleKey: EvalModuleKey;
  data: Record<string, unknown>;
  /** ms epoch of the draft's last edit on the device. */
  clientTs?: number;
  /** S10 WP5b: the blob was produced while the sample was the pinned reference (same meaning as in the replay). */
  pinnedView?: boolean;
  expectedUserId?: string;
}): Promise<{ status: LateDraftStatus; reason?: "submitted" | "saved_before_close" }> {
  const user = await replayUser(input.expectedUserId);
  if (user === "identity_changed") return { status: "identity_changed" };
  if (!user) return { status: "pending" };

  let auth: Awaited<ReturnType<typeof requireSampleMember>>;
  try {
    auth = await requireSampleMember(input.sessionSampleId, user.id);
  } catch (err) {
    if (isGone(err)) return { status: "gone" };
    throw err;
  }
  // CLOSED (status), not merely expired: only then does the owner's acceptance exist.
  if (auth.status !== "closed") return { status: "pending" };
  if (!auth.isGroup) return { status: "rejected" };
  if (!isPlainObject(input.data)) return { status: "rejected" };

  const moduleKey = moduleKeyForFormat(auth.format);
  // The device copy must be COMPLETE by the rule the owner's panel and the submit
  // path use; an incomplete one keeps today's options (read, copy, discard).
  if (!isModuleSendable(moduleKey, input.data)) return { status: "rejected" };

  const key = { sessionSampleId_cupperId: { sessionSampleId: input.sessionSampleId, cupperId: user.id } };
  const ts = effectiveClientTs(input.clientTs, Date.now());
  const stamp = ts === undefined ? undefined : new Date(ts);
  type Outcome = { status: LateDraftStatus; reason?: "submitted" | "saved_before_close" };

  // ONE transaction, in the lock order of lib/sessionLock.ts: the session row first (shared), then
  // the cupper's evaluation row. The pin decision is the shared one (resolvePinnedPayload, the same
  // function lib/evaluationPinWrite.ts uses for every live and replayed write): judged against the
  // session's CURRENT reference, a client `ref_previo` is never accepted, a pinned reference gets
  // its stash carried or created, and a module produced under a pin the sample no longer has keeps
  // the STORED values for the pin-overwritten keys. It writes a DRAFT only.
  const once = (): Promise<Outcome> =>
    prisma.$transaction(
      async (tx): Promise<Outcome> => {
        await tx.$queryRaw`SELECT 1 FROM cupping_sessions WHERE id = ${auth.sessionId} FOR SHARE`;
        const sess = await tx.cuppingSession.findUniqueOrThrow({
          where: { id: auth.sessionId },
          select: { status: true, referenceSampleId: true, referenceMode: true },
        });
        if (sess.status !== "closed") return { status: "pending" };
        await tx.$queryRaw`SELECT id FROM evaluations WHERE "sessionSampleId" = ${input.sessionSampleId} AND "cupperId" = ${user.id} FOR UPDATE`;
        const row = await tx.evaluation.findUnique({
          where: key,
          select: {
            id: true,
            isDraft: true,
            lastClientWriteAt: true,
            receivedLateAt: true,
            descriptiveData: true,
            affectiveData: true,
            combinedData: true,
          },
        });
        // `complete` = the stored module is COMPLETE for the session's format: the only kind of
        // pre-close draft the organizer could have been shown (planLateDraftWrite).
        const existing = row
          ? {
              isDraft: row.isDraft,
              lastClientWriteAt: row.lastClientWriteAt,
              receivedLateAt: row.receivedLateAt,
              complete: isEvaluationComplete({ cupperId: user.id, ...row }, auth.format),
            }
          : null;
        const plan = planLateDraftWrite({ existing, clientTs: input.clientTs });
        if (plan === "conflict") {
          return { status: "conflict", reason: existing && !existing.isDraft ? "submitted" : "saved_before_close" };
        }
        if (plan === "stale") return { status: "synced" };

        const raw = moduleKey === "affective" ? row?.affectiveData : moduleKey === "combined" ? row?.combinedData : null;
        const storedModule =
          raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
        const { data, refStash } = resolvePinnedPayload({
          pinsNow: shouldPinReference({
            mode: sess.referenceMode,
            moduleKey,
            isActiveReference: sess.referenceSampleId === input.sessionSampleId,
          }),
          pinnedView: input.pinnedView === true,
          moduleKey,
          posted: input.data,
          stored: storedModule,
          cupsPerSample: auth.cupsPerSample,
        });
        const fields = tryComputeEvaluationDerived(moduleKey, data, auth.cupsPerSample, { refStash });
        if (!fields) return { status: "rejected" };

        if (!row) {
          await tx.evaluation.create({
            data: {
              sessionSampleId: input.sessionSampleId,
              sessionId: auth.sessionId,
              cupperId: user.id,
              ...fields,
              // The server's own record that this content arrived after the close.
              receivedLateAt: new Date(),
              ...(stamp ? { lastClientWriteAt: stamp } : {}),
            },
            select: { id: true },
          });
        } else {
          // Never isDraft / submittedAt / acceptedLateAt; the row is locked, still guarded on isDraft.
          const res = await tx.evaluation.updateMany({
            where: { id: row.id, isDraft: true },
            data: {
              sessionId: auth.sessionId,
              ...fields,
              receivedLateAt: new Date(),
              ...(stamp ? { lastClientWriteAt: stamp } : {}),
            },
          });
          if (res.count !== 1) return { status: "conflict", reason: "submitted" };
        }
        return { status: "synced" };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

  try {
    return await once();
  } catch (e) {
    // Two first sends racing: the loser hit the unique key (this aborted its transaction); run once more, it finds the row.
    if (isUniqueViolation(e)) return once();
    throw e;
  }
}

/** Owner-only physical module replay. Returns a status instead of throwing for
 *  a closed session (a thrown code reaches the browser as an opaque digest). */
export async function replayPhysical(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
  expectedUserId?: string;
}): Promise<{ status: OwnerReplayStatus }> {
  const user = await replayUser(input.expectedUserId);
  if (user === "identity_changed") return { status: "identity_changed" };
  if (!user) return { status: "pending" };
  let auth: Awaited<ReturnType<typeof requireSampleOwner>>;
  try {
    auth = await requireSampleOwner(input.sessionSampleId, user.id);
  } catch (err) {
    if (isGone(err)) return { status: "gone" };
    throw err;
  }
  if (isSessionExpired(auth)) return { status: "closed" };
  if (!isPlainObject(input.data)) return { status: "rejected" };
  await prisma.physicalEvaluation.upsert({
    where: { sessionSampleId: input.sessionSampleId },
    create: {
      sessionSampleId: input.sessionSampleId,
      evaluatedBy: user.id,
      data: input.data as never,
    },
    update: { data: input.data as never },
  });
  return { status: "synced" };
}

/** Owner-only extrinsic module replay; same contract as replayPhysical. */
export async function replayExtrinsic(input: {
  sessionSampleId: string;
  data: Record<string, unknown>;
  expectedUserId?: string;
}): Promise<{ status: OwnerReplayStatus }> {
  const user = await replayUser(input.expectedUserId);
  if (user === "identity_changed") return { status: "identity_changed" };
  if (!user) return { status: "pending" };
  let auth: Awaited<ReturnType<typeof requireSampleOwner>>;
  try {
    auth = await requireSampleOwner(input.sessionSampleId, user.id);
  } catch (err) {
    if (isGone(err)) return { status: "gone" };
    throw err;
  }
  // Same post-close rule as the live upsertExtrinsic (S8-12, F-resultados-4):
  // after close the owner may still write origin data on a REVEALED sample
  // (stamped `editedAt`); anything else is the terminal "closed" outcome.
  const over = isSessionExpired(auth);
  if (over) {
    const sample = await prisma.sessionSample.findUnique({
      where: { id: input.sessionSampleId },
      select: { revealed: true },
    });
    if (!extrinsicWriteAllowed({ over, revealed: sample?.revealed === true })) {
      return { status: "closed" };
    }
  }
  if (!isPlainObject(input.data)) return { status: "rejected" };
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
  return { status: "synced" };
}

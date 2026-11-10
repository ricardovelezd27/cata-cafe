import "server-only";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { needsAggregateRefire, resolveEvalConflicts } from "@/lib/guestClaimToken";

/**
 * Guest → account "claim": ties a walk-up guest's tasting data to the account
 * they create (or already have) through the NORMAL login flow.
 *
 * A guest is an anonymous Supabase user. Signing in with a magic link or
 * Google produces a DIFFERENT user id (new or existing), so the results page
 * mints a signed claim token for the anonymous id before sending the guest
 * to /auth/login?next=/auth/claim?token=…; after sign-in, /auth/claim redeems
 * the token by moving every row the anonymous user owns to the signed-in
 * account and deleting the anonymous user. Same double-opt-in as every other
 * sign-up, and it also covers people who already had an account.
 *
 * The token is stateless (HMAC over {anonymous id, iat, exp}); replay is
 * harmless because the anonymous user no longer exists after the first
 * successful claim, which mergeGuestData checks before touching anything.
 */

export type GuestClaimSummary = {
  displayName: string;
  sessionsParticipated: number;
  sessionsCreated: number;
  evaluations: number;
};

/**
 * What a claim would attach — shown on the confirmation card so the signed-in
 * user can recognise (or reject) a token that isn't theirs. Null when the
 * anonymous profile no longer exists (already claimed).
 */
export async function getGuestClaimSummary(anonymousUserId: string): Promise<GuestClaimSummary | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: anonymousUserId },
    select: {
      displayName: true,
      _count: { select: { participants: true, cuppingSessions: true, evaluations: true } },
    },
  });
  if (!profile) return null;
  return {
    displayName: profile.displayName,
    sessionsParticipated: profile._count.participants,
    sessionsCreated: profile._count.cuppingSessions,
    evaluations: profile._count.evaluations,
  };
}

export type MergeResult =
  | { ok: true; movedEvaluations: number; movedSessions: number }
  // lookup_failed = the auth service could not answer (retryable); not_anonymous
  // = the guest is gone or was never one (final). They used to be one code, so a
  // blip read as "already claimed" (F-guest-8).
  | { ok: false; error: "not_anonymous" | "same_user" | "lookup_failed" };

/** One claim can touch many rows; the default 5 s interactive-transaction
 *  timeout is too tight for a guest with a long history. */
const MERGE_TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

/**
 * Moves everything the anonymous user owns to `targetUserId`, then deletes
 * the anonymous profile and auth user. Runs the data move in ONE transaction;
 * the final `profile.delete` doubles as a safety net — any user-referencing
 * row this function forgot to move would violate its FK and roll the whole
 * merge back instead of silently orphaning data.
 *
 * Conflict rules where the target already has the "same" row: for an
 * evaluation of the same sample the SUBMITTED one survives (then the most
 * recent) — a registered cupper who opened the cup page under their account
 * (creating an empty draft) and then cupped as a guest keeps the guest's real
 * scores; for participation / history / shares the target's row wins. Every
 * touched session gets its aggregates recomputed inside the same transaction.
 */
export async function mergeGuestData(
  anonymousUserId: string,
  targetUserId: string,
  claimIssuedAt: Date,
): Promise<MergeResult> {
  if (anonymousUserId === targetUserId) return { ok: false, error: "same_user" };

  // Only ever absorb a user that is STILL anonymous — a replayed token after a
  // successful claim (user gone) or a token forged for a real account both
  // stop here.
  const admin = createAdminClient();
  const { data: anonLookup, error: lookupError } = await admin.auth.admin.getUserById(anonymousUserId);
  if (lookupError) {
    const gone = lookupError.status === 404 || lookupError.code === "user_not_found";
    return { ok: false, error: gone ? "not_anonymous" : "lookup_failed" };
  }
  if (!anonLookup?.user || anonLookup.user.is_anonymous !== true) {
    return { ok: false, error: "not_anonymous" };
  }

  const anon = anonymousUserId;
  const target = targetUserId;

  const outcome = await prisma.$transaction(async (tx) => {
    const anonProfile = await tx.profile.findUnique({
      where: { id: anon },
      select: { displayName: true },
    });

    // ── Evaluations (unique per sample+cupper) ─────────────────────────────
    const evalSelect = {
      id: true,
      sessionSampleId: true,
      isDraft: true,
      submittedAt: true,
      updatedAt: true,
      sessionSample: { select: { sessionId: true } },
    } as const;
    const anonEvals = await tx.evaluation.findMany({ where: { cupperId: anon }, select: evalSelect });
    const targetEvals = await tx.evaluation.findMany({
      where: { cupperId: target, sessionSampleId: { in: anonEvals.map((e) => e.sessionSampleId) } },
      select: evalSelect,
    });
    // Sessions whose stored aggregate may now be wrong: a conflict deletes one
    // evaluation, and a merged exclusion flag changes who the trigger counts.
    // Plain moves (cupperId only) change nothing the trigger reads (F-guest-6).
    const refireSessions = new Set<string>();
    const targetBySample = new Map(targetEvals.map((e) => [e.sessionSampleId, e]));
    const conflictSamples: string[] = [];
    const pairs: { anon: (typeof anonEvals)[number]; target: (typeof anonEvals)[number] }[] = [];
    for (const a of anonEvals) {
      const t = targetBySample.get(a.sessionSampleId);
      if (!t) continue;
      conflictSamples.push(a.sessionSampleId);
      refireSessions.add(a.sessionSample.sessionId);
      pairs.push({ anon: a, target: t });
    }
    const { deleteIds, accountLoserIds } = resolveEvalConflicts(pairs);
    if (accountLoserIds.length > 0) {
      // S8-16: the guest's label-only row for the sample moves over below, so
      // the account's label-only row for its replaced evaluation must go (by
      // evaluation id, BEFORE the evaluation delete SetNulls the link).
      await tx.userCoffeeHistory.deleteMany({
        where: { userId: target, coffeeId: null, evaluationId: { in: accountLoserIds } },
      });
    }
    if (deleteIds.length > 0) {
      // user_coffee_history rows pointing at these evaluations get
      // evaluationId = NULL (SetNull); the per-(coffee, session) dedupe
      // below removes the duplicate history row itself.
      await tx.evaluation.deleteMany({ where: { id: { in: deleteIds } } });
    }
    const movedEvals = await tx.evaluation.updateMany({
      where: { cupperId: anon },
      data: { cupperId: target },
    });

    // ── Coffee history (unique per user+coffee+session) ────────────────────
    const anonHistory = await tx.userCoffeeHistory.findMany({
      where: { userId: anon },
      select: { id: true, coffeeId: true, sessionId: true, evaluationId: true },
    });
    if (anonHistory.length > 0) {
      // Detached rows (sessionId NULL — their session was deleted) can never
      // collide on the (user, coffee, session) unique, so only live sessions
      // need the dedupe lookup.
      const liveSessionIds = anonHistory
        .map((h) => h.sessionId)
        .filter((s): s is string => s !== null);
      const targetHistory =
        liveSessionIds.length > 0
          ? await tx.userCoffeeHistory.findMany({
              where: { userId: target, sessionId: { in: liveSessionIds } },
              select: { coffeeId: true, sessionId: true },
            })
          : [];
      const taken = new Set(targetHistory.map((h) => `${h.coffeeId}|${h.sessionId}`));
      // Label-only rows (coffeeId NULL, S8-16) are per-sample, not per-coffee:
      // the (coffee, session) key would wrongly collapse every sample of a
      // session. Their identity is the evaluation. A live one whose evaluation
      // is gone (the conflict loop above deleted it → SetNull) is the losing
      // side of a conflict, so the target's row for that sample stands.
      const dupIds = anonHistory
        .filter((h) =>
          h.coffeeId === null
            ? h.sessionId !== null && h.evaluationId === null
            : taken.has(`${h.coffeeId}|${h.sessionId}`),
        )
        .map((h) => h.id);
      if (dupIds.length > 0) await tx.userCoffeeHistory.deleteMany({ where: { id: { in: dupIds } } });
      await tx.userCoffeeHistory.updateMany({ where: { userId: anon }, data: { userId: target } });
    }

    // ── Session participation (pk session+user) ────────────────────────────
    const anonParts = await tx.sessionParticipant.findMany({
      where: { userId: anon },
      select: {
        sessionId: true,
        status: true,
        excludedFromResults: true,
        excludedAt: true,
        excludedBy: true,
        exclusionReason: true,
      },
    });
    const anonEvalSessions = new Set(anonEvals.map((e) => e.sessionSample.sessionId));
    const targetParts = await tx.sessionParticipant.findMany({
      where: {
        userId: target,
        sessionId: { in: [...new Set([...anonParts.map((p) => p.sessionId), ...anonEvalSessions])] },
      },
      select: { sessionId: true, excludedFromResults: true },
    });
    const targetPartBySession = new Map(targetParts.map((p) => [p.sessionId, p]));
    const anonPartBySession = new Map(anonParts.map((p) => [p.sessionId, p]));
    // Moved guest evaluations change who the trigger counts whenever the
    // surviving exclusion flag differs from the one they were counted under,
    // including a guest with no participant row (or a non-excluded one) whose
    // evaluations land on an EXCLUDED account.
    for (const sessionId of new Set([...anonPartBySession.keys(), ...anonEvalSessions])) {
      const g = anonPartBySession.get(sessionId);
      const t = targetPartBySession.get(sessionId);
      if (
        needsAggregateRefire({
          guestExcluded: g?.excludedFromResults ?? false,
          guestHadRow: !!g,
          accountExcluded: t?.excludedFromResults ?? false,
          accountHadRow: !!t,
          guestHasEvaluations: anonEvalSessions.has(sessionId),
        })
      ) {
        refireSessions.add(sessionId);
      }
    }
    for (const p of anonParts) {
      const existing = targetPartBySession.get(p.sessionId);
      if (!existing) continue;
      // Both identities joined the same session: keep the target's row, but
      // an "owner" status must follow the session (createdBy moves below) and
      // an exclusion the master applied to EITHER identity must survive —
      // the aggregate trigger reads the flag off the surviving row. When only
      // the guest row was excluded, its S8-12 trail (who/when/why) comes along
      // with the flag; an excluded account row keeps its own trail.
      const carryGuestTrail = !existing.excludedFromResults && p.excludedFromResults;
      await tx.sessionParticipant.update({
        where: { sessionId_userId: { sessionId: p.sessionId, userId: target } },
        data: {
          ...(p.status === "owner" ? { status: "owner" } : {}),
          excludedFromResults: existing.excludedFromResults || p.excludedFromResults,
          ...(carryGuestTrail
            ? {
                excludedAt: p.excludedAt,
                excludedBy: p.excludedBy,
                exclusionReason: p.exclusionReason,
              }
            : {}),
        },
      });
      await tx.sessionParticipant.delete({
        where: { sessionId_userId: { sessionId: p.sessionId, userId: anon } },
      });
    }
    await tx.sessionParticipant.updateMany({ where: { userId: anon }, data: { userId: target } });

    // ── Coffee shares (pk coffee+user) ─────────────────────────────────────
    const anonShares = await tx.coffeeShare.findMany({ where: { userId: anon }, select: { coffeeId: true } });
    if (anonShares.length > 0) {
      const targetShares = await tx.coffeeShare.findMany({
        where: { userId: target, coffeeId: { in: anonShares.map((s) => s.coffeeId) } },
        select: { coffeeId: true },
      });
      const takenCoffees = targetShares.map((s) => s.coffeeId);
      if (takenCoffees.length > 0) {
        await tx.coffeeShare.deleteMany({ where: { userId: anon, coffeeId: { in: takenCoffees } } });
      }
      await tx.coffeeShare.updateMany({ where: { userId: anon }, data: { userId: target } });
    }

    // ── Plain ownership columns (no per-user uniqueness) ───────────────────
    const movedSessions = await tx.cuppingSession.updateMany({
      where: { createdBy: anon },
      data: { createdBy: target },
    });
    await tx.coffee.updateMany({ where: { createdBy: anon }, data: { createdBy: target } });
    await tx.physicalEvaluation.updateMany({ where: { evaluatedBy: anon }, data: { evaluatedBy: target } });
    await tx.extrinsicData.updateMany({ where: { revealedBy: anon }, data: { revealedBy: target } });
    await tx.sessionInvite.updateMany({ where: { createdBy: anon }, data: { createdBy: target } });
    await tx.coffeeInvite.updateMany({ where: { createdBy: anon }, data: { createdBy: target } });
    await tx.savedInsight.updateMany({ where: { createdBy: anon }, data: { createdBy: target } });
    await tx.tastingGroup.updateMany({ where: { createdBy: anon }, data: { createdBy: target } });
    await tx.tastingGroupMember.updateMany({ where: { userId: anon }, data: { userId: target } });
    await tx.groupPost.updateMany({ where: { authorId: anon }, data: { authorId: target } });

    // ── Bare user columns (no FK, so the profile delete would not catch them) ─
    // See lib/accountDeletion/manifest.ts; tests/profileRelations.test.ts
    // fails if one of these is dropped.
    const anonUsage = await tx.aiChatUsage.findMany({ where: { userId: anon } });
    for (const u of anonUsage) {
      const existing = await tx.aiChatUsage.findUnique({
        where: { userId_day: { userId: target, day: u.day } },
      });
      if (existing) {
        await tx.aiChatUsage.update({
          where: { id: existing.id },
          data: {
            questionCount: { increment: u.questionCount },
            modelCalls: { increment: u.modelCalls },
            promptTokens: { increment: u.promptTokens },
            outputTokens: { increment: u.outputTokens },
          },
        });
        await tx.aiChatUsage.delete({ where: { id: u.id } });
      } else {
        await tx.aiChatUsage.update({ where: { id: u.id }, data: { userId: target } });
      }
    }
    // Throttle history follows the person (actorKey is "u_<userId>", S8-03).
    await tx.outboundEmailEvent.updateMany({
      where: { actorKey: `u_${anon}` },
      data: { actorKey: `u_${target}` },
    });
    // A guest has no address, so every row is "skipped": the account must not
    // inherit a ledger that would suppress its own close email.
    await tx.closeEmailDelivery.deleteMany({ where: { userId: anon } });
    // Same for the deadline-reminder ledger (S8-05): the guest's rows only say
    // "no address", and keeping them would stop the account being reminded.
    await tx.sessionReminderDelivery.deleteMany({ where: { userId: anon } });

    // ── Profile ────────────────────────────────────────────────────────────
    // A brand-new account (created by this very sign-in, i.e. after the claim
    // was minted) only has the trigger's email-prefix fallback as its name —
    // carry over the name the guest typed at the QR join instead.
    const targetProfile = await tx.profile.findUnique({
      where: { id: target },
      select: { createdAt: true },
    });
    if (targetProfile && targetProfile.createdAt >= claimIssuedAt && anonProfile?.displayName) {
      await tx.profile.update({
        where: { id: target },
        // The name came from the guest, so the welcome modal has nothing left
        // to ask: the post-claim landing must not be replaced by it (S8-06,
        // F-guest-7).
        data: { displayName: anonProfile.displayName, onboardingCompleted: true },
      });
    }
    if (anonProfile) {
      // Safety net: throws (→ rollback) if any user-referencing row was missed.
      await tx.profile.delete({ where: { id: anon } });
    }

    // ── Aggregates ─────────────────────────────────────────────────────────
    // The aggregate trigger only fires on INSERT / UPDATE OF isDraft, so
    // re-fire it ONLY where something it reads changed (conflicted samples and
    // sessions whose exclusion flag was merged) with the same no-op SET as
    // refreshAggregateScores — inside this transaction, so a crash can never
    // leave stale aggregates behind. A sample whose surviving evaluation is a
    // draft has nothing to fire on; its aggregate would still describe the
    // deleted submission, so drop it (the results page treats a missing
    // aggregate as "pending").
    if (conflictSamples.length > 0) {
      await tx.evaluation.updateMany({
        where: { sessionSampleId: { in: conflictSamples }, isDraft: false },
        data: { isDraft: false },
      });
    }
    if (refireSessions.size > 0) {
      await tx.evaluation.updateMany({
        where: { sessionSample: { sessionId: { in: [...refireSessions] } }, isDraft: false },
        data: { isDraft: false },
      });
    }
    for (const sampleId of new Set(conflictSamples)) {
      const submitted = await tx.evaluation.count({ where: { sessionSampleId: sampleId, isDraft: false } });
      if (submitted === 0) await tx.aggregateScore.deleteMany({ where: { sessionSampleId: sampleId } });
    }

    return { movedEvaluations: movedEvals.count, movedSessions: movedSessions.count };
  }, MERGE_TX_OPTIONS);

  // Best effort — the profile and every row are already gone/moved; a
  // lingering auth user with no data is harmless.
  try {
    await admin.auth.admin.deleteUser(anon);
  } catch {
    // ignore
  }

  return { ok: true, movedEvaluations: outcome.movedEvaluations, movedSessions: outcome.movedSessions };
}

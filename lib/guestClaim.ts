import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

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

// Long on purpose: the token only travels in the guest's own URL/email, the
// merge is gated by an explicit confirmation AND the source still being an
// anonymous user, and a magic link re-sent days later must still redeem it.
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ClaimPayload = { a: string; iat: number; exp: number };

function claimSecret(): string {
  const secret = process.env.GUEST_CLAIM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("guest_claim_secret_missing");
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", claimSecret()).update(payloadB64).digest("base64url");
}

export function mintGuestClaimToken(anonymousUserId: string, now = Date.now()): string {
  const payload: ClaimPayload = { a: anonymousUserId, iat: now, exp: now + CLAIM_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifiedClaim = { anonymousUserId: string; issuedAt: Date; expired: boolean };

/** Null for a malformed or tampered token; `expired: true` for a genuine but stale one. */
export function verifyGuestClaimToken(token: string, now = Date.now()): VerifiedClaim | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: ClaimPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ClaimPayload;
  } catch {
    return null;
  }
  if (typeof payload.a !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return null;
  }
  return { anonymousUserId: payload.a, issuedAt: new Date(payload.iat), expired: now > payload.exp };
}

/** Only ever bounce back into the app on this origin. */
export function safeClaimBack(locale: string, back: string | undefined): string {
  const loc = locale === "en" ? "en" : "es";
  return back && back.startsWith(`/${loc}/app/`) ? back : `/${loc}/app`;
}

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
  | { ok: false; error: "not_anonymous" | "same_user" };

type EvalRow = {
  id: string;
  sessionSampleId: string;
  isDraft: boolean;
  submittedAt: Date | null;
  updatedAt: Date;
};

/** Which of two evaluations of the same sample survives a merge: a submitted
 * one beats a draft; among equals, the most recent. */
function anonEvalWins(anonRow: EvalRow, targetRow: EvalRow): boolean {
  if (anonRow.isDraft !== targetRow.isDraft) return !anonRow.isDraft;
  const a = (anonRow.submittedAt ?? anonRow.updatedAt).getTime();
  const b = (targetRow.submittedAt ?? targetRow.updatedAt).getTime();
  return a > b;
}

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
  if (lookupError || !anonLookup?.user || anonLookup.user.is_anonymous !== true) {
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
    const touchedSessions = new Set<string>(anonEvals.map((e) => e.sessionSample.sessionId));
    const targetBySample = new Map(targetEvals.map((e) => [e.sessionSampleId, e]));
    const conflictSamples: string[] = [];
    const deleteIds: string[] = [];
    for (const a of anonEvals) {
      const t = targetBySample.get(a.sessionSampleId);
      if (!t) continue;
      conflictSamples.push(a.sessionSampleId);
      deleteIds.push(anonEvalWins(a, t) ? t.id : a.id);
    }
    if (deleteIds.length > 0) {
      // user_coffee_history rows pointing at these evaluations cascade away.
      await tx.evaluation.deleteMany({ where: { id: { in: deleteIds } } });
    }
    const movedEvals = await tx.evaluation.updateMany({
      where: { cupperId: anon },
      data: { cupperId: target },
    });

    // ── Coffee history (unique per user+coffee+session) ────────────────────
    const anonHistory = await tx.userCoffeeHistory.findMany({
      where: { userId: anon },
      select: { id: true, coffeeId: true, sessionId: true },
    });
    if (anonHistory.length > 0) {
      const targetHistory = await tx.userCoffeeHistory.findMany({
        where: { userId: target, sessionId: { in: anonHistory.map((h) => h.sessionId) } },
        select: { coffeeId: true, sessionId: true },
      });
      const taken = new Set(targetHistory.map((h) => `${h.coffeeId}|${h.sessionId}`));
      const dupIds = anonHistory.filter((h) => taken.has(`${h.coffeeId}|${h.sessionId}`)).map((h) => h.id);
      if (dupIds.length > 0) await tx.userCoffeeHistory.deleteMany({ where: { id: { in: dupIds } } });
      await tx.userCoffeeHistory.updateMany({ where: { userId: anon }, data: { userId: target } });
    }

    // ── Session participation (pk session+user) ────────────────────────────
    const anonParts = await tx.sessionParticipant.findMany({
      where: { userId: anon },
      select: { sessionId: true, status: true, excludedFromResults: true },
    });
    const targetParts = await tx.sessionParticipant.findMany({
      where: { userId: target, sessionId: { in: anonParts.map((p) => p.sessionId) } },
      select: { sessionId: true, excludedFromResults: true },
    });
    const targetPartBySession = new Map(targetParts.map((p) => [p.sessionId, p]));
    for (const p of anonParts) touchedSessions.add(p.sessionId);
    for (const p of anonParts) {
      const existing = targetPartBySession.get(p.sessionId);
      if (!existing) continue;
      // Both identities joined the same session: keep the target's row, but
      // an "owner" status must follow the session (createdBy moves below) and
      // an exclusion the master applied to EITHER identity must survive —
      // the aggregate trigger reads the flag off the surviving row.
      await tx.sessionParticipant.update({
        where: { sessionId_userId: { sessionId: p.sessionId, userId: target } },
        data: {
          ...(p.status === "owner" ? { status: "owner" } : {}),
          excludedFromResults: existing.excludedFromResults || p.excludedFromResults,
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
        data: { displayName: anonProfile.displayName },
      });
    }
    if (anonProfile) {
      // Safety net: throws (→ rollback) if any user-referencing row was missed.
      await tx.profile.delete({ where: { id: anon } });
    }

    // ── Aggregates ─────────────────────────────────────────────────────────
    // The aggregate trigger only fires on INSERT / UPDATE OF isDraft, so
    // re-fire it for every touched session with the same no-op update trick
    // as refreshAggregateScores (app/actions/community.ts) — inside this
    // transaction, so a crash can never leave stale aggregates behind. A
    // sample whose surviving evaluation is a draft has nothing to fire on;
    // its aggregate would still describe the deleted submission, so drop it
    // (the results page treats a missing aggregate as "pending").
    for (const sessionId of touchedSessions) {
      await tx.$executeRaw`
        UPDATE evaluations e
        SET "isDraft" = e."isDraft"
        FROM session_samples ss
        WHERE e."sessionSampleId" = ss.id
          AND ss."sessionId" = ${sessionId}
          AND e."isDraft" = false
      `;
    }
    for (const sampleId of new Set(conflictSamples)) {
      const submitted = await tx.evaluation.count({ where: { sessionSampleId: sampleId, isDraft: false } });
      if (submitted === 0) await tx.aggregateScore.deleteMany({ where: { sessionSampleId: sampleId } });
    }

    return { movedEvaluations: movedEvals.count, movedSessions: movedSessions.count };
  });

  // Best effort — the profile and every row are already gone/moved; a
  // lingering auth user with no data is harmless.
  try {
    await admin.auth.admin.deleteUser(anon);
  } catch {
    // ignore
  }

  return { ok: true, movedEvaluations: outcome.movedEvaluations, movedSessions: outcome.movedSessions };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeSessionInternal } from "@/lib/closeSession";
import { detachCoffeeHistoryForSession } from "@/lib/coffeeHistory";
import { anonymizeOwnedCoffees } from "@/lib/coffees/anonymize";
import { loadDeletionFixture } from "@/lib/accountDeletion/load";
import { planAccountDeletion } from "@/lib/accountDeletion/plan";
import { deletedProfileId, DELETED_PROFILE_STORED_NAME } from "@/lib/accountDeletion/deletedProfile";
import { errorMessage, logError, logInfo, logWarn } from "@/lib/log";

/**
 * Account deletion (S8-19, F-cuenta-1), E3 default (a): the people the person
 * cupped with keep their results, without the person's name. Follows
 * lib/accountDeletion/manifest.ts rule by rule; tests/profileRelations.test.ts
 * asserts every manifest table has a statement here (`tx.<delegate>.`).
 *
 * NEVER RUN against production by a session: it has only been exercised on a
 * throwaway account in a non-production environment (runbook §24).
 *
 * Order:
 *  1. Plan (pure, lib/accountDeletion/plan.ts). The super-admin is refused.
 *  2. Close the live group sessions that are kept for others
 *     (closeSessionInternal, emails skipped): nobody could close them later.
 *  3. ONE transaction: a fresh placeholder profile `deleted_<random>` (one per
 *     deletion, never shared: Evaluation is unique on sample+cupper), then
 *     every relation per the manifest, then `profile.delete` of the real id
 *     LAST and uncaught, so a forgotten Restrict FK rolls everything back.
 *  4. After commit: the Supabase auth user (up to 3 attempts). A failure is
 *     logged with ids only and reported as `authDeleted: false`; the profile
 *     is gone either way and runbook §24 says how to remove the orphan.
 *
 * Callers authorize: `user` must be the signed-in user (app/actions/account.ts).
 */
export type DeleteAccountOutcome = {
  placeholderId: string;
  authDeleted: boolean;
  sessionsDeleted: number;
  sessionsKept: number;
};

const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

export async function deleteAccountData(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
}): Promise<DeleteAccountOutcome> {
  const userId = user.id;
  const plan = planAccountDeletion(await loadDeletionFixture(user));
  if (!plan.ok) throw new Error("account_protected");

  // ── 2. Close kept live sessions first (outside the tx: it has its own
  //    writes, aggregate refire and history sync, and is idempotent). ──────
  for (const sessionId of plan.closeBeforeDelete) {
    await closeSessionInternal(sessionId, { reason: "owner_deleted", emails: "skip" });
  }

  const placeholderId = deletedProfileId(randomUUID());

  await prisma.$transaction(async (tx) => {
    // ── Placeholder ───────────────────────────────────────────────────────
    await tx.profile.create({
      data: {
        id: placeholderId,
        displayName: DELETED_PROFILE_STORED_NAME,
        onboardingCompleted: true,
      },
    });

    // ── CuppingSession.createdBy: delete-if-solo-else-tombstone ────────────
    for (const sessionId of plan.deleteSessionIds) {
      // Re-check under the transaction: someone may have evaluated since the
      // plan was read. Refuse rather than delete their work; a retry re-plans.
      const others = await tx.evaluation.count({
        where: { sessionSample: { sessionId }, cupperId: { not: userId } },
      });
      const row = await tx.cuppingSession.findFirst({
        where: { id: sessionId, createdBy: userId },
        select: { isGroup: true },
      });
      if (!row) continue; // already gone
      if (row.isGroup && others > 0) throw new Error("conflict");
      // The deleteSession path: history detached first, same transaction.
      await detachCoffeeHistoryForSession(tx, sessionId);
      await tx.cuppingSession.delete({ where: { id: sessionId } });
    }
    // Every session still owned is one kept for others (closed in step 2).
    await tx.cuppingSession.updateMany({
      where: { createdBy: userId },
      data: { createdBy: placeholderId },
    });

    // ── SessionParticipant.userId: reassign WITH excludedFromResults and its
    //    trail, so the trigger keeps excluding an excluded cupper and the
    //    participant count does not move. ─────────────────────────────────
    await tx.sessionParticipant.updateMany({
      where: { userId },
      data: { userId: placeholderId },
    });
    // Bare trail column (no FK): who excluded someone, on kept rows.
    await tx.sessionParticipant.updateMany({
      where: { excludedBy: userId },
      data: { excludedBy: placeholderId },
    });

    // ── Evaluation.cupperId: anonymized, not erased. isDraft is not in the
    //    SET, so the aggregate trigger does not re-fire and stored community
    //    scores stay exactly as they were. ────────────────────────────────
    await tx.evaluation.updateMany({
      where: { cupperId: userId },
      data: { cupperId: placeholderId },
    });

    // ── Per-sample authorship on kept rows ────────────────────────────────
    await tx.physicalEvaluation.updateMany({
      where: { evaluatedBy: userId },
      data: { evaluatedBy: placeholderId },
    });
    await tx.extrinsicData.updateMany({
      where: { revealedBy: userId },
      data: { revealedBy: placeholderId },
    });

    // ── Coffee.createdBy: anonymized exactly as deleteCoffees does, then the
    //    row (and every already-anonymized one) moves to the placeholder. ──
    await anonymizeOwnedCoffees(tx, userId);
    await tx.coffee.updateMany({
      where: { createdBy: userId },
      data: { createdBy: placeholderId },
    });
    // CoffeeShare both directions: shares OF their coffees went with the
    // anonymization; shares granted TO them go here.
    await tx.coffeeShare.deleteMany({ where: { userId } });
    await tx.coffeeInvite.deleteMany({ where: { createdBy: userId } });
    // Invite tokens of kept sessions (all closed now) die with their creator.
    await tx.sessionInvite.deleteMany({ where: { createdBy: userId } });

    // ── TastingGroup.createdBy: delete-if-solo-else-tombstone ──────────────
    if (plan.deleteGroupIds.length > 0) {
      await tx.tastingGroup.deleteMany({
        where: { id: { in: plan.deleteGroupIds }, createdBy: userId },
      });
    }
    // TODO(E3-Kim): transfer ownership. Until then a kept group stays
    // readable for its members, but nobody can manage it.
    await tx.tastingGroup.updateMany({
      where: { createdBy: userId },
      data: { createdBy: placeholderId },
    });
    // Posts they wrote in groups that are kept survive without their name.
    await tx.groupPost.updateMany({
      where: { authorId: userId },
      data: { authorId: placeholderId },
    });
    // TastingGroupMember: the FK would null itself but the row keeps the
    // email; their memberships go entirely (GroupEmailDelivery cascades).
    await tx.tastingGroupMember.deleteMany({
      where: plan.waitlistEmail
        ? { OR: [{ userId }, { email: { equals: plan.waitlistEmail, mode: "insensitive" } }] }
        : { userId },
    });

    // ── Erase ─────────────────────────────────────────────────────────────
    await tx.userCoffeeHistory.deleteMany({ where: { userId } });
    await tx.savedInsight.deleteMany({ where: { createdBy: userId } });
    await tx.aiChatUsage.deleteMany({ where: { userId } });
    await tx.outboundEmailEvent.deleteMany({ where: { actorKey: `u_${userId}` } });
    await tx.closeEmailDelivery.deleteMany({ where: { userId } });
    await tx.sessionReminderDelivery.deleteMany({ where: { userId } });
    if (plan.waitlistEmail) {
      await tx.waitlistEntry.deleteMany({ where: { email: plan.waitlistEmail } });
    }

    // ── Last: the profile itself. NOT caught: a Restrict FK this function
    //    forgot fails here and rolls the whole deletion back. ───────────────
    await tx.profile.delete({ where: { id: userId } });
  }, TX_OPTIONS);

  logInfo({
    where: "deleteAccount.committed",
    userId,
    placeholderId,
    sessionsDeleted: plan.deleteSessionIds.length,
    sessionsKept: plan.keepSessionIds.length,
  });

  // ── 4. Auth user, after commit (profiles has no FK to auth.users). ──────
  const authDeleted = await deleteAuthUser(userId);

  return {
    placeholderId,
    authDeleted,
    sessionsDeleted: plan.deleteSessionIds.length,
    sessionsKept: plan.keepSessionIds.length,
  };
}

async function deleteAuthUser(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) return true;
      // Already gone counts as done (a retry after a lost response).
      if (error.status === 404 || error.code === "user_not_found") return true;
      logWarn({ where: "deleteAccount.authUser", userId, attempt, code: error.code ?? String(error.status) });
    } catch (err) {
      logWarn({ where: "deleteAccount.authUser", userId, attempt, message: errorMessage(err) });
    }
  }
  // Ids only. Runbook §24: remove the orphaned auth user by hand.
  logError({ where: "deleteAccount.authUserOrphaned", userId });
  return false;
}

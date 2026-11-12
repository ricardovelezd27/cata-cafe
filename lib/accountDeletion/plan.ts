// What deleteAccount will do, decided as a pure function over what the
// database holds for the person (S8-19, F-cuenta-1). The server loads the
// fixture (lib/accountDeletion/load.ts), this module decides, and the
// transaction (lib/accountDeletion/deleteAccount.ts) follows the plan. The
// confirm dialog shows the same plan's counts, so what the person is told and
// what happens can never drift. Rules: lib/accountDeletion/manifest.ts.
//
// E3 (a): other people keep their results, without the organizer's
// name. This is the one place the session/group split is decided.
//
// Pure (no Prisma, no server-only) so tests/accountDeletion.test.ts covers it.

export type OwnedSessionFact = {
  id: string;
  isGroup: boolean;
  status: string;
  /** Evaluations (drafts included) by anyone other than the person. */
  otherCupperEvaluations: number;
  /** Participant rows of OTHER people who joined (status not "invited":
   *  "joined", "owner" or anything unexpected). Invited-only rows do not
   *  count: nobody has taken part yet. */
  otherJoinedParticipants: number;
};

export type ParticipationFact = {
  sessionId: string;
  excludedFromResults: boolean;
  /** Status of the session the row belongs to. Absent = unknown: the row is
   *  kept (reassigned), never dropped. */
  sessionStatus?: string;
  /** The participant row's own status ("owner" = the person created it). */
  participantStatus?: string;
  /** The person has a SUBMITTED (non-draft) evaluation in that session.
   *  Absent = unknown: the row is kept. */
  hasSubmitted?: boolean;
};

export type OwnedGroupFact = {
  id: string;
  /** Member rows that are not the person (linked or pending by email). */
  otherMembers: number;
};

export type DeletionFixture = {
  userId: string;
  /** Auth email, null for an anonymous guest. */
  email: string | null;
  isAnonymous: boolean;
  /** isSuperAdminEmail(email), computed by the caller. */
  isSuperAdmin: boolean;
  ownedSessions: OwnedSessionFact[];
  participations: ParticipationFact[];
  /** One entry per evaluation the person wrote: the session it belongs to. */
  evaluationSessionIds: string[];
  ownedGroups: OwnedGroupFact[];
  /** Owned coffees not yet anonymized. */
  liveOwnedCoffees: number;
};

export type DeletionPlan =
  | { ok: false; refused: "super_admin" }
  | {
      ok: true;
      /** Active sessions kept for others: closed BEFORE the transaction
       *  (closeSessionInternal, emails skipped), so no session stays open
       *  with nobody able to close it. */
      closeBeforeDelete: string[];
      /** Deleted through the deleteSession path (history detached first). */
      deleteSessionIds: string[];
      /** Kept; createdBy moves to the placeholder. */
      keepSessionIds: string[];
      /** Participant rows that move to the placeholder WITH their exclusion
       *  flag (the trigger reads it off the row). Rows in deleted sessions go
       *  with the session. */
      reassignParticipations: ParticipationFact[];
      /** Sessions (not closed) where the person only took part and submitted
       *  nothing: the participant row and their draft evaluations are deleted
       *  (A-07). */
      dropParticipationSessionIds: string[];
      /** The person's evaluations that stay, anonymized. */
      evaluationsAnonymized: number;
      /** The person's evaluations deleted with their own sessions. */
      evaluationsDeleted: number;
      deleteGroupIds: string[];
      keepGroupIds: string[];
      coffeesAnonymized: number;
      /** Waitlist row to remove (lowercased, as reserveFoundingSeat stores it). */
      waitlistEmail: string | null;
    };

/** A session is the person's alone (and is deleted) when it is solo, or a
 *  group session where nobody else has written an evaluation AND nobody else
 *  has joined (a waiting room or an async session open for joins has people
 *  in it before anyone evaluates; their rows would cascade away unannounced).
 *  Otherwise it is kept for them: closed first, then reassigned. */
export function isOwnSessionDeletable(s: OwnedSessionFact): boolean {
  if (!s.isGroup) return true;
  return s.otherCupperEvaluations === 0 && s.otherJoinedParticipants === 0;
}

/**
 * A-07 (S9-01): a participant row that is dropped instead of reassigned. The
 * placeholder never submits, so keeping it in a session that is still open
 * would freeze the "everyone submitted" rule (results page and SQL
 * can_view_group_results) for the others. Dropped only when ALL hold: the
 * session is known and not closed, the person is a participant (not its
 * owner, not a session they created), and they have no submitted evaluation
 * there. Their draft evaluations go with the row. Anything unknown is kept.
 */
export function isDroppableParticipation(
  p: ParticipationFact,
  ownedSessionIds: ReadonlySet<string>,
): boolean {
  if (ownedSessionIds.has(p.sessionId)) return false;
  if (p.participantStatus === "owner") return false;
  if (p.sessionStatus === undefined || p.sessionStatus === "closed") return false;
  return p.hasSubmitted === false;
}

export function planAccountDeletion(f: DeletionFixture): DeletionPlan {
  // The super-admin account holds the analytics grants; deleting it from the
  // app would lock everyone out of Acceso. It is removed by hand if ever.
  if (f.isSuperAdmin) return { ok: false, refused: "super_admin" };

  const deleteSessionIds: string[] = [];
  const keepSessionIds: string[] = [];
  const closeBeforeDelete: string[] = [];
  for (const s of f.ownedSessions) {
    if (isOwnSessionDeletable(s)) {
      deleteSessionIds.push(s.id);
    } else {
      keepSessionIds.push(s.id);
      if (s.status !== "closed") closeBeforeDelete.push(s.id);
    }
  }
  const deleted = new Set(deleteSessionIds);

  const ownedIds = new Set(f.ownedSessions.map((s) => s.id));
  const dropParticipationSessionIds = f.participations
    .filter((p) => !deleted.has(p.sessionId) && isDroppableParticipation(p, ownedIds))
    .map((p) => p.sessionId);
  const dropped = new Set(dropParticipationSessionIds);
  const reassignParticipations = f.participations.filter(
    (p) => !deleted.has(p.sessionId) && !dropped.has(p.sessionId),
  );
  const evaluationsDeleted = f.evaluationSessionIds.filter(
    (id) => deleted.has(id) || dropped.has(id),
  ).length;

  const deleteGroupIds: string[] = [];
  const keepGroupIds: string[] = [];
  for (const g of f.ownedGroups) {
    // A kept group is left with no one able to manage it (no ownership
    // transfer).
    if (g.otherMembers > 0) keepGroupIds.push(g.id);
    else deleteGroupIds.push(g.id);
  }

  return {
    ok: true,
    closeBeforeDelete,
    deleteSessionIds,
    keepSessionIds,
    reassignParticipations,
    dropParticipationSessionIds,
    evaluationsAnonymized: f.evaluationSessionIds.length - evaluationsDeleted,
    evaluationsDeleted,
    deleteGroupIds,
    keepGroupIds,
    coffeesAnonymized: f.liveOwnedCoffees,
    waitlistEmail: f.email ? normalizeEmail(f.email) : null,
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/**
 * deleteAccount reads the plan BEFORE its transaction (to close kept sessions)
 * and again INSIDE it. Anything that moved in between (a session created, a
 * cupper who joined, a group member added) shows up as a different id set;
 * the transaction then throws `conflict` and rolls back, and the person
 * retries against the fresh plan. Order inside each list does not matter.
 */
export function plansEqual(a: DeletionPlan, b: DeletionPlan): boolean {
  if (!a.ok || !b.ok) return a.ok === b.ok;
  return (
    sameIds(a.deleteSessionIds, b.deleteSessionIds) &&
    sameIds(a.keepSessionIds, b.keepSessionIds) &&
    sameIds(a.dropParticipationSessionIds, b.dropParticipationSessionIds) &&
    sameIds(a.deleteGroupIds, b.deleteGroupIds) &&
    sameIds(a.keepGroupIds, b.keepGroupIds)
  );
}

/** Normalized form an address is compared in: trimmed, lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The rows whose address IS the person's, compared exactly in JS. Every
 * by-email delete in deleteAccount first selects candidates with a
 * case-insensitive filter and then keeps only these: a database
 * case-insensitive match may compile to ILIKE, where `_` and `%` in an address
 * are wildcards (`john_doe@x.com` would also match `johnXdoe@x.com`), and a
 * wildcard hit there deletes ANOTHER person's row.
 */
export function exactEmailMatches<R extends { email: string }>(
  rows: readonly R[],
  email: string | null | undefined,
): R[] {
  if (!email) return [];
  const target = normalizeEmail(email);
  if (target.length === 0) return [];
  return rows.filter((r) => typeof r.email === "string" && normalizeEmail(r.email) === target);
}

/**
 * The most own sessions one deletion may delete. Each runs
 * detachCoffeeHistoryForSession inside ONE transaction (timeout 120 s in
 * deleteAccount.ts); above this the app refuses up front with
 * `account_too_large` and runbook §24 describes the manual path.
 */
export const MAX_SESSIONS_TO_DELETE = 300;

export function exceedsDeletionBound(plan: DeletionPlan): boolean {
  return plan.ok && plan.deleteSessionIds.length > MAX_SESSIONS_TO_DELETE;
}

/** The counts the confirm dialog shows (no ids leave the server). */
export type AccountDeletionImpact = {
  sessionsDeleted: number;
  sessionsKept: number;
  coffeesAnonymized: number;
  groupsDeleted: number;
  groupsKept: number;
  evaluationsAnonymized: number;
  /** The super-admin account cannot be deleted from the app. */
  protected: boolean;
  /** More than MAX_SESSIONS_TO_DELETE: refused, manual path (runbook §24). */
  tooLarge: boolean;
};

export function impactOf(plan: DeletionPlan): AccountDeletionImpact {
  if (!plan.ok) {
    return {
      sessionsDeleted: 0,
      sessionsKept: 0,
      coffeesAnonymized: 0,
      groupsDeleted: 0,
      groupsKept: 0,
      evaluationsAnonymized: 0,
      protected: true,
      tooLarge: false,
    };
  }
  return {
    sessionsDeleted: plan.deleteSessionIds.length,
    sessionsKept: plan.keepSessionIds.length,
    coffeesAnonymized: plan.coffeesAnonymized,
    groupsDeleted: plan.deleteGroupIds.length,
    groupsKept: plan.keepGroupIds.length,
    evaluationsAnonymized: plan.evaluationsAnonymized,
    protected: false,
    tooLarge: exceedsDeletionBound(plan),
  };
}

/** The word the person types to confirm. Checked on the server too. */
export function deleteConfirmationWord(locale: string): string {
  return locale === "en" ? "DELETE" : "ELIMINAR";
}

export function isDeleteConfirmed(typed: unknown, locale: string): boolean {
  return (
    typeof typed === "string" &&
    typed.trim().toUpperCase() === deleteConfirmationWord(locale)
  );
}

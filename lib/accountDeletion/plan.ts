// What deleteAccount will do, decided as a pure function over what the
// database holds for the person (S8-19, F-cuenta-1). The server loads the
// fixture (lib/accountDeletion/load.ts), this module decides, and the
// transaction (lib/accountDeletion/deleteAccount.ts) follows the plan. The
// confirm dialog shows the same plan's counts, so what the person is told and
// what happens can never drift. Rules: lib/accountDeletion/manifest.ts.
//
// E3 default (a): other people keep their results, without the organizer's
// name. TODO(E3-Kim): if Kim picks another E3 option, this is the one place
// the session/group split changes.
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

  const reassignParticipations = f.participations.filter((p) => !deleted.has(p.sessionId));
  const evaluationsDeleted = f.evaluationSessionIds.filter((id) => deleted.has(id)).length;

  const deleteGroupIds: string[] = [];
  const keepGroupIds: string[] = [];
  for (const g of f.ownedGroups) {
    // TODO(E3-Kim): transfer ownership instead of leaving the group with no
    // one able to manage it.
    if (g.otherMembers > 0) keepGroupIds.push(g.id);
    else deleteGroupIds.push(g.id);
  }

  return {
    ok: true,
    closeBeforeDelete,
    deleteSessionIds,
    keepSessionIds,
    reassignParticipations,
    evaluationsAnonymized: f.evaluationSessionIds.length - evaluationsDeleted,
    evaluationsDeleted,
    deleteGroupIds,
    keepGroupIds,
    coffeesAnonymized: f.liveOwnedCoffees,
    waitlistEmail: f.email ? normalizeEmail(f.email) : null,
  };
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


/**
 * S8-28 B-03: the fields a coffee-history upsert refreshes on an existing row.
 * `evaluationId` is included so a row whose link was SetNull (a guest merge
 * deleted the original evaluation) is re-linked to the surviving evaluation
 * instead of staying NULL.
 */
export function coffeeHistoryRefresh(
  evaluation: { id: string; individualScore: number | null },
  communityScore: number | null,
): { evaluationId: string; individualScore: number | null; communityScore: number | null } {
  return {
    evaluationId: evaluation.id,
    individualScore: evaluation.individualScore,
    communityScore,
  };
}

// S8-04 (F-solo-4, F-express-4). Pure rules for what the per-user coffee
// history shows. Dependency-free (tests import it).

/**
 * The community score a history row may carry. The trigger writes
 * communityScore = 0 when no COMPLETE affective evaluation exists (COALESCE to
 * 0), which is what a descriptive-only or incomplete session ends up with:
 * showing "0.00" there is a lie. Only a stored aggregate with at least one
 * included evaluation (participantCount > 0) is a real score.
 */
export function historyCommunityScore(
  aggregate: { communityScore: number | null; participantCount: number } | null | undefined,
): number | null {
  if (!aggregate || aggregate.participantCount <= 0) return null;
  return aggregate.communityScore;
}

/**
 * "Impresion rapida": a session with exactly ONE cup per sample (owner's
 * decision 2026-11-12; it used to mean "under five cups", the old deduction
 * gate). Display-only tag, never changes a score. TODO(kim-validar:A3): ships as
 * option (b) (same score, tagged); option (c) would drop these from the history.
 */
export const QUICK_IMPRESSION_CUPS = 1;

export function historyCupsPerSample(
  session: { cupsPerSample: number } | null | undefined,
  snapshot: { cupsPerSample?: number } | null | undefined,
): number | null {
  if (session) return session.cupsPerSample;
  return typeof snapshot?.cupsPerSample === "number" ? snapshot.cupsPerSample : null;
}

export function isQuickImpression(cupsPerSample: number | null | undefined): boolean {
  return cupsPerSample === QUICK_IMPRESSION_CUPS;
}

/**
 * S8-16: label-only rows (coffeeId NULL) of a LIVE session whose evaluation no
 * longer exists (cupper removed / evaluation deleted → SetNull) describe
 * nothing and are never refreshed, so the sync drops them. Rows whose SESSION
 * was deleted (sessionId NULL, the D8 case) are kept: the session id in this
 * filter is required, so they can never match.
 */
export function orphanLabelRowWhere(sessionId: string): {
  sessionId: string;
  coffeeId: null;
  evaluationId: null;
} {
  return { sessionId, coffeeId: null, evaluationId: null };
}

/**
 * S8-16: split label rows into those that already exist (update) and those to
 * insert. The insert goes through createMany({ skipDuplicates }) (ON CONFLICT
 * DO NOTHING) so a concurrent writer hitting the partial unique index on
 * evaluationId cannot abort the surrounding Postgres transaction.
 */
export function partitionLabelRows<T extends { evaluationId: string }>(
  rows: T[],
  existingEvaluationIds: Set<string>,
): { toInsert: T[]; toUpdate: T[] } {
  const toInsert: T[] = [];
  const toUpdate: T[] = [];
  for (const r of rows) (existingEvaluationIds.has(r.evaluationId) ? toUpdate : toInsert).push(r);
  return { toInsert, toUpdate };
}

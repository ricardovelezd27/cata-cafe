/**
 * Display rules of the coffee page (package S9 of the 2026-11-15 UI/UX audit, I-07:
 * "nothing said twice"). Pure; nothing here computes a score.
 */

/**
 * Whether a row of the viewer's own tasting history shows its community score.
 * The "Apariciones en sesiones" list already shows each listed session's community
 * score, so the history says it only for a session that list does not show (a
 * deleted session, a label-only row, or results the viewer cannot see there).
 */
export function historyCommunityScoreShown(
  historySessionId: string | null | undefined,
  listedSessionIds: ReadonlySet<string>,
): boolean {
  return !historySessionId || !listedSessionIds.has(historySessionId);
}

/**
 * Package S6 of the 2026-11-15 UI/UX audit (F-15): the dashboard's "Cómo funciona"
 * card is for someone arriving. It starts COLLAPSED (one line that reopens it) for a
 * returning user, so the first fold of /app shows their own sessions, not an explainer.
 *
 * A returning user has at least one session (owned or joined), or dismissed the card
 * before (the existing `cata_intro_dismissed` flag in localStorage). Reopening it is a
 * choice made on the page and is not stored.
 */
export function introStartsCollapsed(input: { sessionCount: number; dismissed: boolean }): boolean {
  return input.dismissed || input.sessionCount > 0;
}

// Single source of truth for "where does clicking a session take me?".
// Ends the incoherence where every list linked to /cup even for closed
// sessions. Used by the sessions list, dashboard, profile and group pages.

export type SessionRouteInfo = {
  id: string;
  status: string;
  isGroup: boolean;
  startedAt: Date | string | null;
};

export function sessionHref(
  s: SessionRouteInfo,
  ctx: { locale: string; isOwner: boolean; isAdminViewer?: boolean },
): string {
  const base = `/${ctx.locale}/app/sessions/${s.id}`;
  // Super-admin viewing someone else's session (not owner, not participant):
  // always the read-only results view — never /cup (editable form whose
  // upserts would fail the member gate) nor /waiting (participant-only gate).
  if (ctx.isAdminViewer) return `${base}/results`;
  // Closed → the session's "detail view" is its results.
  if (s.status === "closed") return `${base}/results`;
  // Group session not yet started: participants wait; the owner runs setup.
  if (s.isGroup && !s.startedAt && !ctx.isOwner) return `${base}/waiting`;
  return `${base}/cup`;
}

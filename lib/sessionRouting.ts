// Single source of truth for "where does clicking a session take me?".
// Ends the incoherence where every list linked to /cup even for closed
// sessions. Used by the sessions list, dashboard, profile and group pages.

// A session whose `closesAt` has passed counts as over (isSessionExpired,
// server clock): its results are visible and /cup is read-only, so the link
// goes to results at the same instant.
import { isSessionExpired } from "@/lib/sessionState";

export type SessionRouteInfo = {
  id: string;
  status: string;
  isGroup: boolean;
  // Required so every caller selects it: an UNSTARTED async session has no
  // waiting room (S8-11 T3), it goes straight to /cup.
  isAsync: boolean;
  startedAt: Date | string | null;
  // Required (nullable) so every caller is forced to select it.
  closesAt: Date | string | null;
};

export function sessionHref(
  s: SessionRouteInfo,
  ctx: { locale: string; isOwner: boolean; isAdminViewer?: boolean },
  now: Date | number = Date.now(),
): string {
  const base = `/${ctx.locale}/app/sessions/${s.id}`;
  // Super-admin viewing someone else's session (not owner, not participant):
  // always the read-only results view — never /cup (editable form whose
  // upserts would fail the member gate) nor /waiting (participant-only gate).
  if (ctx.isAdminViewer) return `${base}/results`;
  // Closed or past its deadline → the session's "detail view" is its results.
  if (isSessionExpired(s, now)) return `${base}/results`;
  // LIVE group session not yet started: participants wait; the owner runs
  // setup. Async sessions never start (no "Iniciar cata"), so no waiting.
  if (s.isGroup && !s.isAsync && !s.startedAt && !ctx.isOwner) return `${base}/waiting`;
  return `${base}/cup`;
}

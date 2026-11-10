// Pure session-state rules — no Prisma, no Next imports — so they can be
// unit-tested and reused from lib/sessionAuth.ts.

import { dateInZone, endOfDayInZone, normalizeZone } from "@/lib/closeRules";

type ExpiryRow = { status: string; closesAt?: Date | string | null };

function toMs(v: Date | string | number): number {
  return typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : v.getTime();
}

/** A session stops accepting work when it is closed OR its `closesAt` has
 *  passed (strict `<`, the same boundary as the results page and the cron).
 *  `status` is still flipped only by closeSessionInternal: an expired session
 *  stays "active" until the cron or the owner closes it, but it is already
 *  read-only and its group results are already visible. Server clock only:
 *  client components never compute this. */
export function isSessionExpired(row: ExpiryRow, now: Date | number = Date.now()): boolean {
  if (row.status === "closed") return true;
  if (row.closesAt == null) return false;
  return toMs(row.closesAt) < toMs(now);
}

/** Throws `session_closed` for a closed or expired session. Call it right after the
 *  requireSessionOwner / requireSessionMember / requireSampleOwner /
 *  requireSampleMember check in EVERY mutation that writes evaluations,
 *  samples, physical/extrinsic data or metadata. "closed = the session's
 *  results ARE its detail view" is only true if nothing can still change
 *  underneath them (and the aggregate trigger only re-fires on isDraft
 *  changes, so a post-close edit would silently desync aggregate_scores).
 *  A row without `closesAt` is judged on status alone, which is what the two
 *  post-close writes rely on. */
export function assertSessionWritable(row: ExpiryRow, now: Date | number = Date.now()): void {
  if (isSessionExpired(row, now)) throw new Error("session_closed");
}

/** A participant cannot write before the master starts a live group session.
 *  Owner, async and solo sessions are never blocked. */
export function assertSessionStarted(row: {
  isGroup: boolean;
  isAsync: boolean;
  startedAt: Date | string | null;
  isOwner: boolean;
}): void {
  if (row.isGroup && !row.isAsync && !row.startedAt && !row.isOwner) {
    throw new Error("session_not_started");
  }
}

export function isSessionClosed(row: { status: string }): boolean {
  return row.status === "closed";
}

/** Whether group-level (community) results may be shown to this viewer:
 *  group sessions only, and then to the owner (or admin viewer) at any time,
 *  otherwise once the session is closed, every participant has submitted, or
 *  its `closesAt` has passed. Single source for results/page.tsx and the
 *  report routes (lib/reports/*) so a PDF can never reveal what the page hides. */
export function canViewGroupResults(input: {
  isGroup: boolean;
  ownerRead: boolean;
  status: string;
  allSubmitted: boolean;
  sessionExpired: boolean;
}): boolean {
  return (
    input.isGroup &&
    (input.ownerRead || input.status === "closed" || input.allSubmitted || input.sessionExpired)
  );
}

/** Editing `closesAt` after creation (S6 CP-C3 / S5 item 9; zone-aware since
 *  S8-05). Pure; the action translates the thrown codes to its own error shape.
 *
 *  - `undefined` → no change.
 *  - `""` / `null` → clear: `closesAt = null`, `closesAtZone = null`,
 *    `isAsync = false` (the owner closes manually from then on — a live
 *    cupping). Allowed even when cuppers already submitted.
 *  - `"YYYY-MM-DD"` → END of that day in the owner's IANA `zone` (UTC when the
 *    zone is missing or unknown, the pre-S8-05 behaviour) and `isAsync = true`.
 *    Picking today is valid until 23:59 local. A past date throws
 *    `invalid_closes_at`.
 *  - A value equal to the stored date, read back in the STORED zone (UTC for
 *    legacy rows), is a no-op, so saving other fields never fails once the
 *    stored date has passed.
 *  - Only group sessions carry a close date (`not_group_session`); a closed
 *    session is refused upstream by `assertSessionWritable`.
 *  // TODO(S8-05/C7): separating `isAsync` from `closesAt` (a live cupping
 *  // that also has a deadline) is Kim's call; today a date means self-paced. */
export function planClosesAtChange(
  session: { isGroup: boolean; closesAt?: Date | null; closesAtZone?: string | null },
  input: string | null | undefined,
  now: number = Date.now(),
  zone?: string | null,
): { closesAt: Date | null; closesAtZone: string | null; isAsync: boolean } | null {
  if (input === undefined) return null;
  if (!session.isGroup) throw new Error("not_group_session");
  if (input === null || input === "") return { closesAt: null, closesAtZone: null, isAsync: false };
  // Unchanged value -> no-op, so saving an unrelated field never trips over a
  // stored date that has since slipped into the past.
  if (session.closesAt && input === dateInZone(session.closesAt, session.closesAtZone)) return null;
  const useZone = normalizeZone(zone);
  let d: Date;
  try {
    d = endOfDayInZone(input, useZone);
  } catch {
    throw new Error("invalid_closes_at");
  }
  if (d.getTime() < now + 60_000) throw new Error("invalid_closes_at");
  return { closesAt: d, closesAtZone: useZone, isAsync: true };
}

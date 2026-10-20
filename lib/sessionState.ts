// Pure session-state rules — no Prisma, no Next imports — so they can be
// unit-tested and reused from lib/sessionAuth.ts.

/** Throws `session_closed` for a closed session. Call it right after the
 *  requireSessionOwner / requireSessionMember / requireSampleOwner /
 *  requireSampleMember check in EVERY mutation that writes evaluations,
 *  samples, physical/extrinsic data or metadata. "closed = the session's
 *  results ARE its detail view" is only true if nothing can still change
 *  underneath them (and the aggregate trigger only re-fires on isDraft
 *  changes, so a post-close edit would silently desync aggregate_scores). */
export function assertSessionWritable(row: { status: string }): void {
  if (row.status === "closed") throw new Error("session_closed");
}

export function isSessionClosed(row: { status: string }): boolean {
  return row.status === "closed";
}

/** Editing `closesAt` after creation (S6 CP-C3 / S5 item 9). Pure; the
 *  action translates the thrown codes to its own error shape.
 *
 *  - `undefined` → no change.
 *  - `""` / `null` → clear: `closesAt = null`, `isAsync = false` (the owner
 *    closes manually from then on — a live cupping). Allowed even when
 *    cuppers already submitted.
 *  - `"YYYY-MM-DD"` → END of that day in UTC (same `dateOnlyEndOfDay` rule as
 *    the wizard: picking today is valid, the cron closes it on D+1 ~06:00
 *    UTC) and `isAsync = true`. Allowed on a live session that already
 *    started — it simply gains an automatic close. A past date throws
 *    `invalid_closes_at`.
 *  - Only group sessions carry a close date (`not_group_session`); a closed
 *    session is refused upstream by `assertSessionWritable`. */
export function planClosesAtChange(
  session: { isGroup: boolean },
  input: string | null | undefined,
  now: number = Date.now(),
): { closesAt: Date | null; isAsync: boolean } | null {
  if (input === undefined) return null;
  if (!session.isGroup) throw new Error("not_group_session");
  if (input === null || input === "") return { closesAt: null, isAsync: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error("invalid_closes_at");
  const d = new Date(`${input}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime()) || d.getTime() < now + 60_000) {
    throw new Error("invalid_closes_at");
  }
  return { closesAt: d, isAsync: true };
}

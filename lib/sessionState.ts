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

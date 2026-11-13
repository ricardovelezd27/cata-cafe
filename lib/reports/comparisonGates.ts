// S10 WP5b: the page-level gates of the two closed-session comparisons, as pure
// predicates (tested) instead of inline conditions. Product law: comparisons and
// teaching views exist ONLY on a CLOSED session.

/** B3: the viewer's own numbers against the group. Closed GROUP session, group
 *  results viewable (`viewerMayReadGroupResults`) and NOT the owner/admin lens
 *  (they already see everything in the matrix). */
export function mayBuildPersonalComparison(input: {
  status: string;
  isGroup: boolean;
  canViewGroup: boolean;
  ownerRead: boolean;
}): boolean {
  return input.status === "closed" && input.isGroup && input.canViewGroup && !input.ownerRead;
}

/** B6: the viewer's own two evaluations of the same coffee. Closed session (any
 *  kind) and not the admin read view (it holds the owner's rows, not the viewer's). */
export function mayBuildRepeatedDiffs(input: { status: string; isAdminViewer: boolean }): boolean {
  return input.status === "closed" && !input.isAdminViewer;
}

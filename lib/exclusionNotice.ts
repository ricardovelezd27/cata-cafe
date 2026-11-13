// Pure mapper for the PRIVATE exclusion notice (S10 WP5a, D2). The excluded cupper
// sees one calm line on their OWN results page; nobody else's exclusion ever
// reaches a participant's payload. The mapper receives every participant row (the
// server reads them through Prisma, never PostgREST: PHASE 25) but returns ONLY
// the viewer's own state.
//
// TODO(kim-validar:D2)

import { exclusionReasonText } from "@/lib/exclusionReasons";

export type ExclusionRow = {
  userId: string;
  excludedFromResults: boolean;
  exclusionReason: string | null;
};

export type OwnExclusionNotice = { reason: string };

/** The viewer's own exclusion, or null (not excluded, not a participant, or no
 *  viewer). `labels` maps reason codes to their localized label. The result has
 *  the reason text only: no id, no name, no author, no date. */
export function ownExclusionNotice(
  rows: ExclusionRow[],
  viewerId: string | null | undefined,
  labels: Record<string, string>,
): OwnExclusionNotice | null {
  if (!viewerId) return null;
  const mine = rows.find((r) => r.userId === viewerId);
  if (!mine || !mine.excludedFromResults) return null;
  return { reason: exclusionReasonText(mine.exclusionReason, labels) ?? "" };
}

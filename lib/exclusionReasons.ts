// Pure constants + helpers for the S8-12 exclusion trail. Dependency-free so the
// server action, the dialog, the reports and the tests share one list.
//
// TODO(Kim-D2): the fixed reason list is the spec default (no notice is sent to
// the excluded cupper; exclusion stays allowed after close).

export const EXCLUSION_REASONS = ["sample_error", "protocol", "calibration", "other"] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export function isExclusionReason(value: unknown): value is ExclusionReason {
  return typeof value === "string" && (EXCLUSION_REASONS as readonly string[]).includes(value);
}

/** The latest of `stamps` that is strictly after `closedAt`; null when the
 *  session is open or nothing changed after the close. Drives the "Resultados
 *  actualizados el <fecha>" banner and the matching PDF line. */
export function resultsUpdatedAfterClose(
  closedAt: Date | null | undefined,
  stamps: (Date | null | undefined)[],
): Date | null {
  if (!closedAt) return null;
  let latest: Date | null = null;
  for (const s of stamps) {
    if (!s || s.getTime() <= closedAt.getTime()) continue;
    if (!latest || s.getTime() > latest.getTime()) latest = s;
  }
  return latest;
}

/** The sessionParticipant fields to write for an exclusion toggle. Excluding
 *  stamps who/when/why (a valid reason is required); restoring clears all
 *  three so no stale trail survives. Pure so the rule is pinned by tests. */
export function exclusionData(input: {
  excluded: boolean;
  reason?: unknown;
  userId: string;
  now: Date;
}):
  | { excludedFromResults: true; excludedAt: Date; excludedBy: string; exclusionReason: ExclusionReason }
  | { excludedFromResults: false; excludedAt: null; excludedBy: null; exclusionReason: null } {
  if (!input.excluded) {
    return { excludedFromResults: false, excludedAt: null, excludedBy: null, exclusionReason: null };
  }
  if (!isExclusionReason(input.reason)) throw new Error("invalid_input");
  return {
    excludedFromResults: true,
    excludedAt: input.now,
    excludedBy: input.userId,
    exclusionReason: input.reason,
  };
}

// Pure constants + helpers for the S8-12 exclusion trail. Dependency-free so the
// server action, the dialog, the reports and the tests share one list.
//
// TODO(kim-validar:D2): the reason list below is the owner's decision of
// 2026-11-12: a fixed list plus a short free text; scoring differently from the
// group is NEVER a reason. The excluded cupper sees a private notice on their
// own results page; nobody else does.

import * as v from "@/lib/validate";

/** The reasons offered for a NEW exclusion. "not_fit" is worded "not in a
 *  condition to cup" on purpose: the owner decided never to store a health
 *  reason about a named person. */
export const EXCLUSION_REASONS = [
  "sample_error",
  "protocol",
  "incomplete",
  "not_fit",
  "test_duplicate",
  "other",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/** Codes that exist in stored rows but can no longer be chosen; they still
 *  render with their old label ("calibration" = "Calibración distinta"). */
export const LEGACY_EXCLUSION_REASONS = ["calibration"] as const;

/** Max length of the free text that goes with "other". */
export const EXCLUSION_OTHER_MAX = 120;

const OTHER_PREFIX = "other:";

export function isExclusionReason(value: unknown): value is ExclusionReason {
  return typeof value === "string" && (EXCLUSION_REASONS as readonly string[]).includes(value);
}

/** The value stored in `session_participants.exclusion_reason` (a plain text
 *  column): the code, or `other:<free text>` for "other" (text required, at most
 *  EXCLUSION_OTHER_MAX chars, control characters turned into spaces). Throws
 *  `invalid_input` for anything else. */
export function encodeExclusionReason(reason: unknown, otherText?: unknown): string {
  const code = v.oneOf(reason, "reason", EXCLUSION_REASONS);
  if (code !== "other") return code;
  const cleaned =
    typeof otherText === "string"
      ? // eslint-disable-next-line no-control-regex
        otherText.replace(/[\u0000-\u001f\u007f]+/g, " ")
      : otherText;
  const text = v.str(cleaned, "reasonText", { max: EXCLUSION_OTHER_MAX }) as string;
  return `${OTHER_PREFIX}${text}`;
}

/** True when `stored` is a value `encodeExclusionReason` could have produced. */
export function isNewStoredExclusionReason(stored: unknown): stored is string {
  if (typeof stored !== "string") return false;
  if (stored.startsWith(OTHER_PREFIX)) {
    const text = stored.slice(OTHER_PREFIX.length);
    return text.trim().length > 0 && text.length <= EXCLUSION_OTHER_MAX;
  }
  return isExclusionReason(stored) && stored !== "other";
}

/** Splits any stored value (new, legacy, a bare legacy "other", or an unknown
 *  value) into its code and free text. Never throws. */
export function parseStoredExclusionReason(
  stored: string | null | undefined,
): { code: string; text: string | null } | null {
  if (!stored) return null;
  if (stored.startsWith(OTHER_PREFIX)) {
    const text = stored.slice(OTHER_PREFIX.length).trim();
    return { code: "other", text: text || null };
  }
  return { code: stored, text: null };
}

/** The human text of a stored reason: the free text for "other", else the label
 *  of the code in `labels`, else the raw stored value (an unknown legacy value
 *  still shows something). */
export function exclusionReasonText(
  stored: string | null | undefined,
  labels: Record<string, string>,
): string | null {
  const parsed = parseStoredExclusionReason(stored);
  if (!parsed) return null;
  if (parsed.code === "other" && parsed.text) return parsed.text;
  return labels[parsed.code] ?? parsed.code;
}

/** The close routine itself recomputes aggregates right after stamping
 *  `closedAt` (S8-04), so an aggregate `computedAt` a few seconds past the
 *  close is part of closing, not a later change. Only a recompute more than
 *  this long after the close counts as "updated after close". */
export const CLOSE_RECOMPUTE_GRACE_MS = 10 * 60 * 1000;

/** The latest change strictly after `closedAt`; null when the session is open
 *  or nothing changed after the close. Drives the "Resultados actualizados el
 *  <fecha>" banner and the matching PDF line.
 *  - `stamps` (e.g. a participant's `excludedAt`) always count once after the close.
 *  - `computedStamps` (aggregate `computedAt`) count only when MORE than
 *    CLOSE_RECOMPUTE_GRACE_MS after the close. */
export function resultsUpdatedAfterClose(
  closedAt: Date | null | undefined,
  stamps: (Date | null | undefined)[],
  computedStamps: (Date | null | undefined)[] = [],
): Date | null {
  if (!closedAt) return null;
  const closed = closedAt.getTime();
  let latest: Date | null = null;
  const consider = (s: Date | null | undefined, floor: number) => {
    if (!s || s.getTime() <= floor) return;
    if (!latest || s.getTime() > latest.getTime()) latest = s;
  };
  for (const s of stamps) consider(s, closed);
  for (const s of computedStamps) consider(s, closed + CLOSE_RECOMPUTE_GRACE_MS);
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
  | { excludedFromResults: true; excludedAt: Date; excludedBy: string; exclusionReason: string }
  | { excludedFromResults: false; excludedAt: null; excludedBy: null; exclusionReason: null } {
  if (!input.excluded) {
    return { excludedFromResults: false, excludedAt: null, excludedBy: null, exclusionReason: null };
  }
  if (!isNewStoredExclusionReason(input.reason)) throw new Error("invalid_input");
  return {
    excludedFromResults: true,
    excludedAt: input.now,
    excludedBy: input.userId,
    exclusionReason: input.reason,
  };
}

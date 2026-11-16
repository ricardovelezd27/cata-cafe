// Dates that can be written as a plain ISO string, and a serialiser that
// never throws. Pure (only lib/log, which has no imports), unit-tested in
// tests/safeDate.test.ts.
//
// Why (audit J-01, 2026-11-15): one production session had `closesAt` in the
// year 20228 (a typo for 2026, stored before the wizard checked the shape of
// the date). Postgres stores it happily, but the Date that reaches the page is
// not usable and `toISOString()` throws `RangeError: Invalid time value`, so
// the WHOLE sessions list fell into the error boundary for everyone whose list
// held that row. Two rules follow:
//   1. nothing new may be stored outside years 0000..9999 (validation:
//      `isPlainIsoDate` in lib/validate.ts and lib/closeRules.ts);
//   2. a page never lets one bad row take the list down (`toIsoOrNull`).

import { logWarn } from "@/lib/log";

/** 0000-01-01T00:00:00.000Z, the first instant whose ISO form has a
 *  four-digit year (Date.UTC would map year 0 to 1900, so parse it). */
export const MIN_PLAIN_ISO_MS = Date.parse("0000-01-01T00:00:00.000Z");
/** 9999-12-31T23:59:59.999Z, the last instant whose ISO form has a
 *  four-digit year. Beyond it `toISOString()` writes "+010000-…". */
export const MAX_PLAIN_ISO_MS = Date.parse("9999-12-31T23:59:59.999Z");

/** The latest calendar day a date input may offer (the `max` attribute). */
export const MAX_DATE_INPUT = "9999-12-31";

/** True for a valid Date whose year has four digits (0000..9999), i.e. one
 *  that `toISOString()` writes as `YYYY-MM-DDTHH:mm:ss.sssZ` and that every
 *  `YYYY-MM-DD` reader of this app can read back. */
export function isPlainIsoDate(d: unknown): d is Date {
  if (!(d instanceof Date)) return false;
  const ms = d.getTime();
  return Number.isFinite(ms) && ms >= MIN_PLAIN_ISO_MS && ms <= MAX_PLAIN_ISO_MS;
}

/** Ids only (lib/log rules): where the date was read, which column, which row. */
export type SafeDateContext = {
  where: string;
  field: string;
  sessionId?: string;
  coffeeId?: string;
  groupId?: string;
  userId?: string;
};

/** `d.toISOString()`, or null when there is no date or it cannot be written
 *  as a plain ISO string. Never throws. With a context, a date that EXISTS
 *  but cannot be written is logged once per call (ids only, never the value
 *  of another field), so the bad row can be found and corrected. */
export function toIsoOrNull(
  d: Date | null | undefined,
  ctx?: SafeDateContext,
): string | null {
  if (d === null || d === undefined) return null;
  if (isPlainIsoDate(d)) return d.toISOString();
  if (ctx) {
    logWarn({ ...ctx, code: "unserialisable_date" });
  }
  return null;
}

// How a session's closing instant is written (DeadlineBanner: the session list,
// the cup header, the waiting room, the join page). Pure, no imports,
// unit-tested in tests/deadlineFormat.test.ts.
//
// Why a module of its own (production bug, 2026-11-20): the banner asked
// Intl.DateTimeFormat for `dateStyle` + `timeStyle` TOGETHER WITH
// `timeZoneName`. ECMA-402 forbids mixing the style shortcuts with any
// component option, so every browser throws a TypeError ("Invalid option :
// option" in Chrome) the moment the banner renders. It renders only in the
// browser and only for a session that is not closed and has a closing date,
// so the first such row took the whole sessions list into the error boundary
// (the super-admin's list holds every session, so it was the first to show it).
// The fix spells the date and time out as components, which may be combined
// with `timeZoneName`, and never throws: a zone the runtime does not know falls
// back to UTC.

/** The date and time parts the banner shows (about `dateStyle: "medium"` +
 *  `timeStyle: "short"`, written as components so a zone name may be added). */
const DEADLINE_PARTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * The instant `at` as a date and time in `timeZone`, in the language `bcp`,
 * with the zone's short name when `withZoneName`. Never throws: an unknown
 * zone is written in UTC, and an invalid date gives "".
 */
export function formatDeadlineInstant(
  at: Date,
  bcp: string,
  timeZone: string,
  withZoneName: boolean,
): string {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return "";
  const options: Intl.DateTimeFormatOptions = {
    ...DEADLINE_PARTS,
    ...(withZoneName ? { timeZoneName: "short" as const } : {}),
  };
  for (const zone of [timeZone, "UTC"]) {
    try {
      return new Intl.DateTimeFormat(bcp, { ...options, timeZone: zone }).format(at);
    } catch {
      // try the next zone
    }
  }
  return at.toISOString();
}

// Pure helpers for moving a founding-seat reservation when the person changes
// their sign-in address (S10 WP9a). Dependency-free, unit-tested.
//
// Why: the reservation (waitlist_entries) is keyed by address. After an email
// change the account lives on while a row under the OLD address would count as
// "a reservation with no account" and be deleted after the retention period.
//
// SECURITY (third review H1, fifth round M-a): the change is recorded ONLY in
// the user's `app_metadata` (`email_change = { from, to }`), which only the
// service role can write (`user_metadata` can be written by any signed-in user
// with the public key, so it must never decide whose data moves).
//   - requestEmailChange writes the record AFTER the user's own
//     updateUser({ email }) succeeded: `from` is the address the SERVER read for
//     the signed-in user, `to` the new address the SERVER passed to updateUser.
//     Each request OVERWRITES the record (a new request replaces the old one).
//   - confirmEmailToken moves the row right after verifyOtp succeeded for
//     type=email_change, whatever happens to the browser session afterwards
//     (zero click, parked, accepted, rejected, expired): GoTrue has completed
//     the change by then. It moves only when the verified user's current
//     `email` equals the recorded `to` and no `new_email` is pending; any other
//     record is inert and left as it is. The record is cleared after a move.
// lib/emailChangeMove.ts does the I/O; `user_metadata` is never read here.

export const EMAIL_CHANGE_KEY = "email_change";

type UserLike = {
  email?: string | null;
  new_email?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined;

/**
 * THE address comparison, on both sides. SQL says `lower(btrim(x))`: btrim with
 * no characters removes SPACES only (not tabs or newlines), so this lowercases
 * and trims SPACES only too. Do not widen it to `trim()`: a difference between
 * the two sides is exactly where an address could match in one and not in the
 * other.
 */
export function normalizeAddress(e: string): string {
  return e.replace(/^ +| +$/g, "").toLowerCase();
}

/**
 * {from, to} when the user object describes a COMPLETED email change: it has
 * an address, no address still pending (`new_email` empty: the first of two
 * confirmations leaves it set), and an `app_metadata.email_change` record whose
 * `to` IS the account's current address and whose `from` differs. Otherwise
 * null (the record, if any, is inert).
 */
export function completedEmailChange(user: UserLike): { from: string; to: string } | null {
  if (!user?.email) return null;
  if (user.new_email) return null;
  const rec = user.app_metadata?.[EMAIL_CHANGE_KEY];
  if (!rec || typeof rec !== "object") return null;
  const { from: rawFrom, to: rawTo } = rec as { from?: unknown; to?: unknown };
  if (typeof rawFrom !== "string" || typeof rawTo !== "string") return null;
  const from = normalizeAddress(rawFrom);
  const to = normalizeAddress(rawTo);
  if (!from || !to || from === to) return null;
  if (normalizeAddress(user.email) !== to) return null;
  return { from, to };
}

/** The app_metadata to WRITE when an email change is requested. ONLY the key
 *  it sets (GoTrue merges app_metadata; spreading the existing object could
 *  write back a stale `providers`). */
export function appMetadataRecordingEmailChange(from: string, to: string): Record<string, unknown> {
  return { [EMAIL_CHANGE_KEY]: { from: normalizeAddress(from), to: normalizeAddress(to) } };
}

/** The app_metadata to WRITE once the move is done: only the key, nulled. */
export function appMetadataClearingEmailChange(): Record<string, unknown> {
  return { [EMAIL_CHANGE_KEY]: null };
}

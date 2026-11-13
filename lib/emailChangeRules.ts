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

/**
 * Is the `email_change` record in `after` the one the decision was made on
 * (`before`)? Compared by value: same normalised `from` and `to` when both are
 * usable records; otherwise the two raw values must be deeply equal (an unusable
 * record that did not change is the same one). A missing record is never the
 * same. Used to re-check right before clearing (a new request may have
 * overwritten the record since it was read).
 */
export function sameEmailChangeRecord(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): boolean {
  const a = before?.[EMAIL_CHANGE_KEY];
  const b = after?.[EMAIL_CHANGE_KEY];
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const pa = a as { from?: unknown; to?: unknown };
  const pb = b as { from?: unknown; to?: unknown };
  const usable = (r: { from?: unknown; to?: unknown }) => typeof r.from === "string" && typeof r.to === "string";
  if (typeof a === "object" && typeof b === "object" && usable(pa) && usable(pb)) {
    return (
      normalizeAddress(pa.from as string) === normalizeAddress(pb.from as string) &&
      normalizeAddress(pa.to as string) === normalizeAddress(pb.to as string)
    );
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export type ReconcileAction ="move" | "clear" | "keep";

/**
 * What the nightly reconcile pass (lib/emailChangeReconcile.ts) does with ONE
 * account that still carries an `app_metadata.email_change` record, given the
 * auth user as the admin API reads it now (S10 leftovers A1: a move that failed
 * at verify time was never retried):
 *   - move  : the change is COMPLETED (`completedEmailChange`): run the same
 *             move the verify path runs (same refusals).
 *   - keep  : nothing to do tonight: no record at all, or a change still in
 *             flight (`new_email` set: the person has not confirmed yet).
 *   - clear : the record is INERT: it can never move anything (not an object,
 *             `from`/`to` not usable, or the account's current address is not
 *             the recorded `to` and no change is pending). Only the key is
 *             removed.
 * Never "move" unless `completedEmailChange` agrees, so the reconcile can never
 * move anything the verify path would not.
 */
export function reconcileAction(user: UserLike): ReconcileAction {
  if (completedEmailChange(user)) return "move";
  const rec = user?.app_metadata?.[EMAIL_CHANGE_KEY];
  if (rec === null || rec === undefined) return "keep";
  if (user?.new_email) return "keep";
  return "clear";
}

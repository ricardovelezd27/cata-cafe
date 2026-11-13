// Pure helpers for moving a founding-seat reservation when the person changes
// their sign-in address (S10 WP9a). Dependency-free, unit-tested.
//
// Why: the reservation (waitlist_entries) is keyed by address. After an email
// change the account lives on while a row under the OLD address would count as
// "a reservation with no account" and be deleted after the retention period.
//
// SECURITY (third review, H1): the old address is recorded ONLY in the user's
// `app_metadata`, which only the service role can write (`user_metadata` can be
// written by any signed-in user with the public key, so it must never decide
// whose data moves). requestEmailChange writes it AFTER the user's own
// updateUser({ email }) succeeded, from the address the SERVER read for the
// signed-in user; confirmEmailToken / acceptPendingSignIn read it back from the
// verified user's `app_metadata` once the session is established, move the row
// and clear it (lib/emailChangeMove.ts). `user_metadata` is never read here.

export const EMAIL_CHANGE_FROM_KEY = "email_change_from";

type UserLike = {
  email?: string | null;
  new_email?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined;

const norm = (e: string) => e.trim().toLowerCase();

/**
 * {from, to} when the user object describes a COMPLETED email change: it has
 * an address, no address still pending (`new_email` empty: the first of two
 * confirmations leaves it set), and a recorded previous address (in
 * `app_metadata` only) that differs. Otherwise null.
 */
export function completedEmailChange(user: UserLike): { from: string; to: string } | null {
  if (!user?.email) return null;
  if (user.new_email) return null;
  const raw = user.app_metadata?.[EMAIL_CHANGE_FROM_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const from = norm(raw);
  const to = norm(user.email);
  if (!from || from === to) return null;
  return { from, to };
}

/** The app_metadata to write when an email change is requested: the existing
 *  keys kept, the old address (normalised) recorded. */
export function appMetadataRecordingOldAddress(
  existing: Record<string, unknown> | null | undefined,
  oldAddress: string,
): Record<string, unknown> {
  return { ...(existing ?? {}), [EMAIL_CHANGE_FROM_KEY]: norm(oldAddress) };
}

/** The app_metadata to write once the move is done: the key removed (null). */
export function appMetadataClearingOldAddress(
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return { ...(existing ?? {}), [EMAIL_CHANGE_FROM_KEY]: null };
}

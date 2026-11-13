// Pure helpers for moving a founding-seat reservation when the person changes
// their sign-in address (S10 WP9a). Dependency-free, unit-tested.
//
// Why: the reservation (waitlist_entries) is keyed by address. After an email
// change the account lives on while a row under the OLD address would count as
// "a reservation with no account" and be deleted after the retention period.
// requestEmailChange records the old address in the account's own user_metadata
// (`email_change_from`, set immediately; the address itself stays pending);
// confirmEmailToken moves the row when the change COMPLETES.

export const EMAIL_CHANGE_FROM_KEY = "email_change_from";

type UserLike = {
  email?: string | null;
  new_email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

const norm = (e: string) => e.trim().toLowerCase();

/**
 * {from, to} when the user object describes a COMPLETED email change: it has
 * an address, no address still pending (`new_email` empty: the first of two
 * confirmations leaves it set), and a recorded previous address that differs.
 * Otherwise null.
 */
export function completedEmailChange(user: UserLike): { from: string; to: string } | null {
  if (!user?.email) return null;
  if (user.new_email) return null;
  const raw = user.user_metadata?.[EMAIL_CHANGE_FROM_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const from = norm(raw);
  const to = norm(user.email);
  if (!from || from === to) return null;
  return { from, to };
}

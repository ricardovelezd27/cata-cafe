// Pure rules for coffee-share invite links (S8-12, F-cafes-4 / F-cafes-5).
// Dependency-free so the actions, the profile page and the tests agree.

/** New links stop working after this many days; the owner sees the date. */
export const COFFEE_INVITE_TTL_DAYS = 30;

export function coffeeInviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + COFFEE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** A link can still be used: not expired (legacy rows have no expiry) and not
 *  out of seats. */
export function isCoffeeInviteUsable(
  invite: { expiresAt: Date | null; maxUses: number | null; useCount: number },
  now: Date = new Date(),
): boolean {
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return false;
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return false;
  return true;
}

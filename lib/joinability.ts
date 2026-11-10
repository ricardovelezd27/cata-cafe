import { isSessionExpired } from "./sessionState";

/**
 * Can this invite still be used to join? (S8-07, F-guest-3.) One pure rule
 * kept for its tests; the /join page, `checkJoinable` and `joinViaToken` now
 * all decide with `evaluateJoin` (lib/joinRules.ts, S8-11), which also knows
 * `entriesLocked` and a revoked invite. Originally shared so a closed link, an expired link and a full session read the same
 * everywhere. Order matches joinViaToken: unknown, expired, closed, full.
 *
 * Dependency-free (no Prisma, no server-only) so vitest covers it.
 */
export type JoinBlock = "invalid_token" | "token_expired" | "session_closed" | "token_exhausted";

export function joinBlock(
  invite: { expiresAt: Date | null; maxUses: number | null; useCount: number } | null | undefined,
  session: { status: string; closesAt: Date | null } | null | undefined,
  now: Date = new Date(),
): JoinBlock | null {
  if (!invite || !session) return "invalid_token";
  if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) return "token_expired";
  if (isSessionExpired(session, now)) return "session_closed";
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return "token_exhausted";
  return null;
}

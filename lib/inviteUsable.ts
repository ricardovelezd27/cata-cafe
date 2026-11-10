// Pure "can this invite still admit someone" rule, shared by the print page's
// QR lookup and the owner invite route (S8-10 T3). Dependency-free for vitest.

export type InviteRow = {
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  /** Revoked links ("Regenerar enlace") are `false`; absent = not tracked. */
  active?: boolean;
};

export function isInviteUsable(invite: InviteRow | null | undefined, now: Date = new Date()): boolean {
  if (!invite) return false;
  if (invite.active === false) return false;
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime()) return false;
  return invite.maxUses === null || invite.useCount < invite.maxUses;
}

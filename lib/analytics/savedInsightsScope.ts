// Which saved insights a caller may list (S8-22). Pure, so a test can pin it
// without Prisma. Matches S8-08's scope rule: a user sees their own; the
// super-admin sees everyone's (rows still carry `isMine`).
export function savedInsightsWhere(access: {
  userId: string;
  isSuperAdmin: boolean;
}): { createdBy?: string } {
  return access.isSuperAdmin ? {} : { createdBy: access.userId };
}

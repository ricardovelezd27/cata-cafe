import "server-only";

import { prisma } from "@/lib/prisma";
import { isInviteUsable } from "@/lib/inviteUsable";

/** Newest still-usable invite of a session, or null. NO authorization: callers
 *  gate first (owner only). Never mints one. */
export async function getLatestInvite(sessionId: string): Promise<{ token: string } | null> {
  const invite = await prisma.sessionInvite.findFirst({
    where: {
      sessionId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { token: true, expiresAt: true, maxUses: true, useCount: true },
  });
  return invite && isInviteUsable(invite) ? { token: invite.token } : null;
}

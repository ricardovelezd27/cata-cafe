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

/** Finds the newest still-usable (active, unexpired, seats left) invite of a
 *  session, or mints a fresh one. Shared by createInviteToken, sendGroupEmail
 *  and notifyGroupOfSession so every surface hands out the SAME link. NO
 *  authorization: callers verify session ownership first. Lives here (not in a
 *  "use server" file) so it is not a public POST endpoint. */
export async function resolveOrCreateSessionInvite(
  sessionId: string,
  createdBy: string,
): Promise<string> {
  const existing = await getLatestInvite(sessionId);
  if (existing) return existing.token;

  const token = crypto.randomUUID();
  await prisma.sessionInvite.create({
    data: { sessionId, token, maxUses: null, expiresAt: null, createdBy },
  });
  return token;
}

/** Revokes every active invite of a session and mints a new one in ONE
 *  transaction ("Regenerar enlace"). Old links read as expired on /join. */
export async function regenerateSessionInvite(
  sessionId: string,
  createdBy: string,
  opts: { maxUses: number | null; expiresAt: Date | null } = { maxUses: null, expiresAt: null },
): Promise<string> {
  const token = crypto.randomUUID();
  await prisma.$transaction([
    prisma.sessionInvite.updateMany({ where: { sessionId, active: true }, data: { active: false } }),
    prisma.sessionInvite.create({
      data: { sessionId, token, maxUses: opts.maxUses, expiresAt: opts.expiresAt, createdBy },
    }),
  ]);
  return token;
}

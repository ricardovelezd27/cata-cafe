import "server-only";

import { prisma } from "@/lib/prisma";
import { actorKeyForIp, actorKeyForUser, targetKeyForEmail, targetKeyForSession } from "@/lib/emailKeys";
import {
  type EmailEvent,
  type ThrottleDecision,
  type ThrottleRule,
  CLOSE_RESEND_PER_SESSION,
  GROUP_BROADCASTS_PER_HOUR,
  CODE_VERIFY_PER_IP,
  CODE_VERIFY_PER_TARGET,
  MAGIC_LINK_PER_ADDRESS,
  MAGIC_LINK_PER_IP,
  MAGIC_LINK_PER_USER,
  ledgerPurgeCutoff,
  MAX_WINDOW_MS,
  decideAll,
  groupRecipientRule,
} from "@/lib/emailLimits";

// The ledger side of the email limits (S8-03). Callers reserve BEFORE they
// send and treat a refusal as `rate_limited`:
//
//   const budget = await reserveEmailBudget({ kind: "group_broadcast", userId, recipients });
//   if (!budget.allowed) throw new Error("rate_limited");
//
// A reservation is not refunded when the send later fails: a failing sender
// must not get unlimited retries, and "retry failed" reserves as
// `group_invite` (recipients only, no broadcast slot).
//
// Check-then-insert is not atomic. Two simultaneous requests can both pass
// and overshoot a limit by one reservation; these are abuse limits, not
// billing, so that is accepted rather than paying for a lock on every send.

export type EmailBudgetRequest =
  | {
      kind: "magic_link";
      /** Request IP, or null when unknown (local dev, no proxy header): the
       *  IP rule is then skipped, never collapsed into one shared bucket. */
      ip: string | null;
      email: string;
      /** Signed-in requester (S8-28 A-04): adds a per-account bucket so one
       *  account cannot fan links out to many addresses. Absent = anonymous. */
      userId?: string | null;
    }
  | {
      /** One ATTEMPT to redeem a sign-in code / link token (S8-22 A-03). */
      kind: "code_verify";
      ip: string | null;
      /** The address, or a string derived from the link token (never raw). */
      subject: string;
    }
  | {
      /** One owner click on "resend close emails" (S9-01, A-09). */
      kind: "close_resend";
      sessionId: string;
    }
  | {
      kind: "group_broadcast" | "group_invite";
      userId: string;
      recipients: number;
    };

async function eventsFor(
  where: { kind: { in: string[] }; actorKey?: string; targetKey?: string },
  now: number,
): Promise<Array<EmailEvent & { kind: string }>> {
  const rows = await prisma.outboundEmailEvent.findMany({
    where: { ...where, createdAt: { gte: new Date(now - MAX_WINDOW_MS) } },
    select: { kind: true, recipients: true, createdAt: true },
  });
  return rows.map((r) => ({ kind: r.kind, recipients: r.recipients, at: r.createdAt.getTime() }));
}

export async function reserveEmailBudget(
  req: EmailBudgetRequest,
  now: number = Date.now(),
): Promise<ThrottleDecision> {
  if (req.kind === "magic_link") {
    const targetKey = targetKeyForEmail(req.email);
    const actorKey = req.ip ? actorKeyForIp(req.ip) : null;
    const checks: Array<{ events: EmailEvent[]; rule: ThrottleRule }> = [
      {
        events: await eventsFor({ kind: { in: ["magic_link"] }, targetKey }, now),
        rule: MAGIC_LINK_PER_ADDRESS,
      },
    ];
    if (actorKey) {
      checks.push({
        events: await eventsFor({ kind: { in: ["magic_link"] }, actorKey }, now),
        rule: MAGIC_LINK_PER_IP,
      });
    }
    const userKey = req.userId ? actorKeyForUser(req.userId) : null;
    if (userKey) {
      checks.push({
        events: await eventsFor({ kind: { in: ["magic_link_user"] }, actorKey: userKey }, now),
        rule: MAGIC_LINK_PER_USER,
      });
    }
    const decision = decideAll(checks, { recipients: 1 }, now);
    if (!decision.allowed) return decision;
    await prisma.outboundEmailEvent.create({
      data: { kind: "magic_link", actorKey, targetKey, recipients: 1 },
    });
    // Separate kind so the address/IP counts above are never double-counted.
    if (userKey) {
      await prisma.outboundEmailEvent.create({
        data: { kind: "magic_link_user", actorKey: userKey, targetKey: null, recipients: 1 },
      });
    }
    return decision;
  }

  if (req.kind === "code_verify") {
    const targetKey = targetKeyForEmail(req.subject);
    const actorKey = req.ip ? actorKeyForIp(req.ip) : null;
    const checks: Array<{ events: EmailEvent[]; rule: ThrottleRule }> = [
      {
        events: await eventsFor({ kind: { in: ["code_verify"] }, targetKey }, now),
        rule: CODE_VERIFY_PER_TARGET,
      },
    ];
    if (actorKey) {
      checks.push({
        events: await eventsFor({ kind: { in: ["code_verify"] }, actorKey }, now),
        rule: CODE_VERIFY_PER_IP,
      });
    }
    const decision = decideAll(checks, { recipients: 0 }, now);
    if (!decision.allowed) return decision;
    await prisma.outboundEmailEvent.create({
      data: { kind: "code_verify", actorKey, targetKey, recipients: 0 },
    });
    return decision;
  }

  if (req.kind === "close_resend") {
    const targetKey = targetKeyForSession(req.sessionId);
    const decision = decideAll(
      [{ events: await eventsFor({ kind: { in: ["close_resend"] }, targetKey }, now), rule: CLOSE_RESEND_PER_SESSION }],
      { recipients: 0 },
      now,
    );
    if (!decision.allowed) return decision;
    await prisma.outboundEmailEvent.create({
      data: { kind: "close_resend", actorKey: null, targetKey, recipients: 0 },
    });
    return decision;
  }

  if (req.recipients <= 0) return { allowed: true };

  const actorKey = actorKeyForUser(req.userId);
  const [events, profile] = await Promise.all([
    eventsFor({ kind: { in: ["group_broadcast", "group_invite"] }, actorKey }, now),
    prisma.profile.findUnique({ where: { id: req.userId }, select: { createdAt: true } }),
  ]);
  const checks: Array<{ events: EmailEvent[]; rule: ThrottleRule }> = [
    // Recipients per day count every group mail, broadcast or invite.
    { events, rule: groupRecipientRule(profile?.createdAt.getTime() ?? null, now) },
  ];
  if (req.kind === "group_broadcast") {
    checks.push({
      events: events.filter((e) => e.kind === "group_broadcast"),
      rule: GROUP_BROADCASTS_PER_HOUR,
    });
  }
  const decision = decideAll(checks, { recipients: req.recipients }, now);
  if (!decision.allowed) return decision;
  await prisma.outboundEmailEvent.create({
    data: { kind: req.kind, actorKey, targetKey: null, recipients: req.recipients },
  });
  return decision;
}

/** S8-28 A-03: drops ledger rows no rule can see any more. Bounded work per
 *  call (rows are ~1 per login attempt); called from the daily cron. */
export async function purgeEmailLedger(now: number = Date.now()): Promise<number> {
  const r = await prisma.outboundEmailEvent.deleteMany({
    where: { createdAt: { lt: new Date(ledgerPurgeCutoff(now)) } },
  });
  return r.count;
}

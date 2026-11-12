import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
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
// Check-then-insert is made atomic per bucket (S9-04, found by the runtime DB
// suite: 10 simultaneous reservations against a limit of 3 let 6 through).
// Each reservation runs in ONE interactive transaction whose first statements
// take a transaction-level advisory lock for every bucket it counts against
// (`pg_advisory_xact_lock(hashtextextended(key, 0))`), in SORTED key order so
// two requests with overlapping keys can never deadlock. The counts and the
// insert then happen under those locks, so at most `limit` reservations of one
// bucket ever succeed. Transaction-level locks are released at commit and an
// interactive transaction pins one connection, which is what Supabase's
// transaction pooler needs: no session-level locks, no SERIALIZABLE.
//
// A lock that cannot be had within LOCK_TIMEOUT_MS (or a transaction that
// exceeds its Prisma timeout) THROWS: the caller sees the same "unknown"
// failure as any other database error and may retry. It is never an "allow".

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

const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;
const LOCK_TIMEOUT_MS = 4_000;

type Tx = Prisma.TransactionClient;

/** Takes the advisory lock of every bucket key, sorted and de-duplicated. */
async function lockBuckets(tx: Tx, keys: Array<string | null>): Promise<void> {
  // SET LOCAL: scoped to this transaction, so it is safe behind a pooler.
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  const sorted = [...new Set(keys.filter((k): k is string => !!k))].sort();
  for (const key of sorted) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"email-budget:" + key}, 0))`;
  }
}

async function eventsFor(
  tx: Tx,
  where: { kind: { in: string[] }; actorKey?: string; targetKey?: string },
  now: number,
): Promise<Array<EmailEvent & { kind: string }>> {
  const rows = await tx.outboundEmailEvent.findMany({
    where: { ...where, createdAt: { gte: new Date(now - MAX_WINDOW_MS) } },
    select: { kind: true, recipients: true, createdAt: true },
  });
  return rows.map((r) => ({ kind: r.kind, recipients: r.recipients, at: r.createdAt.getTime() }));
}

export async function reserveEmailBudget(
  req: EmailBudgetRequest,
  now: number = Date.now(),
): Promise<ThrottleDecision> {
  if ((req.kind === "group_broadcast" || req.kind === "group_invite") && req.recipients <= 0) {
    return { allowed: true };
  }
  return prisma.$transaction((tx) => reserveInTx(tx, req, now), TX_OPTIONS);
}

async function reserveInTx(
  tx: Tx,
  req: EmailBudgetRequest,
  now: number,
): Promise<ThrottleDecision> {
  if (req.kind === "magic_link") {
    const targetKey = targetKeyForEmail(req.email);
    const actorKey = req.ip ? actorKeyForIp(req.ip) : null;
    const userKey = req.userId ? actorKeyForUser(req.userId) : null;
    await lockBuckets(tx, [
      `magic_link:target:${targetKey}`,
      actorKey && `magic_link:actor:${actorKey}`,
      userKey && `magic_link_user:${userKey}`,
    ]);
    const checks: Array<{ events: EmailEvent[]; rule: ThrottleRule }> = [
      {
        events: await eventsFor(tx, { kind: { in: ["magic_link"] }, targetKey }, now),
        rule: MAGIC_LINK_PER_ADDRESS,
      },
    ];
    if (actorKey) {
      checks.push({
        events: await eventsFor(tx, { kind: { in: ["magic_link"] }, actorKey }, now),
        rule: MAGIC_LINK_PER_IP,
      });
    }
    if (userKey) {
      checks.push({
        events: await eventsFor(tx, { kind: { in: ["magic_link_user"] }, actorKey: userKey }, now),
        rule: MAGIC_LINK_PER_USER,
      });
    }
    const decision = decideAll(checks, { recipients: 1 }, now);
    if (!decision.allowed) return decision;
    await tx.outboundEmailEvent.create({
      data: { kind: "magic_link", actorKey, targetKey, recipients: 1 },
    });
    // Separate kind so the address/IP counts above are never double-counted.
    if (userKey) {
      await tx.outboundEmailEvent.create({
        data: { kind: "magic_link_user", actorKey: userKey, targetKey: null, recipients: 1 },
      });
    }
    return decision;
  }

  if (req.kind === "code_verify") {
    const targetKey = targetKeyForEmail(req.subject);
    const actorKey = req.ip ? actorKeyForIp(req.ip) : null;
    await lockBuckets(tx, [`code_verify:target:${targetKey}`, actorKey && `code_verify:actor:${actorKey}`]);
    const checks: Array<{ events: EmailEvent[]; rule: ThrottleRule }> = [
      {
        events: await eventsFor(tx, { kind: { in: ["code_verify"] }, targetKey }, now),
        rule: CODE_VERIFY_PER_TARGET,
      },
    ];
    if (actorKey) {
      checks.push({
        events: await eventsFor(tx, { kind: { in: ["code_verify"] }, actorKey }, now),
        rule: CODE_VERIFY_PER_IP,
      });
    }
    const decision = decideAll(checks, { recipients: 0 }, now);
    if (!decision.allowed) return decision;
    await tx.outboundEmailEvent.create({
      data: { kind: "code_verify", actorKey, targetKey, recipients: 0 },
    });
    return decision;
  }

  if (req.kind === "close_resend") {
    const targetKey = targetKeyForSession(req.sessionId);
    await lockBuckets(tx, [`close_resend:target:${targetKey}`]);
    const decision = decideAll(
      [{ events: await eventsFor(tx, { kind: { in: ["close_resend"] }, targetKey }, now), rule: CLOSE_RESEND_PER_SESSION }],
      { recipients: 0 },
      now,
    );
    if (!decision.allowed) return decision;
    await tx.outboundEmailEvent.create({
      data: { kind: "close_resend", actorKey: null, targetKey, recipients: 0 },
    });
    return decision;
  }

  const actorKey = actorKeyForUser(req.userId);
  await lockBuckets(tx, [`group:${actorKey}`]);
  const events = await eventsFor(tx, { kind: { in: ["group_broadcast", "group_invite"] }, actorKey }, now);
  const profile = await tx.profile.findUnique({ where: { id: req.userId }, select: { createdAt: true } });
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
  await tx.outboundEmailEvent.create({
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

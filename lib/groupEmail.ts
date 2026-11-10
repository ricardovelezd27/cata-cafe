import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { logWarn } from "@/lib/log";
import {
  SEND_CONCURRENCY,
  idempotencyKeyFor,
  planBroadcast,
  sendWithRetry,
  summarize,
  type DeliveryStatus,
} from "@/lib/groupEmailPlan";

// The ONE group-mail sender (S8-03, F-grupos-1 / F-grupos-7). Broadcast,
// session notice, announcement blast, invitations and resend all come through
// deliverGroupMail: it reserves the email budget BEFORE anything is sent,
// sends 4 at a time with bounded per-recipient retries, and records one
// GroupEmailDelivery row per recipient so "retry failed" resends only rows
// that are not `sent`. It logs ids and codes only, never an address, a name or
// the provider's response body. Callers authorize first (owner of the group).

export type GroupMailJob = {
  memberId: string;
  /** Display name, or a masked address. Safe to return to the client. */
  label: string;
  /** Live destination address. Stays inside this module. */
  email: string;
  subject: string;
  html: string;
};

export type GroupEmailResult = { memberId: string; label: string; status: DeliveryStatus };

export type GroupMailOutcome =
  | { ok: true; results: GroupEmailResult[] }
  | { ok: false; error: "rate_limited"; retryAfterMs: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// TODO(owner): per-group unsubscribe (F-grupos-8). Needs a signed one-click
// route (RFC 8058), an opt-out column on tasting_group_members and the
// List-Unsubscribe headers on the three templates; the skip belongs in this
// delivery step. Not built in S8-14: a new public endpoint and the opt-out
// semantics are an owner decision.
export async function deliverGroupMail(args: {
  userId: string;
  groupId: string;
  /** `group_broadcast` uses a broadcast slot; `group_invite` counts recipients only. */
  kind: "group_broadcast" | "group_invite";
  broadcastId: string;
  jobs: GroupMailJob[];
}): Promise<GroupMailOutcome> {
  const { jobs, broadcastId, groupId } = args;
  if (jobs.length === 0) return { ok: true, results: [] };

  const ledger = await prisma.groupEmailDelivery.findMany({
    where: { broadcastId, memberId: { in: jobs.map((j) => j.memberId) } },
    select: { memberId: true, status: true, attempts: true },
  });
  const plan = planBroadcast(jobs, ledger);
  const prior = new Map(ledger.map((r) => [r.memberId, r.attempts]));

  const byMember = new Map<string, GroupEmailResult>();
  for (const j of plan.alreadySent) {
    byMember.set(j.memberId, { memberId: j.memberId, label: j.label, status: "sent" });
  }

  if (plan.toSend.length > 0) {
    // A pure retry (every remaining recipient already has a ledger row for
    // this broadcast) takes no second broadcast slot, but its recipients
    // count. Any recipient new to the ledger makes it a fresh broadcast, so
    // reusing a client-supplied id cannot smuggle a send past the hourly cap.
    const budget = await reserveEmailBudget({
      kind: plan.isRetry ? "group_invite" : args.kind,
      userId: args.userId,
      recipients: plan.toSend.length,
    });
    if (!budget.allowed) {
      return { ok: false, error: "rate_limited", retryAfterMs: budget.retryAfterMs };
    }

    const failures: Record<string, number> = {};
    for (let i = 0; i < plan.toSend.length; i += SEND_CONCURRENCY) {
      const chunk = plan.toSend.slice(i, i + SEND_CONCURRENCY);
      await Promise.all(
        chunk.map(async (job) => {
          const key = idempotencyKeyFor(broadcastId, job.memberId, prior.get(job.memberId) ?? 0);
          const outcome = await sendWithRetry(
            () =>
              sendEmail({
                to: job.email,
                subject: job.subject,
                html: job.html,
                idempotencyKey: key,
              }),
            sleep,
          );
          if (outcome.status === "failed") {
            const code = outcome.code ?? "unknown";
            failures[code] = (failures[code] ?? 0) + 1;
          }
          byMember.set(job.memberId, {
            memberId: job.memberId,
            label: job.label,
            status: outcome.status,
          });
          try {
            await prisma.groupEmailDelivery.upsert({
              where: { broadcastId_memberId: { broadcastId, memberId: job.memberId } },
              create: {
                broadcastId,
                memberId: job.memberId,
                status: outcome.status,
                attempts: outcome.attempts,
                lastError: outcome.code ?? null,
              },
              update: {
                status: outcome.status,
                attempts: { increment: outcome.attempts },
                lastError: outcome.code ?? null,
              },
            });
          } catch {
            logWarn({ where: "deliverGroupMail", message: "ledger_write_failed", groupId, broadcastId });
          }
        }),
      );
    }
    for (const [code, count] of Object.entries(failures)) {
      logWarn({ where: "deliverGroupMail", message: "send_failed", groupId, broadcastId, code, count });
    }
  }

  // Original order, one entry per recipient.
  const results = jobs
    .map((j) => byMember.get(j.memberId))
    .filter((r): r is GroupEmailResult => !!r);
  return { ok: true, results };
}

/** Same shape the UI has always received, now without addresses. */
export function summaryOf(results: GroupEmailResult[]) {
  return summarize(results);
}

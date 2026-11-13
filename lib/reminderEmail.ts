import "server-only";

// System reminders sent from the daily cron (app/api/cron/close-expired-sessions).
// They are system mail, NOT user-triggered, so they never touch the user email
// budget (lib/emailBudget.ts); the ledger session_reminder_deliveries is the
// dedupe: one row per session x recipient x kind, written BEFORE the send (the
// primary key makes a concurrent run lose the race) and removed again if the
// send fails so the next run retries. Anonymous guests have no email: no send,
// no row. Neither pass ever closes a session.

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeletedProfileId } from "@/lib/accountDeletion/deletedProfile";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/inviteUrl";
import { errorMessage, logError } from "@/lib/log";
import {
  deadlineReminderWindow,
  IDLE_RULE_EFFECTIVE_AT,
  isEvaluationComplete,
  shouldSendLiveIdleReminder,
  type ReminderKind,
} from "@/lib/closeRules";
import {
  buildReminderHtml,
  loginNextUrl,
  reminderPath,
  reminderSubject,
  type ReminderLocale,
} from "@/lib/reminderEmailBody";

export type ReminderSummary = { sessions: number; sent: number; skipped: number; failed: number; truncated: boolean };

async function sendOne(args: {
  sessionId: string;
  sessionName: string;
  userId: string;
  kind: ReminderKind;
}): Promise<"sent" | "skipped" | "failed"> {
  // Reserve the ledger row first: the composite key is the lock.
  try {
    await prisma.sessionReminderDelivery.create({
      data: { sessionId: args.sessionId, userId: args.userId, kind: args.kind },
    });
  } catch {
    return "skipped"; // already reminded (or a concurrent run holds it)
  }

  const release = async () => {
    try {
      await prisma.sessionReminderDelivery.delete({
        where: { sessionId_userId_kind: { sessionId: args.sessionId, userId: args.userId, kind: args.kind } },
      });
    } catch {
      // nothing to release
    }
  };

  // A deleted account's placeholder (S8-19) has no auth user: keep the row so
  // it is never looked up again.
  if (isDeletedProfileId(args.userId)) return "skipped";

  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(args.userId);
    const email = data?.user?.email;
    if (error) {
      await release();
      return "failed";
    }
    if (!email) {
      // A guest: nothing to send. Keep the row so we never look again.
      return "skipped";
    }
    const profile = await prisma.profile.findUnique({
      where: { id: args.userId },
      select: { preferredLang: true },
    });
    const locale: ReminderLocale = profile?.preferredLang === "en" ? "en" : "es";
    const result = await sendEmail({
      to: email,
      subject: reminderSubject(args.kind, locale, args.sessionName),
      html: buildReminderHtml({
        kind: args.kind,
        locale,
        sessionName: args.sessionName,
        url: loginNextUrl(siteOrigin(), locale, reminderPath(locale, args.sessionId)),
      }),
    });
    if (result.skipped) {
      await release();
      return "skipped";
    }
    if (!result.ok) {
      await release();
      return "failed";
    }
    return "sent";
  } catch (err) {
    await release();
    logError({ where: "reminders.send", kind: args.kind, sessionId: args.sessionId, message: errorMessage(err) });
    return "failed";
  }
}

/** deadline_24h: asynchronous group sessions whose closesAt falls in the next
 *  24 h; members who hold at least one COMPLETE unsent evaluation get one mail. */
export async function sendDeadlineReminders(batch: number, now: number = Date.now()): Promise<ReminderSummary> {
  const w = deadlineReminderWindow(now);
  const sessions = await prisma.cuppingSession.findMany({
    where: { isGroup: true, status: "active", closesAt: { gt: w.gt, lte: w.lte } },
    select: { id: true, name: true, format: true },
    orderBy: { closesAt: "asc" },
    take: batch,
  });
  const summary: ReminderSummary = { sessions: sessions.length, sent: 0, skipped: 0, failed: 0, truncated: sessions.length === batch };
  for (const s of sessions) {
    const drafts = await prisma.evaluation.findMany({
      where: { sessionSample: { sessionId: s.id }, isDraft: true },
      select: { cupperId: true, isDraft: true, descriptiveData: true, affectiveData: true, combinedData: true },
    });
    const cuppers = [...new Set(drafts.filter((d) => isEvaluationComplete(d, s.format)).map((d) => d.cupperId))];
    for (const userId of cuppers) {
      const r = await sendOne({ sessionId: s.id, sessionName: s.name, userId, kind: "deadline_24h" });
      summary[r] += 1;
    }
  }
  return summary;
}

/** live_idle: a started live session with no activity for LIVE_IDLE_MS gets one
 *  owner reminder. Never closes anything (Kim C3 default, option a). */
export async function sendLiveIdleReminders(batch: number, now: number = Date.now()): Promise<ReminderSummary> {
  const candidates = await prisma.cuppingSession.findMany({
    where: {
      isGroup: true,
      isAsync: false,
      closesAt: null,
      status: "active",
      // Not a grandfathered session (started before the idle rule): the reminder
      // promises a 7-day close those sessions do not get (shouldSendLiveIdleReminder).
      startedAt: { gte: IDLE_RULE_EFFECTIVE_AT },
      // Already reminded sessions would otherwise fill the batch forever.
      reminderDeliveries: { none: { kind: "live_idle" } },
    },
    select: { id: true, name: true, createdBy: true, isGroup: true, isAsync: true, closesAt: true, status: true, startedAt: true },
    orderBy: { startedAt: "asc" },
    take: batch,
  });
  const summary: ReminderSummary = { sessions: 0, sent: 0, skipped: 0, failed: 0, truncated: candidates.length === batch };
  if (candidates.length === 0) return summary;
  // Last activity through the sample relation: Evaluation.sessionId is nullable
  // and only healed on update, so legacy rows would make a busy session look idle.
  const samples = await prisma.sessionSample.findMany({
    where: { sessionId: { in: candidates.map((c) => c.id) } },
    select: {
      sessionId: true,
      evaluations: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  });
  const lastBySession = new Map<string, Date>();
  for (const smp of samples) {
    const u = smp.evaluations[0]?.updatedAt;
    const cur = lastBySession.get(smp.sessionId);
    if (u && (!cur || u > cur)) lastBySession.set(smp.sessionId, u);
  }
  for (const s of candidates) {
    // Not once it is abandoned (7 days): the idle pass closes it in this same run.
    if (!shouldSendLiveIdleReminder(s, lastBySession.get(s.id) ?? null, now)) continue;
    summary.sessions += 1;
    const r = await sendOne({ sessionId: s.id, sessionName: s.name, userId: s.createdBy, kind: "live_idle" });
    summary[r] += 1;
  }
  return summary;
}

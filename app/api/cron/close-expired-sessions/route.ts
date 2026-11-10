// Daily deadline enforcement for async sessions (vercel.json: "0 6 * * *").
// An async session carries `closesAt`; until this existed nothing ever closed
// it, so participants never got their close email and no coffee history was
// written. Auth: Authorization: Bearer <CRON_SECRET> — Vercel Cron sends it
// automatically when the env var is set. Safe to re-run: closeSessionInternal
// is idempotent and close emails are tracked per recipient.
//
// Passes (each capped at BATCH, reported separately in the JSON):
//   1. close      active sessions whose closesAt has passed
//   2. repair     closed sessions whose phase 2 never finished (S8-05: a close
//                 that threw after the flip is retried here, not lost)
//   3. reminders  deadline_24h (members with complete unsent notes) and
//                 live_idle (owner of a forgotten live session). Ledgered in
//                 session_reminder_deliveries; NEVER closes a session.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeSessionInternal } from "@/lib/closeSession";
import { FINALIZE_GRACE_MS } from "@/lib/closeRules";
import { errorMessage, logError, logWarn } from "@/lib/log";
import { sendDeadlineReminders, sendLiveIdleReminders } from "@/lib/reminderEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 25;

/** Moves a session whose repair did not finish to the back of the queue (the
 *  pass orders by updatedAt asc) without a migration. Never throws. */
async function requeueRepair(id: string) {
  try {
    await prisma.cuppingSession.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } });
  } catch (err) {
    logError({ where: "cron.repairClose", sessionId: id, message: errorMessage(err) });
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron] CRON_SECRET is not set — session auto-close disabled.");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const due = await prisma.cuppingSession.findMany({
    where: { status: "active", closesAt: { lt: new Date() } },
    select: { id: true, name: true },
    orderBy: { closesAt: "asc" },
    take: BATCH,
  });

  const results: { id: string; closed: boolean; emailsQueued: number; error?: string }[] = [];
  for (const s of due) {
    try {
      const r = await closeSessionInternal(s.id, { reason: "cron", emails: "await" });
      results.push({ id: s.id, closed: r.closed, emailsQueued: r.emailsQueued });
    } catch (err) {
      const message = errorMessage(err);
      logError({ where: "cron.closeExpired", sessionId: s.id, message });
      results.push({ id: s.id, closed: false, emailsQueued: 0, error: message });
    }
  }
  const truncated = due.length === BATCH;
  if (truncated) logWarn({ where: "cron.closeExpired", message: "batch full, more sessions are due", batch: BATCH });

  // Pass 2: repair closed sessions whose phase 2 is owed.
  const owed = await prisma.cuppingSession.findMany({
    where: {
      status: "closed",
      closeFinalizedAt: null,
      closedAt: { lt: new Date(Date.now() - FINALIZE_GRACE_MS) },
    },
    select: { id: true },
    // updatedAt, not closedAt: a session whose finalize keeps failing is bumped
    // below so it rotates to the back instead of starving newer ones forever.
    orderBy: { updatedAt: "asc" },
    take: BATCH,
  });
  const repairs: { id: string; finalized: boolean; error?: string }[] = [];
  for (const s of owed) {
    try {
      const r = await closeSessionInternal(s.id, { reason: "repair", emails: "await" });
      const finalized = r.finalized === true;
      repairs.push({ id: s.id, finalized });
      if (!finalized) await requeueRepair(s.id);
    } catch (err) {
      const message = errorMessage(err);
      logError({ where: "cron.repairClose", sessionId: s.id, message });
      repairs.push({ id: s.id, finalized: false, error: message });
      await requeueRepair(s.id);
    }
  }
  const stillUnfinalized = repairs.filter((r) => !r.finalized).length;
  const repairTruncated = owed.length === BATCH;
  if (repairTruncated) logWarn({ where: "cron.repairClose", message: "batch full, more repairs owed", batch: BATCH });

  // Pass 3: reminders. A failure here must never fail the closes above.
  let reminders: { deadline?: unknown; liveIdle?: unknown; error?: string } = {};
  try {
    reminders = {
      deadline: await sendDeadlineReminders(BATCH),
      liveIdle: await sendLiveIdleReminders(BATCH),
    };
  } catch (err) {
    const message = errorMessage(err);
    logError({ where: "cron.reminders", message });
    reminders = { error: message };
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    closed: results.filter((r) => r.closed).length,
    results,
    // More than BATCH due means the next run (or a manual re-trigger) picks
    // up the rest — bounded per invocation on purpose.
    truncated,
    reminders,
    repair: { owed: owed.length, stillUnfinalized, finalized: repairs.filter((r) => r.finalized).length, results: repairs, truncated: repairTruncated },
  });
}

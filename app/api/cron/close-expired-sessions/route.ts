// Daily deadline enforcement for async sessions (vercel.json: "0 6 * * *").
// An async session carries `closesAt`; until this existed nothing ever closed
// it, so participants never got their close email and no coffee history was
// written. Auth: Authorization: Bearer <CRON_SECRET> — Vercel Cron sends it
// automatically when the env var is set. Safe to re-run: closeSessionInternal
// is idempotent and close emails are tracked per recipient.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeSessionInternal } from "@/lib/closeSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 25;

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
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", where: "cron.closeExpired", sessionId: s.id, message }));
      results.push({ id: s.id, closed: false, emailsQueued: 0, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    closed: results.filter((r) => r.closed).length,
    results,
    // More than BATCH due means the next run (or a manual re-trigger) picks
    // up the rest — bounded per invocation on purpose.
    truncated: due.length === BATCH,
  });
}

// Monthly insights digest cron endpoint (vercel.json: "0 12 1 * *").
// Auth: Authorization: Bearer <CRON_SECRET> — Vercel Cron sends it
// automatically when the env var is set. Idempotent per period via DigestRun,
// so manual re-triggers and retries are safe.

import { NextResponse } from "next/server";
import { sendInsightsDigest } from "@/lib/insightsDigestEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron] CRON_SECRET is not set — insights digest disabled.");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await sendInsightsDigest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron] insights digest failed:", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

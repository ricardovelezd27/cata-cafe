// GET route: OWNER-only raw results export (CSV), one row per cupper x sample.
// Gate mirrors the ficha-tecnica route: 401 signed-out, the session CREATOR or
// the super-admin (read-only) get the file, everyone else — participants
// included — gets 404 so the route does not reveal the session exists.
// `?locale=en|es` picks the header language, `?names=0` drops the cupper name
// column (S10 WP5a, TODO(kim-validar:D5)): the file keeps only the stable code
// per cupper, no name, id or email. Same owner / super-admin gate.

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { loadSessionReportSource } from "@/lib/reports/sessionReportData";
import { buildResultsCsv } from "@/lib/reports/resultsCsv";
import { csvCupperCodes } from "@/lib/reports/csvCodeKey";
import { slug, dateSlug } from "@/lib/pdf/filename";
import { logError, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const locale: "es" | "en" = sp.get("locale") === "en" ? "en" : "es";
  const names = sp.get("names") !== "0" && sp.get("codes") !== "1"; // the old ?codes=1 means the same as names=0

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const isSuperAdmin = isSuperAdminEmail(user.email);
  const session = await prisma.cuppingSession.findFirst({
    where: isSuperAdmin ? { id } : { id, createdBy: user.id },
    select: { id: true, name: true },
  });
  if (!session) return new Response("Not found", { status: 404 });

  let csv: string;
  try {
    const source = await loadSessionReportSource(id, { locale });
    if (!source) return new Response("Not found", { status: 404 });
    csv = buildResultsCsv(source, {
      locale,
      coffeeDeleted: deletedCoffeeLabel(locale),
      names,
      codes: csvCupperCodes(
        id,
        [...source.participants.map((p) => p.userId), ...source.evals.map((e) => e.cupperId)],
      ),
    }).csv;
  } catch (err) {
    const digest = Math.random().toString(36).slice(2, 10);
    logError({
      where: "results-csv",
      code: "csv_export_failed",
      digest,
      locale,
      sessionId: id,
      message: errorMessage(err),
    });
    return new Response(`Export failed (${digest})`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const filename = `${locale === "en" ? "results" : "resultados"}_${slug(session.name) || "sesion"}${names ? "" : locale === "en" ? "_no-names" : "_sin-nombres"}_${dateSlug()}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

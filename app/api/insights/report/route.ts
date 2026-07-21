// GET route: server-rendered "insights" PDF report — platform-wide KPIs,
// optional AI narrative, monthly trend and top-N bar charts, plus an optional
// CQI benchmark comparison. Access mirrors the insights layout
// (app/[locale]/app/insights/layout.tsx): unauthorized users get a 404 so the
// area's existence is not advertised (never 401/403 here). react-pdf needs
// Node APIs, so this handler runs on the Node runtime.

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { getDashboardData } from "@/lib/analytics/queries";
import { getBenchmarkComparison } from "@/lib/analytics/benchmarks";
import { citationLines } from "@/lib/analytics/referenceSources";
import { cachedGenerate } from "@/lib/ai/cache";
import {
  buildDashboardNarrativeRequest,
  dashboardNarrativeInputs,
  type NarrativeContent,
} from "@/lib/ai/narratives";
import {
  InsightsReportDocument,
  type InsightsReportProps,
} from "@/lib/pdf/InsightsReportDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: "es" | "en" = localeParam === "en" ? "en" : "es";

  // Don't advertise this area to unauthorized users — 404, matching the
  // insights layout's notFound() behavior, not 401/403.
  const access = await getAnalyticsAccess();
  if (!access) {
    return new Response("Not found", { status: 404 });
  }

  const [data, benchmark] = await Promise.all([
    getDashboardData(locale),
    getBenchmarkComparison({}),
  ]);

  // A narrative-provider failure must never break the report: catch both the
  // "not ok" result shape and a thrown error, and fall back to no narrative.
  let narrative: NarrativeContent | null = null;
  try {
    const inputs = dashboardNarrativeInputs(data);
    const result = await cachedGenerate<NarrativeContent>(
      "dashboard",
      inputs,
      locale,
      buildDashboardNarrativeRequest(inputs, locale),
    );
    if (result.ok) {
      narrative = result.content;
    }
  } catch {
    narrative = null;
  }

  const generatedAt = new Date().toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const props: InsightsReportProps = {
    locale,
    generatedAt,
    data,
    narrative,
    benchmark,
    citations: citationLines(["cqi_arabica", "owid_fao"], locale),
  };

  const buffer = await renderToBuffer(InsightsReportDocument(props));

  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `cata_cafe_insights_${dateSlug}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

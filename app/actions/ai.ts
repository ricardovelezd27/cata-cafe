"use server";

import { requireAnalyticsAccess } from "@/lib/analytics/access";
import { getDashboardData, runInsightQuery, runPivotQuery } from "@/lib/analytics/queries";
import { isPivotConfigLike, parseInsightConfig, parsePivotConfig } from "@/lib/analytics/types";
import type { InsightConfig, PivotConfig } from "@/lib/analytics/types";
import { cachedGenerate, type CachedAiResult } from "@/lib/ai/cache";
import {
  buildDashboardNarrativeRequest,
  buildInsightNarrativeRequest,
  buildLinkedInPivotRequest,
  buildLinkedInRequest,
  dashboardNarrativeInputs,
  insightNarrativeInputs,
  pivotNarrativeInputs,
  type LinkedInContent,
  type NarrativeContent,
} from "@/lib/ai/narratives";

// AI actions follow the email-style discriminated result: `skipped` means the
// provider key is not configured (UI shows "AI not configured"), `error` means
// the call failed. Cache-first via lib/ai/cache.ts.

function asLocale(locale: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

export async function generateDashboardNarrative(
  locale: string,
  force = false,
): Promise<CachedAiResult<NarrativeContent>> {
  await requireAnalyticsAccess();
  const loc = asLocale(locale);
  const data = await getDashboardData(loc);
  const inputs = dashboardNarrativeInputs(data);
  return cachedGenerate<NarrativeContent>(
    "dashboard",
    inputs,
    loc,
    buildDashboardNarrativeRequest(inputs, loc),
    force,
  );
}

export async function generateInsightNarrative(
  rawConfig: unknown,
  locale: string,
  force = false,
): Promise<CachedAiResult<NarrativeContent>> {
  await requireAnalyticsAccess();
  const loc = asLocale(locale);
  let config: InsightConfig;
  try {
    config = parseInsightConfig(rawConfig);
  } catch {
    return { ok: false, error: "invalid_config" };
  }
  const rows = await runInsightQuery(config, loc);
  if (rows.length === 0) return { ok: false, error: "no_data" };
  const inputs = insightNarrativeInputs(config, rows);
  return cachedGenerate<NarrativeContent>(
    "insight",
    inputs,
    loc,
    buildInsightNarrativeRequest(inputs, loc),
    force,
  );
}

export async function generateLinkedInDraft(
  rawConfig: unknown,
  headline: string | null,
  force = false,
): Promise<CachedAiResult<LinkedInContent>> {
  await requireAnalyticsAccess();
  const cleanHeadline = headline?.trim().slice(0, 140) || null;

  if (isPivotConfigLike(rawConfig)) {
    let config: PivotConfig;
    try {
      config = parsePivotConfig(rawConfig);
    } catch {
      return { ok: false, error: "invalid_config" };
    }
    // Locale-independent (the draft contains both languages); hash under "es".
    const result = await runPivotQuery(config, "es");
    if (result.rowKeys.length === 0) return { ok: false, error: "no_data" };
    const inputs = { ...pivotNarrativeInputs(config, result), headline: cleanHeadline };
    return cachedGenerate<LinkedInContent>(
      "linkedin_pivot",
      inputs,
      "es",
      buildLinkedInPivotRequest(inputs, cleanHeadline),
      force,
    );
  }

  let config: InsightConfig;
  try {
    config = parseInsightConfig(rawConfig);
  } catch {
    return { ok: false, error: "invalid_config" };
  }
  // Locale-independent (the draft contains both languages); hash under "es".
  const rows = await runInsightQuery(config, "es");
  if (rows.length === 0) return { ok: false, error: "no_data" };
  const inputs = { ...insightNarrativeInputs(config, rows), headline: cleanHeadline };
  return cachedGenerate<LinkedInContent>(
    "linkedin",
    inputs,
    "es",
    buildLinkedInRequest(inputs, cleanHeadline),
    force,
  );
}

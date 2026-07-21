import "server-only";
import { createHash } from "node:crypto";
import type { DashboardData } from "@/lib/analytics/queries";
import type { InsightConfig, InsightRow } from "@/lib/analytics/types";
import type { AiGenerateRequest } from "./types";

// Prompt builders for every AI-narrative kind. Prompts receive ONLY aggregated
// numbers/labels — never raw evaluations, notes, or user emails. Bump
// PROMPT_VERSION whenever a prompt changes: it participates in the cache hash,
// so stale narratives invalidate naturally.

export const PROMPT_VERSION = 1;

type Locale = "es" | "en";

const LANGUAGE_NAME: Record<Locale, string> = { es: "Spanish", en: "English" };

export const BASE_SYSTEM = `You are the data analyst of Cata Café, a professional coffee-cupping platform used by certified cuppers (catadores) applying the SCA CVA methodology. You write short, precise, insight-driven narratives about cupping data for coffee professionals.
Rules:
- Use ONLY the figures provided in the input JSON. Never invent, extrapolate, or estimate numbers that are not present.
- Scores are on the SCA 100-point-style CVA scale; sample sizes matter — mention n when it is small (< 20) and soften claims accordingly.
- Tone: professional, warm, specific. No hype, no emojis, no generic filler ("in today's fast-paced coffee world…").
- When third-party benchmark data (CQI) or production series (FAO/OWID) appear in the input, you may reference them, noting they are external reference data.`;

/** Stable stringify (sorted keys) so hashing is order-independent. */
function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, function replacer(_key, val) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) sorted[k] = (val as Record<string, unknown>)[k];
      return sorted;
    }
    return val;
  });
}

/** Cache key: sha256 of canonical inputs + locale + prompt version. */
export function narrativeHash(kind: string, inputs: unknown, locale: string): string {
  return createHash("sha256")
    .update(`${kind}|v${PROMPT_VERSION}|${locale}|${canonicalStringify(inputs)}`)
    .digest("hex");
}

export const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One punchy sentence, max 90 chars" },
    body: { type: "string", description: "2-3 short paragraphs, plain text" },
    highlights: {
      type: "array",
      items: { type: "string" },
      description: "3-5 one-line takeaways, each a complete standalone fact",
    },
  },
  required: ["headline", "body", "highlights"],
} as const;

export interface NarrativeContent {
  headline: string;
  body: string;
  highlights: string[];
}

export const LINKEDIN_SCHEMA = {
  type: "object",
  properties: {
    es: { type: "string", description: "Full LinkedIn post in Spanish" },
    en: { type: "string", description: "Full LinkedIn post in English" },
    hashtags: { type: "array", items: { type: "string" }, description: "4-6 hashtags without #" },
  },
  required: ["es", "en", "hashtags"],
} as const;

export interface LinkedInContent {
  es: string;
  en: string;
  hashtags: string[];
}

/** Trims DashboardData to the fields the prompt needs (also the hash input). */
export function dashboardNarrativeInputs(data: DashboardData) {
  return {
    kpis: {
      coffeesRegistered: data.coffeesRegistered,
      coffeesCupped: data.coffeesCupped,
      sessionsTotal: data.sessionsTotal,
      evaluationsSubmitted: data.evaluationsSubmitted,
      activeCuppers30d: data.activeCuppers30d,
      totalUsers: data.totalUsers,
      avgIndividualScore: data.avgIndividualScore,
      avgCommunityScore: data.avgCommunityScore,
    },
    monthlyTrend: data.monthlyTrend.map((m) => ({
      month: m.key,
      evaluations: m.evaluations,
      sessions: m.sessions,
    })),
    topOrigins: data.topOrigins.map((r) => ({ label: r.label, value: r.value })),
    topProcesses: data.topProcesses.map((r) => ({ label: r.label, value: r.value })),
    scoreDistribution: data.scoreDistribution.map((r) => ({ band: r.label, count: r.value })),
    topDescriptors: data.topDescriptors.slice(0, 10).map((r) => ({ label: r.label, count: r.value })),
  };
}

export function buildDashboardNarrativeRequest(
  inputs: ReturnType<typeof dashboardNarrativeInputs>,
  locale: Locale,
): AiGenerateRequest {
  return {
    tier: "lite",
    system: BASE_SYSTEM,
    jsonSchema: NARRATIVE_SCHEMA,
    maxOutputTokens: 1024,
    prompt: `Write the narrative in ${LANGUAGE_NAME[locale]}.
Summarize the current state of this cupping platform's data for its admin: what stands out, what is trending, what deserves attention. Focus on the interesting, not the obvious.

Input data (aggregated platform statistics):
${JSON.stringify(inputs)}`,
  };
}

export interface InsightNarrativeInputs {
  dataset: string;
  dimension: string;
  measure: string;
  rows: { label: string; value: number; count: number }[];
}

export function insightNarrativeInputs(
  config: InsightConfig,
  rows: InsightRow[],
): InsightNarrativeInputs {
  return {
    dataset: config.dataset,
    dimension: config.dimension,
    measure: config.measure,
    rows: rows.slice(0, 25).map((r) => ({ label: r.label, value: r.value, count: r.count })),
  };
}

export function buildInsightNarrativeRequest(
  inputs: InsightNarrativeInputs,
  locale: Locale,
): AiGenerateRequest {
  return {
    tier: "lite",
    system: BASE_SYSTEM,
    jsonSchema: NARRATIVE_SCHEMA,
    maxOutputTokens: 1024,
    prompt: `Write the narrative in ${LANGUAGE_NAME[locale]}.
The admin ran an exploration query: dataset "${inputs.dataset}", grouped by "${inputs.dimension}", measuring "${inputs.measure}". Interpret the result: what pattern does it show, which buckets stand out (top, outliers, surprising gaps), and what follow-up question would a coffee professional ask next.

Query result rows (label / value / row-count):
${JSON.stringify(inputs.rows)}`,
  };
}

export function buildLinkedInRequest(
  inputs: InsightNarrativeInputs,
  headline: string | null,
): AiGenerateRequest {
  return {
    tier: "standard",
    system: BASE_SYSTEM,
    jsonSchema: LINKEDIN_SCHEMA,
    maxOutputTokens: 2048,
    prompt: `Write ONE LinkedIn post in Spanish and the same post in English (independent, natural versions — not literal translations) sharing a data finding from our cupping platform.
Style: first-person plural of a specialty-coffee team sharing real data; hook first line; 2-4 short paragraphs; under 1300 characters per language; concrete numbers from the input only; end with a light question to invite discussion. No emojis-overload (max 2), no clickbait.
${headline ? `The angle to lead with: "${headline}".` : "Choose the strongest angle yourself."}

The finding (dataset "${inputs.dataset}" grouped by "${inputs.dimension}", measuring "${inputs.measure}"):
${JSON.stringify(inputs.rows)}`,
  };
}

export interface DigestInputs {
  period: string;
  prevPeriod: string;
  evaluations: { current: number; previous: number };
  sessions: { current: number; previous: number };
  newCoffees: { current: number; previous: number };
  avgScore: { current: number | null; previous: number | null };
  topOrigins: { label: string; value: number }[];
  topDescriptors: { label: string; value: number }[];
}

export function buildDigestRequest(inputs: DigestInputs, locale: Locale): AiGenerateRequest {
  return {
    tier: "standard",
    system: BASE_SYSTEM,
    jsonSchema: NARRATIVE_SCHEMA,
    maxOutputTokens: 1024,
    prompt: `Write the narrative in ${LANGUAGE_NAME[locale]}.
This is the monthly insights digest email for the platform admins, covering ${inputs.period} compared against ${inputs.prevPeriod}. Lead with the most meaningful change (growth, decline, notable origin or descriptor shift). Keep the body to 2 short paragraphs; the highlights become bullet points in the email.

Month data:
${JSON.stringify(inputs)}`,
  };
}

/** Parse a provider JSON response defensively. */
export function parseJsonContent<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some providers wrap JSON in markdown fences despite JSON mode.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

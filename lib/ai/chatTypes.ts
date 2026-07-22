// Client-safe types for the "ask the data" AI chat (lib/ai/chatTools.ts is the
// server-only counterpart; app/actions/aiChat.ts is the server action that
// consumes both). This file must never pull in a runtime server-only import —
// client components (Task 3) import it directly.
//
// BenchmarkComparison/OriginContext mirror the shapes in
// lib/analytics/benchmarks.ts (which is `server-only`) rather than importing
// them, so this module stays free of any server-only runtime dependency.

import type { InsightConfig, InsightRow } from "@/lib/analytics/types";

export interface ChatHistoryItem {
  role: "user" | "assistant";
  text: string;
}

export interface BenchmarkComparison {
  mine: { n: number; avg: number | null; min: number | null; max: number | null };
  benchmark: { n: number; avg: number | null; p25: number | null; p75: number | null };
}

export interface OriginContext {
  countryCode: string;
  countryName: string;
  /** OWID/FAO production series, tonnes, ascending years. */
  production: { year: number; value: number }[];
  /** Our cupping activity for that origin by calendar year. */
  myActivity: { year: number; evaluations: number; avgScore: number | null }[];
}

export type AiChatBlock =
  | { tool: "run_insight"; config: InsightConfig; rows: InsightRow[] }
  | { tool: "get_dashboard_overview"; overview: Record<string, unknown> }
  | {
      tool: "run_benchmark";
      filter: Record<string, unknown>;
      comparison: BenchmarkComparison;
      citations: string[];
    }
  | {
      tool: "get_origin_context";
      countryCode: string;
      context: OriginContext;
      citations: string[];
    };

export type AskDataResult =
  | {
      ok: true;
      answer: string;
      blocks: AiChatBlock[];
      citations: string[];
      usage: { used: number; limit: number; remaining: number };
    }
  | {
      ok: false;
      error: "limit_reached" | "provider_error" | "no_answer";
      usage: { used: number; limit: number; remaining: number };
    }
  | { ok: false; skipped: true };

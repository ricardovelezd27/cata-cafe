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

// SessionCandidate/SessionSummary mirror the shapes in
// lib/analytics/queries.ts (`server-only`) — same convention as
// BenchmarkComparison/OriginContext above.
export interface SessionCandidate {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  status: string;
  format: string;
  isGroup: boolean;
  sampleCount: number;
  participantCount: number;
}

export interface SessionSampleSummary {
  label: string;
  position: number;
  revealed: boolean;
  coffeeName: string | null;
  communityScore: number | null;
  avgRawScore: number | null;
  submittedCount: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
}

export interface SessionSummary extends SessionCandidate {
  cupsPerSample: number;
  submittedCupperCount: number;
  samples: SessionSampleSummary[];
}

export type AiChatBlock =
  | { tool: "run_insight"; config: InsightConfig; rows: InsightRow[] }
  | { tool: "get_dashboard_overview"; overview: Record<string, unknown> }
  | {
      tool: "get_session_summary";
      summary: SessionSummary | null;
      candidates: SessionCandidate[] | null;
    }
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Formats a possibly-missing number for a history line; non-finite/absent -> em dash. */
function fmtNum(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtStr(v: unknown, fallback = "?"): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** label=value, joined by ", ", capped at `limit` entries. Tries each candidate
 *  label/value key in order so one helper covers the several {label,value} /
 *  {band,count} / {label,count} shapes used across get_dashboard_overview. */
function serializeLabelValueList(
  items: unknown,
  labelKeys: string[],
  valueKeys: string[],
  limit = 10,
): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .slice(0, limit)
    .map((item) => {
      if (!isRecord(item)) return "?=—";
      const label = labelKeys.map((k) => item[k]).find((v): v is string => typeof v === "string");
      const value = valueKeys.map((k) => item[k]).find((v) => typeof v === "number");
      return `${label ?? "?"}=${fmtNum(value)}`;
    })
    .join(", ");
}

/** Serializes one tool-result block to a single compact plain-text line for
 *  replay into chat history (see serializeBlocksForHistory). Never throws —
 *  every field access is optional-guarded; an unrecognized/empty block
 *  produces "". */
function serializeBlock(block: AiChatBlock): string {
  switch (block?.tool) {
    case "run_insight": {
      const config = block.config;
      const rows = Array.isArray(block.rows) ? block.rows : [];
      if (rows.length === 0) return "";
      const pairs = rows
        .slice(0, 10)
        .map((r) => `${fmtStr(r?.label ?? r?.key)}=${fmtNum(r?.value)} (n=${r?.count ?? "?"})`)
        .join(", ");
      return `run_insight ${fmtStr(config?.measure)} by ${fmtStr(config?.dimension)} (${fmtStr(config?.dataset)}): ${pairs}`;
    }

    case "get_dashboard_overview": {
      const overview = block.overview;
      if (!isRecord(overview)) return "";
      const parts: string[] = [];

      const kpis = overview.kpis;
      if (isRecord(kpis)) {
        const kpiStr = Object.entries(kpis)
          .filter(([, v]) => typeof v === "number" || typeof v === "string")
          .map(([k, v]) => `${k}=${typeof v === "number" ? fmtNum(v) : v}`)
          .join(", ");
        if (kpiStr) parts.push(`kpis: ${kpiStr}`);
      }

      const origins = serializeLabelValueList(overview.topOrigins, ["label"], ["value"]);
      if (origins) parts.push(`topOrigins: ${origins}`);

      const processes = serializeLabelValueList(overview.topProcesses, ["label"], ["value"]);
      if (processes) parts.push(`topProcesses: ${processes}`);

      const descriptors = serializeLabelValueList(overview.topDescriptors, ["label"], ["count"]);
      if (descriptors) parts.push(`topDescriptors: ${descriptors}`);

      const distribution = serializeLabelValueList(overview.scoreDistribution, ["band"], ["count"]);
      if (distribution) parts.push(`scoreDistribution: ${distribution}`);

      return parts.length > 0 ? `get_dashboard_overview ${parts.join(" | ")}` : "";
    }

    case "get_session_summary": {
      const summary = block.summary;
      if (summary) {
        const samples = Array.isArray(summary.samples) ? summary.samples : [];
        const sampleStr = samples
          .slice(0, 10)
          .map((s) => {
            const name = s?.coffeeName ? `${fmtStr(s?.label)} (${s.coffeeName})` : fmtStr(s?.label);
            return `${name}=${fmtNum(s?.communityScore ?? s?.avgRawScore)}`;
          })
          .join(", ");
        const kind = [fmtStr(summary.status), fmtStr(summary.format), summary.isGroup ? "group" : "solo"].join(", ");
        return `get_session_summary "${fmtStr(summary.name)}" (${kind}): ${sampleStr}`;
      }
      const candidates = block.candidates;
      if (Array.isArray(candidates) && candidates.length > 0) {
        const list = candidates
          .slice(0, 10)
          .map((c) => `"${fmtStr(c?.name)}" (${fmtStr(c?.status)}, ${fmtStr(c?.format)})`)
          .join(", ");
        return `get_session_summary candidates: ${list}`;
      }
      return "";
    }

    case "run_benchmark": {
      const comparison = block.comparison;
      if (!comparison) return "";
      const mine = comparison.mine;
      const bench = comparison.benchmark;
      return `run_benchmark mine avg=${fmtNum(mine?.avg)} (n=${mine?.n ?? "?"}, min=${fmtNum(mine?.min)}, max=${fmtNum(mine?.max)}) vs benchmark avg=${fmtNum(bench?.avg)} (n=${bench?.n ?? "?"}, p25=${fmtNum(bench?.p25)}, p75=${fmtNum(bench?.p75)})`;
    }

    case "get_origin_context": {
      const context = block.context;
      if (!context) return "";
      const production = Array.isArray(context.production) ? context.production : [];
      const prodStr = production
        .slice(-10)
        .map((p) => `${p?.year ?? "?"}=${fmtNum(p?.value)}`)
        .join(", ");
      const activity = Array.isArray(context.myActivity) ? context.myActivity : [];
      const actStr = activity
        .slice(-10)
        .map((a) => `${a?.year ?? "?"}: n=${a?.evaluations ?? "?"} avg=${fmtNum(a?.avgScore)}`)
        .join(", ");
      const label = fmtStr(context.countryName ?? block.countryCode);
      const bits = [prodStr && `production ${prodStr}`, actStr && `myActivity ${actStr}`].filter(Boolean);
      return bits.length > 0 ? `get_origin_context ${label}: ${bits.join(" | ")}` : "";
    }

    default:
      return "";
  }
}

/** Serializes an assistant turn's tool-result blocks into a compact plain-text
 *  digest suitable for replaying into chat history, so a follow-up question
 *  can reference numbers a previous answer's tools produced (blocks
 *  themselves are never sent back to the model — only their prose answer
 *  currently is; see ChatPanel's history builder). One line per block,
 *  joined with "\n", hard-truncated at `maxChars` with a trailing "…".
 *  Never throws: unrecognized/malformed blocks are skipped, not fatal.
 *  Returns "" when there is nothing serializable (no blocks, or every block
 *  serialized to an empty line). */
export function serializeBlocksForHistory(
  blocks: AiChatBlock[] | undefined | null,
  maxChars = 700,
): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";

  const lines: string[] = [];
  for (const block of blocks) {
    try {
      const line = serializeBlock(block);
      if (line) lines.push(line);
    } catch {
      // Never let one malformed block break the whole digest.
    }
  }
  if (lines.length === 0) return "";

  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

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

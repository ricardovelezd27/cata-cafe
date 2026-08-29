import "server-only";
import {
  DATASETS,
  DIMENSIONS,
  MEASURES,
  DATASET_DIMENSIONS,
  DATASET_MEASURES,
  parseInsightConfig,
} from "@/lib/analytics/types";
import type { AnalyticsScope } from "@/lib/analytics/types";
import { runInsightQuery, getDashboardData, getSessionSummaries } from "@/lib/analytics/queries";
import { dashboardNarrativeInputs, BASE_SYSTEM } from "./narratives";
import {
  parseBenchmarkFilter,
  getBenchmarkComparison,
  getOriginContext,
} from "@/lib/analytics/benchmarks";
import { COFFEE_COUNTRIES, normalizeCountry } from "@/lib/analytics/normalize";
import type { AiToolDef, AiToolResponse } from "./types";
import type { AiChatBlock } from "./chatTypes";

// Server-only tool layer for the "ask the data" chat: tool definitions passed
// to the model, and the executor that turns a validated tool call into a
// result. TOOL_DEFS enums are spread from lib/analytics/types.ts's whitelists
// — never hand-copied — so a new dataset/dimension/measure is picked up here
// automatically. Nothing in this file is imported by client code.

type Locale = "es" | "en";

export const DAILY_QUESTION_LIMIT = 25;
export const MAX_MODEL_CALLS = 4;
export const MAX_HISTORY_TURNS = 8;

export const TOOL_DEFS: AiToolDef[] = [
  {
    name: "run_insight",
    description:
      "Runs one aggregated group-by query over the cupping data visible to the current user (evaluations, sessions, coffees, or samples). Returns the top-N buckets as {label, value, count} only — never raw rows or individual evaluations.",
    parameters: {
      type: "object",
      properties: {
        dataset: {
          type: "string",
          enum: [...DATASETS],
          description: "Which dataset to query.",
        },
        dimension: {
          type: "string",
          enum: [...DIMENSIONS],
          description: "Field to group results by. Must be valid for the chosen dataset.",
        },
        measure: {
          type: "string",
          enum: [...MEASURES],
          description: "Value to aggregate per bucket. Must be valid for the chosen dataset.",
        },
        filters: {
          type: "object",
          properties: {
            dateFrom: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
            dateTo: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
          },
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of buckets to return (default 20).",
        },
      },
      required: ["dataset", "dimension", "measure"],
    },
  },
  {
    name: "get_dashboard_overview",
    description:
      "Returns headline KPIs for the visible data scope (coffees registered/cupped, sessions, evaluations, cuppers, average scores), a 12-month activity trend, top origins, top processes, the score distribution, and top flavor descriptors.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "run_benchmark",
    description:
      "Compares our CVA cupping scores against the external CQI arabica benchmark dataset, optionally filtered by origin country, process, and/or variety.",
    parameters: {
      type: "object",
      properties: {
        countryCode: { type: "string", description: "ISO-2 country code, e.g. CO, ET, KE." },
        processType: {
          type: "string",
          description: "Process type, e.g. Lavado, Natural, Honey, Anaeróbico.",
        },
        variety: { type: "string", description: "Coffee variety, e.g. Caturra, Bourbon." },
      },
    },
  },
  {
    name: "get_session_summary",
    description:
      "Looks up one cupping session by a (partial, case-insensitive) fragment of its name — or exactly by sessionId — and returns its aggregated summary: status, format, participation, and per-sample community/average scores. Returns a candidate list instead when several sessions match. Never returns raw evaluations, notes, or user identities.",
    parameters: {
      type: "object",
      properties: {
        nameQuery: {
          type: "string",
          minLength: 2,
          description: "Fragment of the session name, e.g. 'CAL agosto'.",
        },
        sessionId: {
          type: "string",
          description: "Exact session id from a previous candidates result.",
        },
      },
      required: ["nameQuery"],
    },
  },
  {
    name: "get_origin_context",
    description:
      "Returns FAO/OWID coffee production series for a country plus our own cupping activity there (evaluation counts and average scores by year).",
    parameters: {
      type: "object",
      properties: {
        countryCode: { type: "string", description: "ISO-2 country code, e.g. CO, ET, KE." },
      },
      required: ["countryCode"],
    },
  },
];

/** Renders the dataset → dimension/measure compatibility matrix as plain text. */
function compatibilityMatrix(): string {
  return DATASETS.map(
    (dataset) =>
      `- ${dataset}: dimensions [${DATASET_DIMENSIONS[dataset].join(", ")}]; measures [${DATASET_MEASURES[dataset].join(", ")}]`,
  ).join("\n");
}

export function buildChatSystem(locale: Locale, scope: AnalyticsScope): string {
  const languageRule =
    locale === "es" ? "Responde siempre en español." : "Always answer in English.";

  // Data-visibility framing. The scope is ENFORCED in the query layer — this
  // paragraph only aligns the model's claims with what the tools can return,
  // so a scoped user is never told a number is "platform-wide".
  const scopeRule =
    scope.kind === "platform"
      ? "SCOPE: You are serving the platform super admin. Tool results cover the ENTIRE platform — every user's sessions, evaluations, and coffees."
      : "SCOPE: You are serving a regular user, NOT a platform admin. Every tool result is limited to THIS user's own data: cupping sessions they created (including all evaluations inside them), their own evaluations in other people's sessions, and coffees they own or that are public/shared with them. Never present a figure as platform-wide, and if asked about other users' data or platform totals, explain that they only have access to their own data.";

  return `${BASE_SYSTEM}

You are now acting as an interactive data analyst: answer the user's questions about their aggregated cupping data using the tools provided (run_insight, get_dashboard_overview, run_benchmark, get_origin_context, get_session_summary). Do not answer from general knowledge or memory — use a tool for any question that needs a real number.

${scopeRule}

Valid dataset → dimension/measure combinations for run_insight:
${compatibilityMatrix()}

Rules:
- Use a tool for any numeric claim: counts, averages, trends, comparisons, rankings. Never invent, extrapolate, or estimate a figure that a tool has not returned.
- Use ONLY the figures returned by the tools in your answer.
- If your answer reuses a benchmark (CQI) or production/reference (FAO/OWID) figure that a tool returned earlier in this conversation, without calling that tool again this turn, name the source in the answer text (e.g. "según el benchmark de CQI…" / "according to the CQI benchmark…", "según datos de FAO/OWID…" / "according to FAO/OWID data…") so the citation is never silently dropped.
- For questions about one specific cupping session ("how did session X go / score"), call get_session_summary with a fragment of its name. If it returns multiple candidates, either ask the admin which one they mean or pick the obviously matching one and say which you picked. If it errors with session_not_found, say plainly that no session with that name exists — do not fall back to other tools for the same question.
- If a result is based on a small sample (n < 20), say so and soften the claim accordingly.
- Be concise — a few sentences, not a report.
- Reply in plain text only. No markdown tables, no headings, no code blocks.
- ${languageRule}

Privacy: never request or reveal a user's email address, name, or any raw evaluation notes/text. You only ever have access to aggregated numbers and labels — including per-session aggregates (community/average scores per sample from get_session_summary), which you may report.`;
}

/** Executes one validated tool call. Throws on any failure — the caller
 *  (app/actions/aiChat.ts) converts a throw into an error functionResponse. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  locale: Locale,
  scope: AnalyticsScope,
): Promise<{ block: AiChatBlock; toolResponse: AiToolResponse }> {
  switch (name) {
    case "run_insight": {
      const raw: Record<string, unknown> = { ...args, chartType: "bar" };
      if (typeof raw.limit === "string") {
        const n = Number(raw.limit);
        if (Number.isFinite(n)) raw.limit = n;
      }
      const config = parseInsightConfig(raw);
      const rows = await runInsightQuery(config, locale, scope);
      return {
        block: { tool: "run_insight", config, rows },
        toolResponse: {
          name,
          response: {
            rows: rows.map(({ key, label, value, count }) => ({ key, label, value, count })),
          },
        },
      };
    }

    case "get_dashboard_overview": {
      const data = await getDashboardData(locale, scope);
      const overview = dashboardNarrativeInputs(data);
      return {
        block: { tool: "get_dashboard_overview", overview },
        toolResponse: { name, response: { overview } },
      };
    }

    case "run_benchmark": {
      const filter = parseBenchmarkFilter(args);
      const comparison = await getBenchmarkComparison(filter, scope);
      return {
        block: {
          tool: "run_benchmark",
          filter: filter as Record<string, unknown>,
          comparison,
          citations: ["cqi_arabica"],
        },
        toolResponse: { name, response: { comparison } },
      };
    }

    case "get_session_summary": {
      const nameQuery = typeof args.nameQuery === "string" ? args.nameQuery.trim() : "";
      const sessionId =
        typeof args.sessionId === "string" && args.sessionId.trim() ? args.sessionId.trim() : undefined;
      if (!sessionId && nameQuery.length < 2) throw new Error("invalid_query");
      const result = await getSessionSummaries(nameQuery, sessionId, scope);
      if ("candidates" in result) {
        if (result.candidates.length === 0) throw new Error("session_not_found");
        return {
          block: { tool: "get_session_summary", summary: null, candidates: result.candidates },
          toolResponse: { name, response: { candidates: result.candidates } },
        };
      }
      return {
        block: { tool: "get_session_summary", summary: result.summary, candidates: null },
        toolResponse: { name, response: { summary: result.summary } },
      };
    }

    case "get_origin_context": {
      const raw = typeof args.countryCode === "string" ? args.countryCode.trim() : "";
      const direct = COFFEE_COUNTRIES.find((c) => c.iso2 === raw.toUpperCase());
      const code = direct?.iso2 ?? normalizeCountry(raw)?.iso2;
      if (!code) throw new Error("invalid_country");
      const context = await getOriginContext(code, locale, scope);
      return {
        block: { tool: "get_origin_context", countryCode: code, context, citations: ["owid_fao"] },
        toolResponse: { name, response: { context } },
      };
    }

    default:
      throw new Error("unknown_tool");
  }
}

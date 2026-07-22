import "server-only";
import {
  DATASETS,
  DIMENSIONS,
  MEASURES,
  DATASET_DIMENSIONS,
  DATASET_MEASURES,
  parseInsightConfig,
} from "@/lib/analytics/types";
import { runInsightQuery, getDashboardData } from "@/lib/analytics/queries";
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
      "Runs one aggregated group-by query over the platform's cupping data (evaluations, sessions, coffees, or samples). Returns the top-N buckets as {label, value, count} only — never raw rows or individual evaluations.",
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
      "Returns platform-wide KPIs (coffees registered/cupped, sessions, evaluations, users, average scores), a 12-month activity trend, top origins, top processes, the score distribution, and top flavor descriptors.",
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

export function buildChatSystem(locale: Locale): string {
  const languageRule =
    locale === "es" ? "Responde siempre en español." : "Always answer in English.";

  return `${BASE_SYSTEM}

You are now acting as an interactive data analyst: answer the admin's questions about the platform's aggregated cupping data using the tools provided (run_insight, get_dashboard_overview, run_benchmark, get_origin_context). Do not answer from general knowledge or memory — use a tool for any question that needs a real number.

Valid dataset → dimension/measure combinations for run_insight:
${compatibilityMatrix()}

Rules:
- Use a tool for any numeric claim: counts, averages, trends, comparisons, rankings. Never invent, extrapolate, or estimate a figure that a tool has not returned.
- Use ONLY the figures returned by the tools in your answer.
- If your answer reuses a benchmark (CQI) or production/reference (FAO/OWID) figure that a tool returned earlier in this conversation, without calling that tool again this turn, name the source in the answer text (e.g. "según el benchmark de CQI…" / "according to the CQI benchmark…", "según datos de FAO/OWID…" / "according to FAO/OWID data…") so the citation is never silently dropped.
- If a result is based on a small sample (n < 20), say so and soften the claim accordingly.
- Be concise — a few sentences, not a report.
- Reply in plain text only. No markdown tables, no headings, no code blocks.
- ${languageRule}

Privacy: never request or reveal a user's email address, name, or any raw evaluation notes/text. You only ever have access to aggregated numbers and labels.`;
}

/** Executes one validated tool call. Throws on any failure — the caller
 *  (app/actions/aiChat.ts) converts a throw into an error functionResponse. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  locale: Locale,
): Promise<{ block: AiChatBlock; toolResponse: AiToolResponse }> {
  switch (name) {
    case "run_insight": {
      const raw: Record<string, unknown> = { ...args, chartType: "bar" };
      if (typeof raw.limit === "string") {
        const n = Number(raw.limit);
        if (Number.isFinite(n)) raw.limit = n;
      }
      const config = parseInsightConfig(raw);
      const rows = await runInsightQuery(config, locale);
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
      const data = await getDashboardData(locale);
      const overview = dashboardNarrativeInputs(data);
      return {
        block: { tool: "get_dashboard_overview", overview },
        toolResponse: { name, response: { overview } },
      };
    }

    case "run_benchmark": {
      const filter = parseBenchmarkFilter(args);
      const comparison = await getBenchmarkComparison(filter);
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

    case "get_origin_context": {
      const raw = typeof args.countryCode === "string" ? args.countryCode.trim() : "";
      const direct = COFFEE_COUNTRIES.find((c) => c.iso2 === raw.toUpperCase());
      const code = direct?.iso2 ?? normalizeCountry(raw)?.iso2;
      if (!code) throw new Error("invalid_country");
      const context = await getOriginContext(code, locale);
      return {
        block: { tool: "get_origin_context", countryCode: code, context, citations: ["owid_fao"] },
        toolResponse: { name, response: { context } },
      };
    }

    default:
      throw new Error("unknown_tool");
  }
}

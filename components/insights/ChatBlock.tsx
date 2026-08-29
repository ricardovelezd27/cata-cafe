"use client";

import { InsightChart } from "@/components/insights/InsightChart";
import type { AiChatBlock } from "@/lib/ai/chatTypes";
import type { ChatTranslations } from "@/components/insights/ChatPanel";

// Renders one executed-tool result inline in a chat bubble. Discriminated on
// block.tool. Deliberately defensive throughout — a missing/unexpected field
// from the model or a future tool-shape change renders nothing for that
// piece rather than throwing and breaking the whole conversation.

interface ChatBlockProps {
  block: AiChatBlock;
  t: ChatTranslations;
}

function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const CARD_CLASS = "bg-white rounded-card border border-[#E8E0D0] p-3 mt-2";
const CAPTION_CLASS = "text-xs font-semibold text-brown-mid uppercase tracking-wide mb-2";

function MiniTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E8E0D0] text-left">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`py-1.5 pr-3 text-xs font-semibold text-brown-mid uppercase tracking-wide ${
                  i > 0 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[#F5F0E6] last:border-0">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-1.5 pr-3 ${
                    ci === 0 ? "text-brown-dark" : "text-right text-brown-dark tabular-nums"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChatBlock({ block, t }: ChatBlockProps) {
  if (block.tool === "run_insight") {
    const { config, rows } = block;
    if (!config || !Array.isArray(rows)) return null;
    const dimensionLabel = t.explorer.dimensions[config.dimension] ?? config.dimension;
    const measureLabel = t.explorer.measures[config.measure] ?? config.measure;
    const chartType = rows.length > 12 || config.chartType === "table" ? "table" : config.chartType;
    return (
      <div className={CARD_CLASS}>
        <div className={CAPTION_CLASS}>
          {dimensionLabel} &times; {measureLabel}
        </div>
        <InsightChart
          rows={rows}
          chartType={chartType}
          valueLabel={measureLabel}
          dimensionLabel={dimensionLabel}
          countLabel={t.explorer.tableCount}
          emptyLabel={t.explorer.chartEmpty}
        />
      </div>
    );
  }

  if (block.tool === "run_benchmark") {
    const { comparison } = block;
    if (!comparison?.mine || !comparison?.benchmark) return null;
    return (
      <div className={CARD_CLASS}>
        <MiniTable
          headers={["", t.benchmark.mine, t.benchmark.benchmark]}
          rows={[
            [t.benchmark.n, formatNumber(comparison.mine.n), formatNumber(comparison.benchmark.n)],
            [
              t.benchmark.avg,
              formatNumber(comparison.mine.avg),
              formatNumber(comparison.benchmark.avg),
            ],
            [t.benchmark.min, formatNumber(comparison.mine.min), "—"],
            [t.benchmark.max, formatNumber(comparison.mine.max), "—"],
            [t.benchmark.p25, "—", formatNumber(comparison.benchmark.p25)],
            [t.benchmark.p75, "—", formatNumber(comparison.benchmark.p75)],
          ]}
        />
      </div>
    );
  }

  if (block.tool === "get_session_summary") {
    const { summary, candidates } = block;
    if (Array.isArray(candidates) && candidates.length > 0) {
      return (
        <div className={CARD_CLASS}>
          <div className={CAPTION_CLASS}>{t.session.candidatesTitle}</div>
          <ul className="flex flex-col gap-1 text-sm text-brown-dark">
            {candidates.map((c) => (
              <li key={c.id}>
                {c.name} &middot; {c.date} &middot; {c.status}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (!summary || !Array.isArray(summary.samples)) return null;
    return (
      <div className={CARD_CLASS}>
        <div className={CAPTION_CLASS}>
          {summary.name} &middot; {summary.date} &middot; {summary.status}
        </div>
        <MiniTable
          headers={[t.session.sample, t.session.community, t.session.average, t.session.submitted]}
          rows={summary.samples.map((sm) => [
            sm.coffeeName ? `${sm.label} · ${sm.coffeeName}` : sm.label,
            formatNumber(sm.communityScore),
            formatNumber(sm.avgRawScore),
            formatNumber(sm.submittedCount),
          ])}
        />
      </div>
    );
  }

  if (block.tool === "get_origin_context") {
    const production = block.context?.production;
    const myActivity = block.context?.myActivity;
    if (!Array.isArray(production) || production.length === 0) return null;
    const activityByYear = new Map((myActivity ?? []).map((a) => [a.year, a]));
    const recent = production.slice(-10);
    return (
      <div className={CARD_CLASS}>
        <MiniTable
          headers={[t.origin.year, t.origin.production, t.origin.myActivity]}
          rows={recent.map((p) => {
            const activity = activityByYear.get(p.year);
            const activityCell =
              activity && activity.evaluations > 0
                ? activity.avgScore != null
                  ? `${activity.evaluations} (${formatNumber(activity.avgScore)})`
                  : String(activity.evaluations)
                : "—";
            return [String(p.year), formatNumber(p.value), activityCell];
          })}
        />
      </div>
    );
  }

  if (block.tool === "get_dashboard_overview") {
    const overview = block.overview;
    if (!overview || typeof overview !== "object") return null;
    const kpis =
      "kpis" in overview && typeof overview.kpis === "object" && overview.kpis !== null
        ? (overview.kpis as Record<string, unknown>)
        : overview;
    const chips = Object.entries(kpis).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    );
    if (chips.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map(([key, value]) => (
          <div
            key={key}
            className="rounded-pill bg-cream border border-[#E8E0D0] px-3 py-1.5 flex flex-col items-start gap-0.5"
          >
            <span className="text-[10px] font-semibold text-brown-mid uppercase tracking-wide">
              {t.overview[key] ?? key}
            </span>
            <span className="text-sm font-semibold text-brown-dark tabular-nums">
              {formatNumber(value)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

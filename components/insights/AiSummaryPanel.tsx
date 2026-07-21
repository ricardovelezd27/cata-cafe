"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { generateDashboardNarrative, generateInsightNarrative } from "@/app/actions/ai";
import type { CachedAiResult } from "@/lib/ai/cache";
import type { NarrativeContent } from "@/lib/ai/narratives";

export interface AiSummaryTranslations {
  generate: string;
  generating: string;
  regenerate: string;
  disclaimer: string;
  notConfigured: string;
  error: string;
}

export type AiSummaryTarget = { kind: "dashboard" } | { kind: "insight"; config: unknown };

interface AiSummaryPanelProps {
  locale: string;
  target: AiSummaryTarget;
  translations: AiSummaryTranslations;
}

/**
 * Card matching the insights design, collapsed by default to a single "Generate
 * AI summary" button — generation is never triggered automatically since it
 * costs money. For target "insight" the result re-collapses whenever the
 * config prop changes identity (new dataset/dimension/measure combo), so a
 * stale narrative for a different query is never shown.
 */
export function AiSummaryPanel({ locale, target, translations: t }: AiSummaryPanelProps) {
  const [result, setResult] = useState<CachedAiResult<NarrativeContent> | null>(null);
  const [isPending, startTransition] = useTransition();

  // Re-collapse whenever the insight config changes identity — computed during
  // render (not an effect) per React's "adjust state on prop change" pattern,
  // so there's no extra render/flicker.
  const configKey = target.kind === "insight" ? JSON.stringify(target.config) : null;
  const [prevConfigKey, setPrevConfigKey] = useState(configKey);
  if (configKey !== prevConfigKey) {
    setPrevConfigKey(configKey);
    setResult(null);
  }

  function generate(force: boolean) {
    startTransition(async () => {
      const res =
        target.kind === "dashboard"
          ? await generateDashboardNarrative(locale, force)
          : await generateInsightNarrative(target.config, locale, force);
      setResult(res);
    });
  }

  const content = result?.ok ? result.content : null;
  const skipped = result != null && !result.ok && result.skipped === true;
  const errored = result != null && !result.ok && !result.skipped;

  return (
    <div className="bg-cream rounded-xl border border-[#E8E0D0] shadow-card p-5">
      {isPending ? (
        <div className="flex items-center gap-2 text-sm text-brown-mid animate-pulse">
          <Sparkles size={16} />
          {t.generating}
        </div>
      ) : content ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-brown-dark leading-snug">
            {content.headline}
          </h3>
          <div className="flex flex-col gap-2 text-sm text-brown-dark leading-relaxed">
            {content.body
              .split(/\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
          {content.highlights.length > 0 && (
            <ul className="list-disc pl-5 flex flex-col gap-1 text-sm text-brown-dark">
              {content.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-[#E8E0D0]">
            <span className="text-[11px] text-brown-mid/70">
              {t.disclaimer}
              {result?.ok ? ` · ${result.model}` : ""}
            </span>
            <button
              type="button"
              onClick={() => generate(true)}
              className="flex items-center gap-1 text-xs font-semibold text-[#3D5A3E] hover:underline shrink-0"
            >
              <RefreshCw size={12} />
              {t.regenerate}
            </button>
          </div>
        </div>
      ) : skipped ? (
        <p className="text-sm text-brown-mid">{t.notConfigured}</p>
      ) : errored ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-red-defect">{t.error}</span>
          <button
            type="button"
            onClick={() => generate(false)}
            className="text-xs font-semibold text-[#3D5A3E] hover:underline shrink-0"
          >
            {t.regenerate}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => generate(false)}
          className="flex items-center gap-2 text-sm font-semibold text-[#3D5A3E] hover:underline"
        >
          <Sparkles size={16} />
          {t.generate}
        </button>
      )}
    </div>
  );
}

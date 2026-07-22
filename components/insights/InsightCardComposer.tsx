"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toPng } from "html-to-image";
import { Check, Copy, ImageDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { generateLinkedInDraft } from "@/app/actions/ai";
import { runInsight, runPivot } from "@/app/actions/analytics";
import { isPivotConfigLike } from "@/lib/analytics/types";
import type {
  ChartType,
  DimensionId,
  InsightConfig,
  InsightRow,
  MeasureId,
  PivotConfig,
  PivotResult,
} from "@/lib/analytics/types";
import type { CachedAiResult } from "@/lib/ai/cache";
import type { LinkedInContent } from "@/lib/ai/narratives";
import { InsightChart } from "@/components/insights/InsightChart";
import { PivotTable } from "@/components/insights/PivotTable";
import { PivotChart } from "@/components/insights/PivotChart";
import { useContainerWidth } from "@/hooks/useContainerWidth";

export interface ShareComposerTranslations {
  headline: string;
  headlinePh: string;
  downloadPng: string;
  generateTexts: string;
  postEs: string;
  postEn: string;
  copy: string;
  copied: string;
  exportError: string;
  countLabel: string;
  emptyLabel: string;
  measureLabels: Record<MeasureId, string>;
  dimensionLabels: Record<DimensionId, string>;
  pivot: {
    total: string;
    grandTotal: string;
    /** ICU-style template with a `{count}` placeholder, interpolated locally. */
    countHint: string;
    empty: string;
  };
  ai: {
    generating: string;
    regenerate: string;
    disclaimer: string;
    notConfigured: string;
    error: string;
  };
}

interface InsightCardComposerProps {
  locale: string;
  /** Already-validated snapshot of whichever builder is active in the Explorer. */
  config: InsightConfig | PivotConfig;
  citationLines: string[];
  t: ShareComposerTranslations;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

// The compact card box (1080x340) fits a heatmap PivotTable legibly up to this
// size; larger cross-tabs fall back to a grouped PivotChart instead.
const PIVOT_TABLE_MAX_ROWS = 10;
const PIVOT_TABLE_MAX_COLS = 7;

const inputClass =
  "w-full rounded-input border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";

function emptyPivotResult(measure: MeasureId): PivotResult {
  return {
    measure,
    rowKeys: [],
    colKeys: [],
    cells: {},
    rowTotals: {},
    colTotals: {},
    grandTotal: { value: null, count: 0 },
  };
}

export function InsightCardComposer({ locale, config, citationLines, t }: InsightCardComposerProps) {
  const pivot = isPivotConfigLike(config);

  const [headline, setHeadline] = useState("");
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [pivotResult, setPivotResult] = useState<PivotResult | null>(null);
  const [dataPending, startDataTransition] = useTransition();

  const [liResult, setLiResult] = useState<CachedAiResult<LinkedInContent> | null>(null);
  const [liPending, startLiTransition] = useTransition();

  const [copied, setCopied] = useState<"es" | "en" | null>(null);
  const [exportError, setExportError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const { ref: scaleRef, width: containerWidth } = useContainerWidth();
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / CARD_WIDTH) : 0;

  // Reset on config change — adjusted during render (React's "adjust state on
  // prop change" pattern, same as PivotBuilder's loadKey guard), not inside
  // the effect below: an effect body calling setState synchronously trips
  // react-hooks/set-state-in-effect. config is a frozen snapshot taken once
  // when the modal opened, so in practice this fires once per mount — the
  // reference-identity check keeps it correct if a future caller ever swaps
  // the config while the composer stays mounted.
  const [prevConfig, setPrevConfig] = useState(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    setRows(null);
    setPivotResult(null);
  }

  // Fetch fresh data for the seeded config (a genuine external side effect).
  useEffect(() => {
    startDataTransition(async () => {
      if (isPivotConfigLike(config)) {
        const result = await runPivot(config, locale);
        setPivotResult(result.ok ? result.result : emptyPivotResult((config as PivotConfig).measure));
      } else {
        const result = await runInsight(config, locale);
        setRows(result.ok ? result.rows : []);
      }
    });
  }, [config, locale]);

  function generateTexts(force: boolean) {
    startLiTransition(async () => {
      const res = await generateLinkedInDraft(config, headline.trim() || null, force);
      setLiResult(res);
    });
  }

  async function copyText(lang: "es" | "en", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(lang);
      setTimeout(() => setCopied((c) => (c === lang ? null : c)), 1500);
    } catch {
      // Clipboard API unavailable — silently ignore, the text is still selectable.
    }
  }

  async function handleDownloadPng() {
    if (!cardRef.current) return;
    setExportError(false);
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#FDFBF7",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
      const link = document.createElement("a");
      link.download = "cata-cafe-insight.png";
      link.href = dataUrl;
      link.click();
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  const displayHeadline = headline.trim();
  const headlineSize = displayHeadline.length > 60 ? 32 : displayHeadline.length > 36 ? 42 : 54;
  const chartType: ChartType = pivot ? "bar" : (config as InsightConfig).chartType;
  const valueLabel = t.measureLabels[config.measure];
  const dimensionLabel = pivot ? "" : t.dimensionLabels[(config as InsightConfig).dimension];
  const dateLabel = new Date().toLocaleDateString(locale === "en" ? "en-US" : "es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const liContent = liResult?.ok ? liResult.content : null;
  const liSkipped = liResult != null && !liResult.ok && liResult.skipped === true;
  const liErrored = liResult != null && !liResult.ok && !liResult.skipped;
  const rowsLoading = pivot
    ? dataPending || pivotResult === null
    : dataPending || rows === null;

  const showPivotTable =
    pivotResult !== null &&
    pivotResult.rowKeys.length <= PIVOT_TABLE_MAX_ROWS &&
    pivotResult.colKeys.length <= PIVOT_TABLE_MAX_COLS;

  return (
    // Single column always: the only caller now is ResponsiveDialog, whose
    // desktop width is capped at min(32rem, 100vw-48px) = 512px regardless of
    // the viewport — the old lg:grid-cols-2 was a VIEWPORT breakpoint (not a
    // container query) and would still fire on any desktop-width screen,
    // squeezing two columns into that 512px dialog.
    <div className="grid grid-cols-1 gap-5 items-start">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.headline}
            </span>
            <input
              type="text"
              className={inputClass}
              value={headline}
              maxLength={90}
              placeholder={t.headlinePh}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-pill bg-[#3D5A3E] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />}
              {t.downloadPng}
            </button>
            <button
              type="button"
              onClick={() => generateTexts(false)}
              disabled={liPending}
              className="flex items-center gap-1.5 rounded-pill border border-[#E8E0D0] bg-white text-sm font-semibold text-brown-dark px-4 py-2 disabled:opacity-50 hover:border-[#3D5A3E] hover:text-[#3D5A3E]"
            >
              <Sparkles size={15} />
              {t.generateTexts}
            </button>
          </div>
          {exportError && <p className="text-sm text-red-defect">{t.exportError}</p>}
        </div>

        {(liPending || liResult) && (
          <div className="bg-cream rounded-card border border-[#E8E0D0] shadow-card p-5">
            {liPending ? (
              <div className="flex items-center gap-2 text-sm text-brown-mid animate-pulse">
                <Sparkles size={16} />
                {t.ai.generating}
              </div>
            ) : liContent ? (
              <div className="flex flex-col gap-4">
                <PostBlock
                  label={t.postEs}
                  text={liContent.es}
                  lang="es"
                  copied={copied === "es"}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                  onCopy={copyText}
                />
                <PostBlock
                  label={t.postEn}
                  text={liContent.en}
                  lang="en"
                  copied={copied === "en"}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                  onCopy={copyText}
                />
                {liContent.hashtags.length > 0 && (
                  <p className="text-xs text-[#3D5A3E] font-medium">
                    {liContent.hashtags.map((h) => `#${h}`).join(" ")}
                  </p>
                )}
                <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-[#E8E0D0]">
                  <span className="text-[11px] text-brown-mid/70">
                    {t.ai.disclaimer}
                    {liResult?.ok ? ` · ${liResult.model}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => generateTexts(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#3D5A3E] hover:underline shrink-0"
                  >
                    <RefreshCw size={12} />
                    {t.ai.regenerate}
                  </button>
                </div>
              </div>
            ) : liSkipped ? (
              <p className="text-sm text-brown-mid">{t.ai.notConfigured}</p>
            ) : liErrored ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-red-defect">{t.ai.error}</span>
                <button
                  type="button"
                  onClick={() => generateTexts(false)}
                  className="text-xs font-semibold text-[#3D5A3E] hover:underline shrink-0"
                >
                  {t.ai.regenerate}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
        <div
          ref={scaleRef}
          className="relative w-full overflow-hidden"
          style={{ height: CARD_HEIGHT * scale }}
        >
          <div
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              transform: `scale(${scale || 1})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <div
              ref={cardRef}
              className="flex flex-col justify-between px-16 py-10 shrink-0"
              style={{ width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: "#FDFBF7" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-2xl" style={{ color: "#3D5A3E" }}>
                  Cata Café
                </span>
                <span className="text-sm text-brown-mid">catacafe.app</span>
              </div>

              <div className="flex-1 flex flex-col justify-center gap-6 min-h-0">
                <h1
                  className="font-display text-brown-dark leading-tight"
                  style={{
                    fontSize: headlineSize,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {displayHeadline}
                </h1>

                {rowsLoading ? (
                  <div style={{ width: 1080, height: 340 }} className="flex items-center justify-center">
                    <Loader2 className="animate-spin text-brown-mid" size={22} />
                  </div>
                ) : (
                  <div style={{ width: 1080, height: 340 }} className="overflow-hidden">
                    {pivot ? (
                      showPivotTable ? (
                        <PivotTable
                          result={pivotResult as PivotResult}
                          heatmap
                          measureLabel={valueLabel}
                          t={{
                            total: t.pivot.total,
                            grandTotal: t.pivot.grandTotal,
                            countHint: t.pivot.countHint,
                            empty: t.pivot.empty,
                          }}
                        />
                      ) : (
                        <PivotChart
                          result={pivotResult as PivotResult}
                          view="grouped"
                          measureLabel={valueLabel}
                          t={{ empty: t.pivot.empty }}
                        />
                      )
                    ) : (
                      <InsightChart
                        rows={rows ?? []}
                        chartType={chartType}
                        valueLabel={valueLabel}
                        dimensionLabel={dimensionLabel}
                        countLabel={t.countLabel}
                        emptyLabel={t.emptyLabel}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-[9px] text-brown-mid/60 truncate max-w-[820px]">
                  {citationLines.join(" · ")}
                </p>
                <span className="text-[10px] text-brown-mid/70 shrink-0">{dateLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostBlock({
  label,
  text,
  lang,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string;
  text: string;
  lang: "es" | "en";
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: (lang: "es" | "en", text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">{label}</span>
        <button
          type="button"
          onClick={() => onCopy(lang, text)}
          className="flex items-center gap-1 text-xs font-semibold text-[#3D5A3E] hover:underline"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-brown-dark bg-white border border-[#E8E0D0] rounded-card p-3">
        {text}
      </pre>
    </div>
  );
}

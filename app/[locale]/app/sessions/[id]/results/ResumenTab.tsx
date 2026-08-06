"use client";

import { ChevronRight } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScorePill, InfoHint } from "@/components/ui";
import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import type { SessionFormat } from "@/lib/constants";
import type { SampleBlockFreq } from "@/components/results/DescriptorFrequency";
import type { SampleResult, ResultsHelp } from "./types";

// Priority order for picking the single consensus sentence to show per
// sample in the Highlights card — mirrors the perceptual-block order used
// throughout the Descriptores tab. "general" is deliberately excluded here:
// it is only used as the (block-sentence) fallback, never picked first.
const SUMMARY_PRIORITY = ["nariz", "boca", "gusto", "acidez", "dulzura", "sensacion"];

type ResumenTabTranslations = {
  statSamples: string;
  statParticipation: string;
  statAvg: string;
  statBest: string;
  statAvgMine: string;
  statAvgCommunity: string;
  ranking: string;
  notScored: string;
  performance: string;
  myAvg: string;
  communityAvg: string;
  alignmentLabel: string;
  alignmentNote: string;
  highlights: string;
  soloTopDescriptors: string;
  viewInDescriptors: string;
  communityPending: string;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function hasAnyEvalData(sample: SampleResult): boolean {
  return (
    Object.keys(sample.descriptive).length > 0 ||
    Object.keys(sample.affective).length > 0 ||
    Object.keys(sample.combined).length > 0
  );
}

/** First non-null summary sentence in perceptual-block priority order, or the
 * top-3 "general" descriptor labels when every block sentence is null. `null`
 * when there is genuinely nothing to show (row should be skipped). */
function consensusLine(
  sample: SampleBlockFreq,
  isSolo: boolean,
  t: ResumenTabTranslations,
): string | null {
  const generalTop3 = (sample.blocks.general ?? []).slice(0, 3).map((d) => d.label);

  if (isSolo) {
    if (generalTop3.length === 0) return null;
    return `${t.soloTopDescriptors}: ${generalTop3.join(", ")}`;
  }

  for (const blockId of SUMMARY_PRIORITY) {
    const sentence = sample.summary[blockId];
    if (sentence) return sentence;
  }
  if (generalTop3.length === 0) return null;
  return generalTop3.join(", ");
}

export function ResumenTab({
  samples,
  format,
  cupsPerSample,
  isGroup,
  canViewGroup,
  participation,
  myAlignment,
  descriptorFrequency,
  isSoloDescriptors,
  locale,
  onOpenSample,
  onOpenDescriptors,
  t,
  help,
}: {
  samples: SampleResult[];
  format: SessionFormat;
  cupsPerSample: number;
  isGroup: boolean;
  canViewGroup: boolean;
  participation: { submitted: number; total: number } | null;
  myAlignment: { alignment: number; matches: number; opportunities: number } | null;
  descriptorFrequency: SampleBlockFreq[] | null;
  isSoloDescriptors: boolean;
  locale: string;
  onOpenSample: (sampleId: string) => void;
  onOpenDescriptors: (sampleId: string | null) => void;
  t: ResumenTabTranslations;
  help: ResultsHelp;
}) {
  // Display-only score derivation — never stored. Descriptive sessions carry
  // no scores at all.
  const myScoreFor = (sample: SampleResult): number | null => {
    if (format === "descriptive") return null;
    const data = format === "combined" ? sample.combined : sample.affective;
    if (!hasAffectiveData(data)) return null;
    const score = calcIndividualScore(data, cupsPerSample);
    return typeof score === "number" ? score : null;
  };

  const rankScoreFor = (sample: SampleResult): number | null => {
    if (format === "descriptive") return null;
    if (isGroup && canViewGroup) {
      const community = sample.aggregateScore?.communityScore ?? null;
      if (community !== null) return community;
    }
    return myScoreFor(sample);
  };

  const ranked = samples
    .map((sample, position) => ({ sample, position, score: rankScoreFor(sample) }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.position - b.position;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.position - b.position;
    });

  // ---- Stat row ----
  const evaluatedCount = samples.filter(hasAnyEvalData).length;
  const rankScores = ranked
    .map((r) => r.score)
    .filter((v): v is number => v !== null);
  const avgScore = average(rankScores);
  const bestEntry = ranked.find((r) => r.score !== null) ?? null;

  // ---- Performance card (my average vs community average) ----
  const myScores = samples.map(myScoreFor).filter((v): v is number => v !== null);
  const myAvg = average(myScores);
  const communityScores = samples
    .map((s) => s.aggregateScore?.communityScore ?? null)
    .filter((v): v is number => v !== null);
  const communityAvg = average(communityScores);
  const delta = myAvg !== null && communityAvg !== null ? myAvg - communityAvg : null;

  // Don't render an all-dashes card: performance needs at least one real average.
  const showPerformance =
    isGroup &&
    canViewGroup &&
    format !== "descriptive" &&
    (myAvg !== null || communityAvg !== null);
  const showCommunityPending = isGroup && !canViewGroup;

  // Pre-compute the highlight lines so an all-empty card is hidden entirely.
  const highlightRows = (format !== "affective" ? (descriptorFrequency ?? []) : [])
    .map((sample) => ({ sample, line: consensusLine(sample, isSoloDescriptors, t) }))
    .filter((r): r is { sample: (typeof r)["sample"]; line: string } => r.line !== null);
  const showHighlights = highlightRows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat row */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <InfoHint title={help.stats.title} body={help.stats.body} closeLabel={help.closeLabel} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t.statSamples}
            value={`${evaluatedCount}/${samples.length}`}
            subtext=""
          />
          {participation && (
            <StatCard
              label={t.statParticipation}
              value={`${participation.submitted} ${locale === "en" ? "of" : "de"} ${participation.total}`}
              subtext=""
            />
          )}
          <StatCard
            label={t.statAvg}
            value={avgScore !== null ? avgScore.toFixed(2) : "—"}
            subtext={canViewGroup && isGroup ? t.statAvgCommunity : t.statAvgMine}
          />
          <StatCard
            label={t.statBest}
            value={bestEntry ? bestEntry.score!.toFixed(2) : "—"}
            subtext={
              bestEntry
                ? bestEntry.sample.label +
                  (bestEntry.sample.revealed && bestEntry.sample.coffee
                    ? ` · ${bestEntry.sample.coffee.name}`
                    : "")
                : ""
            }
            accent
          />
        </div>
      </div>

      {/* Main row: ranking + performance/pending */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* Ranking */}
        <div className="flex flex-col gap-3">
          <h2 className="inline-flex items-center gap-1.5 font-display text-xl text-primary-container">
            {t.ranking}
            <InfoHint title={help.ranking.title} body={help.ranking.body} closeLabel={help.closeLabel} />
          </h2>
          <div className="flex flex-col gap-2">
            {ranked.map(({ sample, score }, idx) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => onOpenSample(sample.id)}
                className="min-h-[44px] flex w-full items-center gap-3 rounded-card border border-outline-variant bg-surface-container-lowest px-4 py-3 text-left transition-colors hover:bg-surface-container-high"
              >
                <span className="w-8 shrink-0 font-display text-2xl tabular-nums text-on-surface-variant">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-on-surface">{sample.label}</div>
                  {sample.revealed && sample.coffee && (
                    <div className="truncate text-xs text-on-surface-variant">
                      {sample.coffee.name}
                    </div>
                  )}
                </div>
                {score !== null ? (
                  <ScorePill score={score} />
                ) : (
                  <span className="shrink-0 text-xs text-on-surface-variant">
                    {t.notScored}
                  </span>
                )}
                <ChevronRight size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
              </button>
            ))}
          </div>
        </div>

        {/* Performance / community pending */}
        {showPerformance ? (
          <div className="flex flex-col gap-4 rounded-card border border-outline-variant bg-surface-container-lowest p-5">
            <h3 className="inline-flex items-center gap-1.5 font-display text-xl text-primary-container">
              {t.performance}
              <InfoHint
                title={help.performance.title}
                body={help.performance.body}
                closeLabel={help.closeLabel}
              />
            </h3>
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-3xl tabular-nums text-on-surface">
                  {myAvg !== null ? myAvg.toFixed(2) : "—"}
                </span>
                <span className="text-xs text-on-surface-variant">{t.myAvg}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-display text-3xl tabular-nums text-on-surface">
                  {communityAvg !== null ? communityAvg.toFixed(2) : "—"}
                </span>
                <span className="text-xs text-on-surface-variant">{t.communityAvg}</span>
              </div>
            </div>
            {delta !== null && (
              <span
                className={`text-sm font-semibold tabular-nums ${
                  delta >= 0 ? "text-primary-container" : "text-secondary"
                }`}
              >
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(2)}
              </span>
            )}
            {myAlignment && myAlignment.opportunities > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-on-surface-variant">
                  {t.alignmentLabel}
                </span>
                <div className="h-2 overflow-hidden rounded-pill bg-surface-container-high">
                  <div
                    className="h-full rounded-pill bg-primary-container"
                    style={{ width: `${myAlignment.alignment * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-on-surface-variant">
                  {Math.round(myAlignment.alignment * 100)}%
                </span>
                <span className="text-xs text-on-surface-variant">{t.alignmentNote}</span>
              </div>
            )}
          </div>
        ) : showCommunityPending ? (
          <div className="rounded-card border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            {t.communityPending}
          </div>
        ) : null}
      </div>

      {/* Highlights */}
      {showHighlights && (
        <div className="flex flex-col gap-1 rounded-card border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="mb-2 inline-flex items-center gap-1.5 font-display text-xl text-primary-container">
            {t.highlights}
            <InfoHint
              title={help.highlights.title}
              body={help.highlights.body}
              closeLabel={help.closeLabel}
            />
          </h2>
          {highlightRows.map(({ sample, line }) => {
            return (
              <div
                key={sample.sampleId}
                className="flex min-h-[44px] items-center gap-3 border-t border-outline-variant py-2 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-on-surface">
                    {sample.label}
                  </div>
                  <div className="truncate text-xs text-on-surface-variant">{line}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenDescriptors(sample.sampleId)}
                  className="shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium text-primary-container transition-colors hover:bg-primary-fixed"
                >
                  {t.viewInDescriptors}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

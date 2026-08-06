"use client";

import { type ReactNode } from "react";

/**
 * Owner-only cupper alignment panel (N15, Step 4). Shows how closely each
 * cupper's descriptor selections match the group consensus (majority sets),
 * ranked most → least aligned. Informational only — never affects scores.
 * Excluded cuppers are dropped from the consensus (upstream) but still shown,
 * flagged, at the bottom.
 */

export type CupperAlignmentRow = {
  id: string;
  name: string;
  excluded: boolean;
  alignment: number; // 0..1, across every sample
  matches: number;
  opportunities: number;
  /** Per-sample split of the same matches/opportunities (sums to the totals above). */
  bySample: Record<string, { matches: number; opportunities: number }>;
};

export type AlignmentTranslations = {
  title: string;
  subtitle: string;
  excluded: string;
  noData: string;
};

function barToneClass(excluded: boolean, pct: number): string {
  if (excluded) return "bg-surface-container-high";
  if (pct >= 75) return "bg-primary-container";
  if (pct >= 50) return "bg-secondary";
  return "bg-error";
}

export function CupperAlignment({
  rows,
  sampleFilter,
  t,
  titleAction,
}: {
  rows: CupperAlignmentRow[];
  /** Scope the displayed pct/bar to one sample's matches/opportunities; null/undefined = totals. */
  sampleFilter?: string | null;
  t: AlignmentTranslations;
  /** Optional node rendered inline after the title (e.g. an InfoHint). */
  titleAction?: ReactNode;
}) {
  // Resolve the DISPLAYED matches/opportunities per row (either the session
  // totals, or one sample's split), then rank by that same displayed value —
  // a sample-scoped view can reorder rows relative to the session-wide one.
  const displayed = rows.map((r) => {
    const source = sampleFilter ? (r.bySample[sampleFilter] ?? { matches: 0, opportunities: 0 }) : r;
    return {
      ...r,
      displayMatches: source.matches,
      displayOpportunities: source.opportunities,
      displayAlignment: source.opportunities > 0 ? source.matches / source.opportunities : 0,
    };
  });

  const sorted = [...displayed].sort((a, b) => {
    // Included cuppers first (by displayed alignment desc), excluded last.
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.displayAlignment - a.displayAlignment;
  });

  const hasData = sorted.some((r) => r.displayOpportunities > 0);

  return (
    <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-1 inline-flex items-center gap-1.5 font-display text-[15px] font-semibold text-primary-container">
        {t.title}
        {titleAction}
      </div>
      <div className="mb-3.5 text-[11px] leading-snug text-on-surface-variant">
        {t.subtitle}
      </div>

      {!hasData ? (
        <div className="text-xs italic text-on-surface-variant">{t.noData}</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((r) => {
            const pct = Math.round(r.displayAlignment * 100);
            return (
              <div key={r.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${
                      r.excluded ? "text-on-surface-variant" : "text-on-surface"
                    }`}
                  >
                    {r.name}
                    {r.excluded && (
                      <span className="font-normal text-on-surface-variant"> {t.excluded}</span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
                      r.excluded ? "text-on-surface-variant" : "text-on-surface"
                    }`}
                  >
                    {r.displayOpportunities > 0 ? `${pct}%` : "—"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-pill bg-surface-container-high">
                  <div
                    className={`h-full rounded-pill transition-[width] duration-300 ${barToneClass(r.excluded, pct)}`}
                    style={{ width: `${r.displayOpportunities > 0 ? pct : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

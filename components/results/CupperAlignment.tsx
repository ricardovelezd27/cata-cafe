"use client";

import { useId, useState, type ReactNode } from "react";
import { PillTabs } from "@/components/ui";
import { fillPattern } from "@/lib/fillPattern";
import { tabIds } from "@/lib/rovingFocus";
import { alignmentBars, type AlignmentInput } from "@/lib/reports/panel";

/**
 * Organizer only: of the descriptors most of the panel chose, how many each
 * cupper chose too, for the whole cupping or for one coffee. Informational: it
 * never touches a score. Excluded cuppers are outside the consensus (upstream)
 * and are listed last, marked.
 *
 * One neutral bar for everyone (audit A-05): a share is a length and a number,
 * never a traffic light. A low share is not a fault, it is a different palate
 * or a different vocabulary.
 */

export type CupperAlignmentRow = AlignmentInput & {
  /** 0..1 across every sample (kept for the callers that sort by it). */
  alignment: number;
};

export type AlignmentTranslations = {
  title: string;
  subtitle: string;
  excluded: string;
  noData: string;
  /** "Todas las muestras": the filter's first option. */
  all: string;
};

export function CupperAlignment({
  rows,
  samples,
  t,
  countPattern,
  titleAction,
}: {
  rows: CupperAlignmentRow[];
  /** The session's coffees, for the filter; with one coffee there is no filter. */
  samples: { id: string; label: string }[];
  t: AlignmentTranslations;
  /** RAW "{k} de {o}". */
  countPattern: string;
  /** Rendered after the title (the help button). */
  titleAction?: ReactNode;
}) {
  const titleId = useId();
  const tabsId = `align${useId().replace(/:/g, "")}`;
  const [sampleId, setSampleId] = useState<"all" | string>("all");
  const bars = alignmentBars(rows, sampleId === "all" ? null : sampleId);
  const hasData = bars.some((bar) => bar.opportunities > 0);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titleId} data-panel-section="alignment">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="section-title inline-flex items-center gap-1.5">
          {t.title}
          {titleAction}
        </h2>
        <p className="m-0 text-caption leading-snug text-on-surface-variant">{t.subtitle}</p>
      </div>
      {samples.length > 1 ? (
        <PillTabs
          items={[{ id: "all", label: t.all }, ...samples.map((sample) => ({ id: sample.id, label: sample.label }))]}
          value={sampleId}
          onChange={(id) => setSampleId(id)}
          ariaLabel={t.title}
          size="sm"
          idBase={tabsId}
        />
      ) : null}
      <div
        className="rounded-card border border-outline-variant bg-surface-container-lowest p-4"
        {...(samples.length > 1
          ? { role: "tabpanel", id: tabIds(tabsId, sampleId).panel, "aria-labelledby": tabIds(tabsId, sampleId).tab }
          : {})}
      >
        {!hasData ? (
          <p className="m-0 text-body text-on-surface-variant">{t.noData}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {bars.map((bar) => (
              <li key={bar.id} className="flex flex-col gap-1" data-alignment-row="">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span className={`min-w-0 truncate font-semibold ${bar.excluded ? "text-on-surface-variant" : "text-on-surface"}`}>
                    {bar.name}
                    {bar.excluded ? <span className="font-normal"> {t.excluded}</span> : null}
                  </span>
                  <span className={`shrink-0 tabular-nums ${bar.excluded ? "text-on-surface-variant" : "text-on-surface"}`}>
                    {bar.percent === null ? (
                      "—"
                    ) : (
                      <>
                        {fillPattern(countPattern, { k: bar.matches, o: bar.opportunities })}
                        <span className="ml-2 font-semibold">{bar.percent} %</span>
                      </>
                    )}
                  </span>
                </div>
                {/* one neutral bar: a share, never a grade */}
                <div className="h-2 overflow-hidden rounded-pill bg-surface-container-highest" aria-hidden="true">
                  <div
                    className={`h-full rounded-pill ${bar.excluded ? "bg-outline-variant" : "bg-on-surface-variant"}`}
                    style={{ width: `${bar.percent ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

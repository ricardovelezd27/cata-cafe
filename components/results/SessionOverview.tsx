"use client";

import { useId, type ReactNode } from "react";
import { Notice, PaperSectionHeading } from "@/components/ui";
import { formatScore, formatSigned } from "@/lib/scoreFormat";
import { fillPattern } from "@/lib/fillPattern";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import { compareOptions, type CardSample } from "@/lib/reports/coffeeCards";
import { overviewView, type OverviewData } from "@/lib/reports/overview";
import type { RankContext } from "@/lib/reports/ranking";
import { countBar } from "@/lib/resultsScales";
import type { CardsStrings } from "./cardsStrings";
import { OverviewCompare } from "./OverviewCompare";
import type { OverviewStrings } from "./overviewStrings";
import type { ResultsPartsStrings } from "./partsStrings";
import { RankStrip } from "./RankStrip";
import styles from "./SessionOverview.module.css";

/** What the overview reads of a sample. The results route's `SampleResult` satisfies it. */
export type OverviewSampleProps = CardSample & {
  revealed: boolean;
  coffee: { name: string } | null;
};

/** One tile: a name, then its content. Every tile has the same parts in the same order. */
function Tile({ title, area, children }: { title: string; area: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`${styles.tile} ${area}`} aria-labelledby={id}>
      <h2 id={id} className={styles.tileTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The "Por café" view of a cupping, in the owner's order (OR-D, 2026-11-21):
 * the two boxes (the coffee that came first, and every score on one fixed
 * scale), then the coffees one by one (`children`: the cards), then "Comparar"
 * (the one place where coffees are compared), then the small facts that repeat
 * nothing (the reader against the panel, who cupped, the defective cups).
 *
 * Nothing is said twice in the view: a coffee's wheel is on its card only, its
 * score in the ranking only (the first coffee's also heads its own box, the
 * owner's choice). It draws; it does not decide: WHAT each part
 * shows for this viewer and this state is `overviewView`
 * (lib/reports/overview.ts), from data the server already gated. A score is a
 * number in ink; nothing here moves.
 */
export function SessionOverview<S extends OverviewSampleProps>({
  samples,
  ctx,
  referenceId,
  data,
  myAlignment,
  preliminary,
  own = true,
  compareSelector,
  compare,
  familyLabels,
  parts,
  t,
  onOpenSample,
  children,
}: {
  samples: S[];
  ctx: RankContext;
  /** The reference the viewer compares against (the active one by default). */
  referenceId: string | null;
  data: OverviewData;
  /** The viewer's own descriptor match with the panel: three numbers, no one else's. */
  myAlignment: { matches: number; opportunities: number } | null;
  /** The organizer's view of an OPEN group session: the numbers are preliminary. */
  preliminary: boolean;
  /** False in the admin's read-only lens: the "you" of the page is the organizer,
   *  not the reader, so nothing is drawn as "tú" (no ring in the ranking, no
   *  "Tú y el panel"). */
  own?: boolean;
  /** "Comparar con", when the session has several references: under the ranking,
   *  where the reference's line is drawn. */
  compareSelector?: ReactNode;
  /** "Comparar". `closed` is the session's own state: nothing is compared before
   *  the close. */
  compare?: {
    closed: boolean;
    t: Pick<CardsStrings, "compare" | "comparePick" | "compareHint" | "compareNeedTwo">;
  };
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
  onOpenSample: (sampleId: string) => void;
  /** The coffees one by one (the cards), between the two boxes and "Comparar". */
  children?: ReactNode;
}) {
  const view = overviewView({ samples, referenceId, ctx, data });
  const compareId = useId();
  const nameOf = (s: S) => (s.revealed && s.coffee ? s.coffee.name : null);
  // the coffees "Comparar" may draw, in the order of the ranking; null = no section
  const toCompare = compare
    ? compareOptions({
        closed: compare.closed,
        samples,
        order: [...view.entries.map((e) => e.sample.id), ...view.references.map((r) => r.sample.id)],
        data,
      })
    : null;
  const openButton = (s: S, className: string) => (
    <button type="button" className={className} onClick={() => onOpenSample(s.id)}>
      <span className={styles.sampleLabel}>{s.label}</span>
      {nameOf(s) ? <span className={styles.sampleName}> {nameOf(s)}</span> : null}
    </button>
  );
  const groupOpenPending = ctx.isGroup && !ctx.canViewGroup;
  const hasScores = view.entries.some((e) => e.context.score !== null);
  // "First" is a place in a ranking: not in a descriptive session (no scores),
  // and not for a participant's own scores while the group's results are hidden.
  // With nothing to name (no score, or fewer than three cuppers) there is no box:
  // the ranking says why, in one sentence.
  const showFirst = ctx.format !== "descriptive" && view.ranked && view.first.status === "ok";
  const you = own ? view.you : null;
  const defectCups = view.defects.reduce((sum, d) => sum + d.summary.cups, 0);
  const smallTiles = (you ? 1 : 0) + (view.who ? 1 : 0) + (view.defects.length > 0 ? 1 : 0);
  const showBoxes = ctx.format !== "descriptive";

  return (
    <div className={styles.overview}>
      {preliminary || groupOpenPending || showBoxes ? (
        <div className={styles.lead}>
          {preliminary ? <Notice tone="info">{t.preliminary}</Notice> : null}
          {groupOpenPending ? <Notice tone="info">{t.communityPending}</Notice> : null}

          {showBoxes ? (
            <div className={styles.grid}>
          {/* 1. The coffee that came first: its name and its score. Its wheel is on its card. */}
          {showFirst && view.first.status === "ok" ? (
              <Tile title={view.scope === "group" ? t.firstTitle : t.firstTitleOwn} area={styles.aFirst}>
                {(() => {
                  const { entry } = view.first;
                  const [whole, decimals] = formatScore(entry.context.score as number).split(".");
                  return (
                    <div className={styles.first}>
                      <p className={styles.firstName}>
                        <span className={styles.sampleLabel}>{entry.sample.label}</span>
                        {nameOf(entry.sample) ? <span className={styles.sampleName}> {nameOf(entry.sample)}</span> : null}
                      </p>
                      <p className={styles.numeral} data-overview-score="">
                        {whole}
                        <span className={styles.decimal}>.{decimals}</span>
                      </p>
                      {/* the whole box opens the coffee */}
                      <button
                        type="button"
                        className={styles.cover}
                        aria-label={
                          nameOf(entry.sample) ? `${entry.sample.label} ${nameOf(entry.sample)}` : entry.sample.label
                        }
                        onClick={() => onOpenSample(entry.sample.id)}
                      />
                    </div>
                  );
                })()}
              </Tile>
          ) : null}

          {/* 2. Every coffee on one fixed scale. */}
          <Tile
            title={!view.ranked ? t.rankingTitleOpen : view.scope === "group" ? t.rankingTitle : t.rankingTitleOwn}
            area={showFirst ? styles.aRank : styles.aWide}
          >
            <p className={styles.context}>
              {t.scoreName}
              {!view.ranked ? ` ${t.rankingOpenNote}` : null}
            </p>
            {hasScores ? (
              <RankStrip
                items={view.entries.map((e) => ({
                  id: e.sample.id,
                  place: e.place === null ? null : String(e.place),
                  label: e.sample.label,
                  name: nameOf(e.sample),
                  // not the reader's own in the admin's lens: no "tú" ring
                  context: own ? e.context : { ...e.context, mine: null, difference: null },
                }))}
                reference={
                  view.referenceLine
                    ? { label: view.referenceLine.sample.label, score: view.referenceLine.score }
                    : null
                }
                strings={parts.rank}
                scoreStrings={parts.score}
                ariaLabel={view.ranked ? t.rankingTitle : t.rankingTitleOpen}
                onOpen={onOpenSample}
              />
            ) : (
              <p className={styles.context}>{t.rankingEmpty}</p>
            )}
            {/* "indicativo", explained once, only where it is used */}
            {view.entries.some((e) => e.context.indicative || e.context.suppressed) ? (
              <p className={styles.context}>{t.rankHelp}</p>
            ) : null}
            {/* fewer than three included cuppers: no coffee is named first */}
            {view.ranked && view.first.status === "none" && view.first.reason === "too_few" ? (
              <p className={styles.context}>{t.firstTooFew}</p>
            ) : null}
            {view.references.length > 1 ? compareSelector : null}
          </Tile>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 3. The coffees, one by one. */}
      {children}

      {/* 4. Where coffees are compared: their territories on one wheel, the counts beside it. */}
      {toCompare && compare ? (
        <section className={styles.section} aria-labelledby={compareId}>
          <div className={styles.sectionIntro}>
            <PaperSectionHeading id={compareId} title={compare.t.compare} flush />
            <p className={styles.context}>{compare.t.compareHint}</p>
          </div>
          <div className={styles.tile}>
            <OverviewCompare
              options={toCompare}
              names={Object.fromEntries(samples.map((s) => [s.id, nameOf(s) ? `${s.label} ${nameOf(s)}` : s.label]))}
              short={Object.fromEntries(samples.map((s) => [s.id, nameOf(s) ?? s.label]))}
              familyLabels={familyLabels}
              strings={parts.compare}
              t={compare.t}
            />
          </div>
        </section>
      ) : null}

      {/* 5. The small facts: each said once, here. */}
      {smallTiles > 0 ? (
        <div className={styles.grid} data-small-tiles={smallTiles}>
          {/* The reader against the panel: differences in ink, never a grade. */}
          {you ? (
            <Tile title={t.youTitle} area={styles.aSmall}>
              <p className={styles.fact}>{fillPattern(t.youAbove, { k: you.above, m: you.of })}</p>
              <p className={styles.context}>{t.youAboveNote}</p>
              <p className={styles.line}>{fillPattern(t.youMean, { d: formatSigned(you.meanDifference) })}</p>
              {myAlignment && myAlignment.opportunities > 0 ? (
                <div className={styles.alignment}>
                  <p className={styles.line}>
                    {fillPattern(t.youAlignment, {
                      k: myAlignment.matches,
                      o: myAlignment.opportunities,
                      p: Math.round((myAlignment.matches / myAlignment.opportunities) * 100),
                    })}
                  </p>
                  {/* one neutral bar: a share, never a grade */}
                  <svg className={styles.bar} aria-hidden="true" focusable="false">
                    <rect className={styles.barTrack} width="100%" height="100%" rx="4" />
                    <rect
                      className={styles.barFill}
                      width={`${countBar(myAlignment.matches, myAlignment.opportunities).pct}%`}
                      height="100%"
                      rx="4"
                    />
                  </svg>
                  <p className={styles.context}>{t.youAlignmentNote}</p>
                </div>
              ) : null}
            </Tile>
          ) : null}

          {/* How many of those who joined sent. "n de N incluidos" is on every ranking row. */}
          {view.who ? (
            <Tile title={t.whoTitle} area={styles.aSmall}>
              <p className={styles.fact}>{fillPattern(t.whoSentOf, { k: view.who.sent, n: view.who.joined })}</p>
              <p className={styles.context}>{t.whoSentNote}</p>
              {view.who.excluded !== null && view.who.excluded > 0 ? (
                <p className={styles.line}>{fillPattern(t.whoExcluded, { n: view.who.excluded })}</p>
              ) : null}
            </Tile>
          ) : null}

          {/* Only when a cup was marked defective. The one place the error red appears. */}
          {view.defects.length > 0 ? (
            <Tile title={t.defectsTitle} area={styles.aSmall}>
              <p className={styles.fact}>
                {defectCups === 1 ? t.defectCupsOne : fillPattern(t.defectCupsMany, { n: defectCups })}
              </p>
              <ul className={styles.defects}>
                {view.defects.map(({ sample, summary }) => (
                  <li key={sample.id} className={styles.defect}>
                    <span className={styles.defectMark} aria-hidden="true" />
                    <div className={styles.defectText}>
                      <p className={styles.defectHead}>
                        {openButton(sample, styles.openInline)}
                        <span className={styles.defectCups}>
                          {summary.cups === 1 ? t.defectCupsOne : fillPattern(t.defectCupsMany, { n: summary.cups })}
                        </span>
                      </p>
                      <p className={styles.context}>
                        {summary.types
                          .map((type) =>
                            fillPattern(t.defectType, {
                              type: type.type === null ? t.defectUnspecified : (t.defectTypes[type.type] ?? type.type),
                              n: type.cups,
                            }),
                          )
                          .join(" · ")}
                      </p>
                      {view.scope === "group" ? (
                        <p className={styles.context}>{fillPattern(t.defectBy, { k: summary.cuppers, n: summary.n })}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Tile>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

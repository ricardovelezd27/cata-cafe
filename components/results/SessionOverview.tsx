"use client";

import { useId, type ReactNode } from "react";
import { ScoreWithContext, formatScore, formatSigned } from "@/components/ui/ScoreWithContext";
import { fillPattern } from "@/lib/fillPattern";
import { countedFamilies, type WheelFamilyId } from "@/lib/flavorWheel";
import { overviewView, type OverviewData, type OverviewSample } from "@/lib/reports/overview";
import type { RankContext } from "@/lib/reports/ranking";
import { countBar } from "@/lib/resultsScales";
import { scoreContext } from "@/lib/scoreContext";
import { CountedList } from "./CountedList";
import { FlavorWheel, WheelCaption } from "./FlavorWheel";
import type { OverviewStrings } from "./overviewStrings";
import type { ResultsPartsStrings } from "./partsStrings";
import { RankStrip } from "./RankStrip";
import { captionParts, wheelCaptionText } from "./wheelCaption";
import styles from "./SessionOverview.module.css";

/** What the overview reads of a sample. The results route's `SampleResult` satisfies it. */
export type OverviewSampleProps = OverviewSample & {
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
 * The overview of a cupping: general first. A row of tiles, each with one fact
 * (the coffee the panel put first, the ranking on one scale, the flavour of
 * each coffee, the reader against the panel, the reference, who cupped, the
 * defective cups). It draws; it does not decide: WHAT each tile shows for this
 * viewer and this state is `overviewView` (lib/reports/overview.ts), from data
 * the server already gated. A score is a number in ink; a family's colour
 * paints the wheels only; nothing here moves.
 */
export function SessionOverview<S extends OverviewSampleProps>({
  samples,
  ctx,
  referenceId,
  data,
  myAlignment,
  preliminary,
  referencePinned,
  compareSelector,
  familyLabels,
  parts,
  t,
  onOpenSample,
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
  /** The reference is fixed at 79.00 for everyone (`referenceExplanation` is
   *  "pinned"): its number is a rule, not an average, so no spread is printed. */
  referencePinned: boolean;
  /** "Comparar con", when the session has several references. */
  compareSelector?: ReactNode;
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
  onOpenSample: (sampleId: string) => void;
}) {
  const view = overviewView({ samples, referenceId, ctx, data });
  const nameOf = (s: S) => (s.revealed && s.coffee ? s.coffee.name : null);
  const openButton = (s: S, className: string) => (
    <button type="button" className={className} onClick={() => onOpenSample(s.id)}>
      <span className={styles.sampleLabel}>{s.label}</span>
      {nameOf(s) ? <span className={styles.sampleName}> {nameOf(s)}</span> : null}
    </button>
  );
  const wheelOf = (s: S) => {
    if (view.wheels.status !== "ok") return null;
    const item = view.wheels.items.find((i) => i.sample.id === s.id);
    return item && item.status === "ok" && item.headline !== null ? item : null;
  };
  const groupOpenPending = ctx.isGroup && !ctx.canViewGroup;
  const hasScores = view.entries.some((e) => e.context.score !== null);
  // "First" is a place in a ranking: not in a descriptive session (no scores),
  // and not for a participant's own scores while the group's results are hidden.
  // With no score at all the ranking tile already says so: no second tile for it.
  const showFirst =
    ctx.format !== "descriptive" && view.ranked && !(view.first.status === "none" && view.first.reason === "no_scores");
  const smallTiles = view.references.length + (view.who ? 1 : 0) + (view.defects.length > 0 ? 1 : 0);

  return (
    <div className={styles.overview}>
      {preliminary ? (
        <p role="status" className={styles.notice}>
          {t.preliminary}
        </p>
      ) : null}
      {groupOpenPending ? (
        <p role="status" className={styles.notice}>
          {t.communityPending}
        </p>
      ) : null}

      <div className={styles.grid} data-small-tiles={smallTiles}>
        {/* 1. The coffee the panel put first: the finding, in the first fold. */}
        {showFirst ? (
          view.first.status === "ok" ? (
            <Tile title={view.scope === "group" ? t.firstTitle : t.firstTitleOwn} area={styles.aFirst}>
              {(() => {
                const { entry, tieWith } = view.first;
                const [whole, decimals] = formatScore(entry.context.score as number).split(".");
                const wheel = wheelOf(entry.sample);
                return (
                  <div className={styles.first}>
                    <p className={styles.firstName}>
                      <span className={styles.sampleLabel}>{entry.sample.label}</span>
                      {nameOf(entry.sample) ? <span className={styles.sampleName}> {nameOf(entry.sample)}</span> : null}
                    </p>
                    <div className={styles.firstFact}>
                      <p className={styles.numeral} data-overview-score="">
                        {whole}
                        <span className={styles.decimal}>.{decimals}</span>
                      </p>
                      {wheel ? (
                        <FlavorWheel
                          counts={wheel.wheel.rollup}
                          n={wheel.wheel.n}
                          familyLabels={familyLabels}
                          strings={parts.wheel}
                          size="medium"
                          decorative
                        />
                      ) : null}
                    </div>
                    <ScoreWithContext
                      context={tieWith ? { ...entry.context, noClearGap: false } : entry.context}
                      strings={parts.score}
                      showScore={false}
                    />
                    {tieWith ? (
                      <p className={styles.context}>
                        {fillPattern(t.tieWith, { label: tieWith.sample.label, gap: tieWith.gap.toFixed(2) })}
                      </p>
                    ) : null}
                    {wheel ? (
                      <>
                        {/* a phone gets the line; from 768 px, the three families most people found */}
                        <p className={`${styles.context} ${styles.firstLine}`}>
                          {parts.caption.mostFoundLabel}:{" "}
                          <span className={styles.ink}>
                            <WheelCaption text={wheelCaptionText(wheel.headline, familyLabels, parts.caption)} />
                          </span>
                        </p>
                        <div className={styles.firstList}>
                          <p className={styles.context}>{parts.caption.mostFoundLabel}</p>
                          <CountedList
                            items={countedFamilies(wheel.wheel.rollup, wheel.wheel.n, 3)}
                            labels={familyLabels}
                            strings={parts.counted}
                            ariaLabel={parts.caption.mostFoundLabel}
                          />
                        </div>
                      </>
                    ) : null}
                    {/* the whole tile opens the coffee */}
                    <button
                      type="button"
                      className={styles.cover}
                      aria-label={nameOf(entry.sample) ? `${entry.sample.label} ${nameOf(entry.sample)}` : entry.sample.label}
                      onClick={() => onOpenSample(entry.sample.id)}
                    />
                  </div>
                );
              })()}
            </Tile>
          ) : (
            <Tile title={view.scope === "group" ? t.firstTitle : t.firstTitleOwn} area={styles.aFirst}>
              <p className={styles.context}>{view.first.reason === "too_few" ? t.firstTooFew : t.firstNoScores}</p>
            </Tile>
          )
        ) : null}

        {/* 2. Every coffee on one fixed scale. */}
        {ctx.format !== "descriptive" ? (
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
                  context: e.context,
                  tie: e.tie,
                }))}
                reference={
                  view.referenceLine ? { label: view.referenceLine.sample.label, score: view.referenceLine.score } : null
                }
                strings={parts.rank}
                scoreStrings={parts.score}
                ariaLabel={view.ranked ? t.rankingTitle : t.rankingTitleOpen}
                onOpen={onOpenSample}
              />
            ) : (
              <p className={styles.context}>{t.rankingEmpty}</p>
            )}
            {/* the two words of the ranking, explained once, only where one is used */}
            {view.entries.some((e) => e.context.indicative || e.context.suppressed || e.context.noClearGap) ? (
              <p className={styles.context}>{t.rankHelp}</p>
            ) : null}
          </Tile>
        ) : null}

        {/* 3. What was tasted, coffee by coffee. Never in an affective session. */}
        {view.wheels.status !== "no_wheel" && !(view.wheels.status === "empty" && view.scope === "group") ? (
          <Tile
            title={view.scope === "group" ? t.wheelsTitle : t.wheelsTitleOwn}
            area={view.you ? styles.aWheels : styles.aWide}
          >
            {view.wheels.status === "too_few" ? (
              <p className={styles.context}>{t.wheelsTooFew}</p>
            ) : view.wheels.status === "empty" ? (
              <p className={styles.context}>{t.wheelsEmpty}</p>
            ) : (
              <>
                <p className={styles.context}>{view.scope === "group" ? t.wheelsNote : t.wheelsNoteOwn}</p>
                <ul className={styles.wheels}>
                  {view.wheels.items.map((item) => (
                    <li key={item.sample.id}>
                      <button type="button" className={styles.wheelButton} onClick={() => onOpenSample(item.sample.id)}>
                        {item.status === "ok" ? (
                          <FlavorWheel
                            counts={item.wheel.rollup}
                            n={item.wheel.n}
                            familyLabels={familyLabels}
                            strings={parts.wheel}
                            size="mini"
                            decorative
                          />
                        ) : (
                          <span className={styles.wheelHole} aria-hidden="true" />
                        )}
                        <span className={styles.wheelLabel}>
                          <span className={styles.sampleLabel}>{item.sample.label}</span>
                          {nameOf(item.sample) ? <span className={styles.wheelCoffee}>{nameOf(item.sample)}</span> : null}
                        </span>
                        <span className={styles.wheelLine}>
                          {item.status === "ok" ? (
                            view.scope === "own" ? (
                              // the reader's own marks: the families, with no "1 de 1"
                              captionParts(wheelCaptionText(item.headline, familyLabels, parts.caption)).names
                            ) : (
                              <WheelCaption text={wheelCaptionText(item.headline, familyLabels, parts.caption)} />
                            )
                          ) : (
                            t.wheelTooFew
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Tile>
        ) : null}

        {/* 4. The reader against the panel: differences in ink, never a grade. */}
        {view.you ? (
          <Tile title={t.youTitle} area={view.wheels.status !== "no_wheel" ? styles.aYou : styles.aWide}>
            <p className={styles.fact}>{fillPattern(t.youAbove, { k: view.you.above, m: view.you.of })}</p>
            <p className={styles.context}>{t.youAboveNote}</p>
            <p className={styles.line}>{fillPattern(t.youMean, { d: formatSigned(view.you.meanDifference) })}</p>
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

        {/* 5. What everything is compared against. */}
        {view.references.map((ref, i) => (
          <Tile
            key={ref.sample.id}
            title={view.references.length > 1 ? `${t.referenceTitle} ${ref.sample.referenceRank ?? i + 1}` : t.referenceTitle}
            area={styles.aSmall}
          >
            <p className={styles.firstName}>{openButton(ref.sample, styles.openInline)}</p>
            {ref.value.score !== null ? (
              referencePinned ? (
                <p className={styles.fact}>{formatScore(ref.value.score)}</p>
              ) : (
                <ScoreWithContext
                  context={scoreContext({ value: ref.value, mine: null, isReference: true })}
                  strings={parts.score}
                  size="md"
                />
              )
            ) : ctx.format !== "descriptive" ? (
              <p className={styles.context}>{t.notScored}</p>
            ) : null}
            <p className={styles.context}>{t.referenceHint}</p>
            {view.references.length > 1 && ref.active ? <p className={styles.line}>{t.referenceCompared}</p> : null}
            {view.references.length > 1 && i === view.references.length - 1 ? compareSelector : null}
          </Tile>
        ))}

        {/* 6. How many cupped, and how many count. Numbers only. */}
        {view.who ? (
          <Tile title={t.whoTitle} area={styles.aSmall}>
            {view.who.sent > 0 ? (
              <>
                <p className={styles.fact}>
                  {fillPattern(t.whoIncluded, { n: view.who.included, total: view.who.sent })}
                </p>
                <p className={styles.context}>{t.whoIncludedNote}</p>
              </>
            ) : (
              <p className={styles.context}>{t.whoNobody}</p>
            )}
            <p className={styles.line}>
              {fillPattern(t.whoJoined, { n: view.who.joined })} · {fillPattern(t.whoSent, { n: view.who.sent })}
              {view.who.excluded !== null && view.who.excluded > 0
                ? ` · ${fillPattern(t.whoExcluded, { n: view.who.excluded })}`
                : null}
            </p>
          </Tile>
        ) : null}

        {/* 7. Only when a cup was marked defective. The one place the error red appears. */}
        {view.defects.length > 0 ? (
          <Tile title={t.defectsTitle} area={styles.aSmall}>
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
    </div>
  );
}

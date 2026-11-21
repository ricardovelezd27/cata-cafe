import { fillPattern } from "@/lib/fillPattern";
import { SCORE_SCALE, rankStripRow, scoreAxis } from "@/lib/resultsScales";
import type { ScoreContext } from "@/lib/scoreContext";
import {
  ScoreWithContext,
  formatScore,
  type ScoreContextStrings,
} from "@/components/ui/ScoreWithContext";
import styles from "./RankStrip.module.css";

export type RankStripStrings = {
  legendGroup: string;
  legendMine: string;
  /** "dispersión (±)" */
  legendSpread: string;
  /** "referencia: {label}, {score}" */
  legendReference: string;
  /** "Escala fija de {min} a {max}. {neutral} es el punto neutro." */
  scaleNote: string;
  /** Read out on a row whose mark sits at an edge: "Fuera de la escala de {min} a {max}." */
  offScale: string;
  /** Printed in place of a score that does not exist: "–". */
  none: string;
};

export type RankStripItem = {
  id: string;
  /** The place printed at the left ("1"); null for a coffee that is not ranked. */
  place: string | null;
  /** "Muestra G" */
  label: string;
  /** The coffee's name, once revealed. */
  name?: string | null;
  /** Everything said beside the score: `scoreContext` of lib/scoreContext.ts. */
  context: ScoreContext;
};

const MID = 13;
const CAP = 5;

/**
 * The ranking of a cupping: one row per coffee on the fixed scale of
 * `SCORE_SCALE`, in the order given. A filled dot is the group, a ring is the
 * reader, a whisker is the spread, a dashed line is the reference. The number
 * is printed at the end of every row, in ink. The ranking orders the scores; it
 * does not say that neighbours are close (coffees are compared in "Comparar").
 *
 * It draws; it does not decide. Positions come from `rankStripRow`, the words
 * beside each score from `ScoreWithContext`. A
 * reference is a line, not a row. In a solo session the same rows carry the
 * reader's ring only. The rows are a real ordered list.
 */
export function RankStrip({
  items,
  reference = null,
  strings,
  scoreStrings,
  ariaLabel,
  onOpen,
}: {
  items: readonly RankStripItem[];
  /** The reference the page compares against: a dashed line through every row. */
  reference?: { label: string; score: number } | null;
  strings: RankStripStrings;
  scoreStrings: ScoreContextStrings;
  ariaLabel?: string;
  /** With it, a coffee's name is a button and the whole row its target. */
  onOpen?: (id: string) => void;
}) {
  const axis = scoreAxis();
  const scale = { min: SCORE_SCALE.min, max: SCORE_SCALE.max, neutral: SCORE_SCALE.neutral };

  const rows = items.map((item) => {
    const community = item.context.basis === "community";
    const row = rankStripRow({
      group: community ? item.context.score : null,
      spread: item.context.spread,
      mine: community ? item.context.mine : item.context.score,
      reference: reference?.score ?? null,
    });
    return { item, row };
  });
  const anyGroup = rows.some((r) => r.row.group !== null);
  const anyMine = rows.some((r) => r.row.mine !== null);
  const anySpread = rows.some((r) => r.row.whisker !== null);

  return (
    <div className={styles.rank}>
      <div className={styles.head} aria-hidden="true">
        <div className={styles.axis}>
          <svg className={styles.ticks} height="16" focusable="false">
            {axis.map((t) => (
              <text key={t.value} className={styles.tickText} x={`${t.pct}%`} y="12" textAnchor="middle">
                {t.value}
              </text>
            ))}
          </svg>
        </div>
      </div>
      <ol className={styles.rows} aria-label={ariaLabel}>
        {rows.map(({ item, row }) => {
          const off = row.offScale.group || row.offScale.mine;
          return (
            <li key={item.id} className={styles.row}>
              <span className={styles.place}>{item.place ?? ""}</span>
              <span className={styles.name}>
                <span className={styles.label}>{item.label}</span>
                {item.name ? <span className={styles.coffee}> {item.name}</span> : null}
              </span>
              {/* The whole row opens the coffee: one button the size of the row,
                  named by the row's own visible name. */}
              {onOpen ? (
                <button
                  type="button"
                  className={styles.open}
                  aria-label={item.name ? `${item.label} ${item.name}` : item.label}
                  onClick={() => onOpen(item.id)}
                />
              ) : null}
              <span className={styles.score}>
                {item.context.score === null ? strings.none : formatScore(item.context.score)}
              </span>
              <div className={styles.stripWrap} aria-hidden="true">
                <svg className={styles.strip} height="26" focusable="false">
                  <line className={styles.base} x1="0" x2="100%" y1={MID} y2={MID} />
                  <line className={styles.neutral} x1={`${row.neutral}%`} x2={`${row.neutral}%`} y1="0" y2="26" />
                  {row.reference !== null ? (
                    <line className={styles.reference} x1={`${row.reference}%`} x2={`${row.reference}%`} y1="0" y2="26" />
                  ) : null}
                  {row.whisker ? (
                    <>
                      <line className={styles.whisker} x1={`${row.whisker.from}%`} x2={`${row.whisker.to}%`} y1={MID} y2={MID} />
                      {row.whisker.cutLow ? null : (
                        <line className={styles.whisker} x1={`${row.whisker.from}%`} x2={`${row.whisker.from}%`} y1={MID - CAP} y2={MID + CAP} />
                      )}
                      {row.whisker.cutHigh ? null : (
                        <line className={styles.whisker} x1={`${row.whisker.to}%`} x2={`${row.whisker.to}%`} y1={MID - CAP} y2={MID + CAP} />
                      )}
                    </>
                  ) : null}
                  {row.group !== null ? <circle className={styles.group} cx={`${row.group}%`} cy={MID} r="5.5" /> : null}
                  {row.mine !== null ? <circle className={styles.mine} cx={`${row.mine}%`} cy={MID} r="7.25" /> : null}
                  {/* A small arrow outside the track: the score is beyond this edge. */}
                  {[row.offScale.group ? row.group : null, row.offScale.mine ? row.mine : null].map((at, j) =>
                    at === null ? null : (
                      <svg key={j} x={`${at}%`} y="0" width="1" height="26" overflow="visible">
                        <path
                          className={styles.off}
                          d={at <= 0 ? `M -11 ${MID - 4} L -15 ${MID} L -11 ${MID + 4}` : `M 11 ${MID - 4} L 15 ${MID} L 11 ${MID + 4}`}
                        />
                      </svg>
                    ),
                  )}
                </svg>
              </div>
              <div className={styles.ctx}>
                <ScoreWithContext context={item.context} strings={scoreStrings} showScore={false} detail="brief" />
                {off ? <span className="sr-only">{fillPattern(strings.offScale, scale)}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className={styles.legend}>
        {anyGroup ? (
          <span className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 22 16" aria-hidden="true" focusable="false">
              <circle className={styles.group} cx="11" cy="8" r="5.5" />
            </svg>
            {strings.legendGroup}
          </span>
        ) : null}
        {anyMine ? (
          <span className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 22 16" aria-hidden="true" focusable="false">
              <circle className={styles.mine} cx="11" cy="8" r="6" />
            </svg>
            {strings.legendMine}
          </span>
        ) : null}
        {anySpread ? (
          <span className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 22 16" aria-hidden="true" focusable="false">
              <line className={styles.whisker} x1="2" x2="20" y1="8" y2="8" />
              <line className={styles.whisker} x1="2" x2="2" y1="3" y2="13" />
              <line className={styles.whisker} x1="20" x2="20" y1="3" y2="13" />
            </svg>
            {strings.legendSpread}
          </span>
        ) : null}
        {reference ? (
          <span className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 22 16" aria-hidden="true" focusable="false">
              <line className={styles.reference} x1="11" x2="11" y1="0" y2="16" />
            </svg>
            {fillPattern(strings.legendReference, { label: reference.label, score: formatScore(reference.score) })}
          </span>
        ) : null}
      </p>
      <p className={styles.note}>{fillPattern(strings.scaleNote, scale)}</p>
    </div>
  );
}

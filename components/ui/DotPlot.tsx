import { fillPattern } from "@/lib/fillPattern";
import { dotPlotAxis, dotPlotRow, type DotScale } from "@/lib/resultsScales";
import styles from "./DotPlot.module.css";

export type DotPlotStrings = {
  /** "tú {mine} · grupo {group}" */
  both: string;
  /** "tú {mine}" */
  mineOnly: string;
  /** Printed where a value is absent: "–". */
  none: string;
  /** The legend: what the ring and the dot are. */
  legendMine: string;
  legendGroup: string;
};

export type DotPlotItem = {
  id: string;
  /** The attribute's name, in the reader's language. */
  label: string;
  /** The reader's own value, or null when they have none. */
  mine: number | null;
  /** The group's value, or null when it is absent or may not be shown. */
  group: number | null;
};

const TRACK_MID = 11;

/**
 * A dot plot on ONE fixed scale: a ring for the reader, a filled dot for the
 * group, the two numbers printed at the end of every row. The scale is the
 * caller's (`QUALITY_SCALE`, 1 to 9, or `INTENSITY_SCALE`, 0 to 15, of
 * lib/resultsScales.ts) and is the same for every coffee, never fitted to the
 * data. Positions come from `dotPlotRow` / `dotPlotAxis`.
 *
 * Whether the group's value may be shown at all is decided BEFORE this
 * component (`panelGates` in lib/scoreContext.ts): pass `showGroup={false}`, or
 * a null `group` for one row. The rows are a real list and every row prints its
 * numbers, so the drawing is never the only carrier.
 */
export function DotPlot({
  scale,
  items,
  strings,
  showGroup = true,
  decimals = 1,
  ariaLabel,
}: {
  scale: DotScale;
  items: readonly DotPlotItem[];
  strings: DotPlotStrings;
  /** False when this plot has no group series at all (a solo cupper, a closed gate). */
  showGroup?: boolean;
  /** Decimals of a value that is not whole (a group average). */
  decimals?: number;
  ariaLabel?: string;
}) {
  const axis = dotPlotAxis(scale);
  const mineText = (v: number | null) =>
    v === null ? strings.none : Number.isInteger(v) ? String(v) : v.toFixed(decimals);
  const groupText = (v: number | null) => (v === null ? strings.none : v.toFixed(decimals));
  return (
    <div className={styles.plot} role="group" aria-label={ariaLabel}>
      <div className={styles.axis} aria-hidden="true">
        <div className={styles.trackWrap}>
          <svg className={styles.ticks} height="16" focusable="false">
            {axis.map((t) => (
              <text key={t.value} className={styles.tickText} x={`${t.pct}%`} y="12" textAnchor="middle">
                {t.value}
              </text>
            ))}
          </svg>
        </div>
      </div>
      <ul className={styles.rows}>
        {items.map((item) => {
          const at = dotPlotRow(scale, { mine: item.mine, group: showGroup ? item.group : null });
          return (
            <li key={item.id} className={styles.row}>
              <span className={styles.label}>{item.label}</span>
              <div className={styles.trackWrap} aria-hidden="true">
                <svg className={styles.track} height="22" focusable="false">
                  <line className={styles.base} x1="0" x2="100%" y1={TRACK_MID} y2={TRACK_MID} />
                  {axis.map((t) => (
                    <line key={t.value} className={styles.tick} x1={`${t.pct}%`} x2={`${t.pct}%`} y1="7" y2="15" />
                  ))}
                  {at.group !== null ? <circle className={styles.group} cx={`${at.group}%`} cy={TRACK_MID} r="5" /> : null}
                  {at.mine !== null ? <circle className={styles.mine} cx={`${at.mine}%`} cy={TRACK_MID} r="6.75" /> : null}
                </svg>
              </div>
              <span className={styles.value}>
                {showGroup
                  ? fillPattern(strings.both, { mine: mineText(item.mine), group: groupText(item.group) })
                  : fillPattern(strings.mineOnly, { mine: mineText(item.mine) })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.legend}>
        <span className={styles.legendItem}>
          <svg className={styles.swatch} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle className={styles.mine} cx="8" cy="8" r="5.75" />
          </svg>
          {strings.legendMine}
        </span>
        {showGroup ? (
          <span className={styles.legendItem}>
            <svg className={styles.swatch} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle className={styles.group} cx="8" cy="8" r="5" />
            </svg>
            {strings.legendGroup}
          </span>
        ) : null}
      </p>
    </div>
  );
}

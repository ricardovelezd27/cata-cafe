"use client";

import { useElementWidth } from "@/hooks/useElementWidth";
import { fillPattern } from "@/lib/fillPattern";
import {
  WHEEL_FRAMES,
  compareGeometry,
  familyAngle,
  familyCounts,
  ringRadius,
  wheelPoint,
  type WheelCounts,
} from "@/lib/flavorWheel";
import { CHART_CAPTION_PX } from "@/lib/chartText";
import { fitWheelLabels } from "@/lib/flavorWheelLayout";
import { familyGrounds } from "@/lib/flavorWheelShape";
import { familyToneClass } from "@/components/ui/familyTone";
import { WheelGrounds, WheelLabels, type FamilyLabels } from "./FlavorWheel";
import styles from "./FlavorWheel.module.css";

/** One coffee of a comparison. `tag` is the letter drawn on its territory;
 *  `name` is what the legend and the table call it. */
export type CompareCoffee = { id: string; tag: string; name: string; counts: WheelCounts; n: number };

export type FlavorCompareStrings = {
  /** "Comparación de sabores entre {coffees}. Las cifras están en la tabla que sigue." */
  aria: string;
  /** One coffee of that list: "{tag} {name}, {n} catadores" */
  ariaCoffee: string;
  /** The table's caption: "Personas que encontraron cada familia, por café" */
  tableCaption: string;
  /** The first column's header: "Familia" */
  familyHeader: string;
  /** Under each coffee's letter: "de {n}" */
  ofN: string;
};

type LineStyle = { line: string; fill: string | null };

/** Painted radius of the disc that carries a coffee's letter, and its text size. */
const TAG_RADIUS_PX = 10;
const TAG_TEXT_PX = CHART_CAPTION_PX;

/**
 * Coffees compared on one wheel. With `base`, that coffee keeps its coloured
 * petals and up to two `others` are laid over them as ink outlines; without it,
 * up to three `others` are drawn as territories alone. How many are drawn, and
 * the shared scale of rings, is `compareGeometry` (lib/flavorWheel.ts).
 *
 * What the PDF taught: the drawing prints NO numbers (the table under it is the
 * exact reading and the text equivalent), the centre stays the colour of the
 * paper, each coffee's letter sits on its own edge inside the outer ring, and
 * the coffees are told apart by line style and by letter, never by colour alone.
 *
 * Under the territories lie the nine dim family shades of the one-coffee wheel
 * and the outer ring alone (the owner's choice, 2026-11-21).
 */
export function FlavorCompare({
  base = null,
  others,
  familyLabels,
  strings,
  beside = false,
}: {
  base?: CompareCoffee | null;
  others: readonly CompareCoffee[];
  familyLabels: FamilyLabels;
  strings: FlavorCompareStrings;
  /** From 768 px, the table sits beside the wheel (two columns) instead of under it. */
  beside?: boolean;
}) {
  const { ref, width } = useElementWidth();
  const frame = WHEEL_FRAMES.compare;
  const series = (c: CompareCoffee) => ({ id: c.id, counts: c.counts, n: c.n });
  const g = compareGeometry({ base: base ? series(base) : null, others: others.map(series) }, frame);
  const layout = fitWheelLabels({
    frame,
    width,
    texts: g.labels.map((l) => ({ name: familyLabels[l.family] ?? l.family, number: null })),
  });
  const { k } = layout;
  const vb = layout.viewBox;

  const all = [...(base ? [base] : []), ...others];
  const coffeeOf = (id: string) => all.find((c) => c.id === id);
  const drawn = g.table.series
    .map((s) => ({ series: s, coffee: coffeeOf(s.id) }))
    .filter((d): d is { series: (typeof g.table.series)[number]; coffee: CompareCoffee } => d.coffee !== undefined);

  const lineStyles: LineStyle[] = base
    ? [
        { line: styles.lineO0, fill: null },
        { line: styles.lineO1, fill: null },
      ]
    : [
        { line: styles.lineA0, fill: styles.fillA0 },
        { line: styles.lineA1, fill: styles.fillA1 },
        { line: styles.lineA2, fill: null },
      ];
  const styleOf = (order: number) => lineStyles[order % lineStyles.length];

  const aria = fillPattern(strings.aria, {
    coffees: drawn
      .map((d) => fillPattern(strings.ariaCoffee, { tag: d.coffee.tag, name: d.coffee.name, n: d.series.n }))
      .join("; "),
  });

  return (
    <figure className={beside ? `${styles.figure} ${styles.beside}` : styles.figure}>
      <div ref={ref} className={styles.frame}>
        <svg
          className={styles.svg}
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          role="img"
          aria-label={aria}
          focusable="false"
        >
          <g aria-hidden="true">
            <WheelGrounds grounds={familyGrounds(frame, g.n)} />
            {g.rings
              .filter((ring) => ring.outer)
              .map((ring) => (
                <circle key={ring.people} className={styles.ringOuter} cx={frame.cx} cy={frame.cy} r={ring.radius} />
              ))}
            {g.petals.map((p) =>
              p.d === null ? null : (
                <path key={p.family} className={`${styles.petal} ${familyToneClass(p.family)}`} d={p.d} />
              ),
            )}
            {g.territories.map((t) => {
              const fill = styleOf(t.order).fill;
              return fill ? <path key={t.id} className={fill} d={t.d} /> : null;
            })}
            {/* the centre is "nobody": kept the colour of the paper, so overlapping
                fills never make it the darkest place of the drawing */}
            {base ? null : <circle className={styles.centre} cx={frame.cx} cy={frame.cy} r={frame.r0 - 1 / k} />}
            {g.territories.map((t) => (
              <path key={t.id} className={styles.under} d={t.d} />
            ))}
            {g.territories.map((t) => (
              <path key={t.id} className={`${styles.territory} ${styleOf(t.order).line}`} d={t.d} />
            ))}
            {g.territories.map((t) => {
              const own = coffeeOf(t.id);
              if (!own) return null;
              // on its own edge, and never outside the outer ring (where the names are)
              const edge = ringRadius(frame, familyCounts(own.counts, own.n)[t.tag.index], g.n);
              const at = wheelPoint(frame, Math.min(edge, frame.R - TAG_RADIUS_PX / k), familyAngle(t.tag.index));
              const size = TAG_TEXT_PX / k;
              return (
                <g key={t.id}>
                  <circle className={styles.tagDisc} cx={at.x} cy={at.y} r={TAG_RADIUS_PX / k} />
                  <circle
                    className={`${styles.tagRing} ${styleOf(t.order).line}`}
                    cx={at.x}
                    cy={at.y}
                    r={TAG_RADIUS_PX / k}
                  />
                  <text className={styles.tagText} x={at.x} y={at.y + size * 0.34} fontSize={size} textAnchor="middle">
                    {own.tag.slice(0, 2)}
                  </text>
                </g>
              );
            })}
            <WheelLabels layout={layout} muted={g.labels.map((l) => l.empty)} />
          </g>
        </svg>
      </div>

      {/* With a base, the legend tells the petals from the outlines. Without one
          every coffee is a territory with its letter ON it, and the table's
          header carries the same letters: no legend is needed. */}
      {base ? (
      <ul className={styles.legend}>
        {drawn.map((d, i) => {
          const isBase = d.series.role === "petals";
          const st = isBase ? null : styleOf(base ? i - 1 : i);
          return (
            <li key={d.coffee.id} className={styles.legendItem}>
              <svg className={styles.swatch} viewBox="0 0 28 14" aria-hidden="true" focusable="false">
                {st ? (
                  <line className={`${styles.swatchLine} ${st.line}`} x1="1" x2="27" y1="7" y2="7" />
                ) : (
                  <path className={styles.swatchPetal} d="M 14 14 L 6 3 A 13.6 13.6 0 0 1 22 3 Z" />
                )}
              </svg>
              <span>
                <span className={styles.legendTag}>{d.coffee.tag}</span> {d.coffee.name}
              </span>
            </li>
          );
        })}
      </ul>
      ) : null}

      {g.table.rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{strings.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{strings.familyHeader}</th>
                {drawn.map((d) => (
                  <th key={d.coffee.id} scope="col">
                    <span className={styles.thTag}>{d.coffee.tag}</span>
                    <span className={styles.thN}>{fillPattern(strings.ofN, { n: d.series.n })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.table.rows.map((row) => (
                <tr key={row.family}>
                  <th scope="row">
                    <span className={`${styles.family} ${familyToneClass(row.family)}`}>
                      <span className={styles.familyDot} aria-hidden="true" />
                      {familyLabels[row.family] ?? row.family}
                    </span>
                  </th>
                  {row.counts.map((count, i) => (
                    <td key={i} className={count > 0 ? styles.cell : styles.cellZero}>
                      {count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}

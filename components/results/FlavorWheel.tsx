"use client";

import { useElementWidth } from "@/hooks/useElementWidth";
import { fillPattern } from "@/lib/fillPattern";
import {
  WHEEL_FRAMES,
  wheelGeometry,
  type WheelCounts,
  type WheelFamilyId,
  type WheelFrame,
  type WheelGeometry,
} from "@/lib/flavorWheel";
import { fitWheelLabels, wheelHeadline, type WheelLabelLayout } from "@/lib/flavorWheelLayout";
import { wheelShape, type WheelShape, type WheelShapePart } from "@/lib/flavorWheelShape";
import { familyToneClass } from "@/components/ui/familyTone";
import { captionParts, wheelCaptionText, type WheelCaptionStrings } from "./wheelCaption";
import styles from "./FlavorWheel.module.css";

/** The nine family names, already in the reader's language. */
export type FamilyLabels = Record<WheelFamilyId, string>;

export type FlavorWheelStrings = WheelCaptionStrings & {
  /** "Rueda de sabores de {n} catadores. {list}." */
  aria: string;
  /** One family of that list: "{family} {count}" */
  ariaItem: string;
  /** "Rueda de sabores de {n} catadores: nadie eligió un sabor." */
  ariaNobody: string;
};

/** The whole wheel in one sentence: every family with its count, zeros included. */
export function wheelAriaLabel(
  g: WheelGeometry,
  familyLabels: FamilyLabels,
  strings: FlavorWheelStrings,
): string {
  if (g.top === null) return fillPattern(strings.ariaNobody, { n: g.n });
  const list = g.petals
    .map((p) => fillPattern(strings.ariaItem, { family: familyLabels[p.family] ?? p.family, count: p.count }))
    .join(", ");
  return fillPattern(strings.aria, { n: g.n, list });
}

/** The words around a wheel or a comparison, as laid out by `fitWheelLabels`. */
export function WheelLabels({ layout, muted }: { layout: WheelLabelLayout; muted: readonly boolean[] }) {
  return (
    <>
      {layout.labels.map((label) => (
        <g key={label.family}>
          {label.number ? (
            <text
              className={muted[label.index] ? styles.countMuted : styles.count}
              x={label.number.x}
              y={label.number.y}
              fontSize={layout.numberSize}
              textAnchor="middle"
            >
              {label.number.text}
            </text>
          ) : null}
          {label.name.lines.map((line, j) => (
            <text
              key={j}
              className={muted[label.index] ? styles.nameMuted : styles.name}
              x={label.name.x}
              y={line.y}
              fontSize={layout.nameSize}
              textAnchor={label.name.anchor}
            >
              {line.text}
            </text>
          ))}
        </g>
      ))}
    </>
  );
}

/** A no-break space: the mark stays with the last name, never alone on a line. */
const NBSP = String.fromCharCode(160);

/**
 * A wheel's caption (`wheelCaptionText`) set so that it wraps well: the names
 * may wrap, the tally ("5 de 7 cada una") stays on one line. The full wheel
 * uses it for its headline; a page uses it under a small wheel.
 */
export function WheelCaption({ text }: { text: string }) {
  const { names, tally } = captionParts(text);
  if (tally === null) return <>{names}</>;
  return (
    <>
      {names}
      {`${NBSP}· `}
      <span className={styles.tally}>{tally}</span>
    </>
  );
}

/** The pale ground of a wheel: each family's whole sector, in a tint of its tone. */
export function WheelGrounds({ grounds }: { grounds: readonly WheelShapePart[] }) {
  return (
    <>
      {grounds.map((part) => (
        <path key={part.family} className={`${styles.ground} ${familyToneClass(part.family)}`} d={part.d} />
      ))}
    </>
  );
}

/**
 * The ONE drawing rule of a wheel, small or large (`wheelShape`,
 * lib/flavorWheelShape.ts): the nine grounds, the petals, a paper-coloured line
 * closing each petal, and the outer ring. No ring per person, no line across a
 * petal. The large wheel adds only the words around this.
 */
function WheelMarks({ shape, frame }: { shape: WheelShape; frame: WheelFrame }) {
  return (
    <>
      <WheelGrounds grounds={shape.grounds} />
      {shape.petals.map((part) => (
        <path key={part.family} className={`${styles.petal} ${familyToneClass(part.family)}`} d={part.d} />
      ))}
      {shape.tips.map((part) => (
        <path key={part.family} className={styles.tip} d={part.d} />
      ))}
      <circle className={styles.ringOuter} cx={frame.cx} cy={frame.cy} r={shape.ring} />
    </>
  );
}

function FullWheel({
  counts,
  n,
  familyLabels,
  strings,
  headline,
}: {
  counts: WheelCounts;
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  headline: boolean;
}) {
  const { ref, width } = useElementWidth();
  const frame = WHEEL_FRAMES.full;
  const g = wheelGeometry(counts, n, frame);
  const layout = fitWheelLabels({
    frame,
    width,
    texts: g.petals.map((p) => ({ name: familyLabels[p.family] ?? p.family, number: String(p.count) })),
  });
  const vb = layout.viewBox;
  return (
    <figure className={styles.figure}>
      {headline ? (
        <div className={styles.head}>
          <p className={styles.eyebrow}>{strings.mostFoundLabel}</p>
          <p className={styles.headline}>
            <WheelCaption text={wheelCaptionText(wheelHeadline(counts, n), familyLabels, strings)} />
          </p>
        </div>
      ) : null}
      <div ref={ref} className={styles.frame}>
        <svg
          className={styles.svg}
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          role="img"
          aria-label={wheelAriaLabel(g, familyLabels, strings)}
          focusable="false"
        >
          <g aria-hidden="true">
            <WheelMarks shape={wheelShape(g)} frame={frame} />
            <WheelLabels layout={layout} muted={g.petals.map((p) => p.count === 0)} />
          </g>
        </svg>
      </div>
      {/* with no ring per person, the panel's size is what a petal is "of": always printed */}
      <figcaption className={styles.caption}>
        {g.n === 1 ? strings.cuppersOne : fillPattern(strings.cuppers, { n: g.n })}
      </figcaption>
    </figure>
  );
}

function MiniWheel({
  counts,
  n,
  familyLabels,
  strings,
  decorative,
  medium,
}: {
  counts: WheelCounts;
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  decorative: boolean;
  medium: boolean;
}) {
  const frame = WHEEL_FRAMES.mini;
  const g = wheelGeometry(counts, n, frame);
  return (
    <svg
      className={medium ? styles.medium : styles.mini}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : wheelAriaLabel(g, familyLabels, strings)}
      aria-hidden={decorative ? "true" : undefined}
      focusable="false"
    >
      <WheelMarks shape={wheelShape(g)} frame={frame} />
    </svg>
  );
}

/**
 * One coffee's counted flavour wheel. Each family owns a sector, painted in a
 * pale tint of its tone: the whole sector is "everyone". Over it, a petal in the
 * family's tone, as long as the number of PEOPLE who found it. One outer ring
 * and nothing inside it (the owner's choice, package R1d): a petal is read
 * against its own ground and by the count printed beside it.
 *
 * - `size="full"`: the wheel sizes itself to its column, from 320 px up; the
 *   words always paint at the same size, so on a narrow column the wheel is
 *   smaller, never the text. It prints, itself, what the drawing needs to be
 *   read: over it the families most people found ("Lo más encontrado", then
 *   "Frutal · 6 de 7"; `headline={false}` when the card around it already says
 *   so), beside each family its count and its name, and under it the size of
 *   the panel. Give it the counted list under it (`CountedList`).
 * - `size="mini"`: the same shape with no words, for a row of small wheels. The
 *   caller writes its caption (`wheelCaptionText`); pass `decorative` when that
 *   caption already says what the drawing shows.
 * - `size="medium"`: the small wheel a step larger (112 px), for the one coffee
 *   a tile is about. Same drawing, same rule.
 *
 * It draws; it does not decide. Geometry is `wheelGeometry` (lib/flavorWheel.ts),
 * what is drawn is `wheelShape` (lib/flavorWheelShape.ts, shared with the PDF),
 * the labels are `fitWheelLabels` (lib/flavorWheelLayout.ts), and whether a
 * reader may see a wheel at all is `buildWheelData` (lib/reports/wheelData.ts).
 * The family tone paints petals and grounds only; every word is ink.
 */
export function FlavorWheel({
  counts,
  n,
  familyLabels,
  strings,
  size = "full",
  headline = true,
  decorative = false,
}: {
  /** People per wheel node id: the `rollup` of `countWheelPeople` / `WheelData`. */
  counts: WheelCounts;
  /** The cuppers the counts are "of". */
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  size?: "full" | "mini" | "medium";
  /** Full size only: print the families most people found over the drawing. */
  headline?: boolean;
  /** Mini only: hide the drawing from assistive technology (its caption says it). */
  decorative?: boolean;
}) {
  return size === "mini" || size === "medium" ? (
    <MiniWheel
      counts={counts}
      n={n}
      familyLabels={familyLabels}
      strings={strings}
      decorative={decorative}
      medium={size === "medium"}
    />
  ) : (
    <FullWheel counts={counts} n={n} familyLabels={familyLabels} strings={strings} headline={headline} />
  );
}

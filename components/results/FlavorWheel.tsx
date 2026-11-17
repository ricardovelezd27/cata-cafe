"use client";

import { useId, type ReactNode } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { fillPattern } from "@/lib/fillPattern";
import {
  WHEEL_FAMILY_ORDER,
  WHEEL_FRAMES,
  petalPath,
  wheelGeometry,
  type WheelCounts,
  type WheelFamilyId,
  type WheelFrame,
  type WheelGeometry,
} from "@/lib/flavorWheel";
import { fitWheelLabels, type WheelLabelLayout } from "@/lib/flavorWheelLayout";
import { familyToneClass } from "@/components/ui/familyTone";
import styles from "./FlavorWheel.module.css";

/** The nine family names, already in the reader's language. */
export type FamilyLabels = Record<WheelFamilyId, string>;

export type FlavorWheelStrings = {
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

/** The optional ground: every family's whole sector (the petal of "everyone"),
 *  in a pale tint of its tone. Nothing is drawn when nobody cupped the coffee. */
function FamilyTracks({ frame, n }: { frame: WheelFrame; n: number }) {
  return (
    <>
      {WHEEL_FAMILY_ORDER.map((family, index) => {
        const d = petalPath(frame, index, n, n);
        return d === null ? null : (
          <path key={family} className={`${styles.track} ${familyToneClass(family)}`} d={d} />
        );
      })}
    </>
  );
}

/** An id that is safe inside `url(#...)`. */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function FullWheel({
  counts,
  n,
  familyLabels,
  strings,
  caption,
  tracks,
}: {
  counts: WheelCounts;
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  caption?: ReactNode;
  tracks: boolean;
}) {
  const { ref, width } = useElementWidth();
  const clipId = useSvgId("wheel-petals-");
  const frame = WHEEL_FRAMES.full;
  const g = wheelGeometry(counts, n, frame);
  const layout = fitWheelLabels({
    frame,
    width,
    texts: g.petals.map((p) => ({ name: familyLabels[p.family] ?? p.family, number: String(p.count) })),
  });
  const vb = layout.viewBox;
  const drawn = g.petals.filter((p) => p.d !== null);
  return (
    <figure className={styles.figure}>
      <div ref={ref} className={styles.frame}>
        <svg
          className={styles.svg}
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          role="img"
          aria-label={wheelAriaLabel(g, familyLabels, strings)}
          focusable="false"
        >
          <g aria-hidden="true">
            <clipPath id={clipId}>
              {drawn.map((p) => (
                <path key={p.family} d={p.d as string} />
              ))}
            </clipPath>
            {tracks ? <FamilyTracks frame={frame} n={g.n} /> : null}
            {g.rings.map((ring) => (
              <circle
                key={ring.people}
                className={ring.outer ? styles.ringOuter : styles.ring}
                cx={frame.cx}
                cy={frame.cy}
                r={ring.radius}
              />
            ))}
            {drawn.map((p) => (
              <path key={p.family} className={`${styles.petal} ${familyToneClass(p.family)}`} d={p.d as string} />
            ))}
            {/* the rings again, over the petals only: one step per person */}
            <g clipPath={`url(#${clipId})`}>
              {g.rings
                .filter((ring) => !ring.outer)
                .map((ring) => (
                  <circle key={ring.people} className={styles.cut} cx={frame.cx} cy={frame.cy} r={ring.radius} />
                ))}
            </g>
            <WheelLabels layout={layout} muted={g.petals.map((p) => p.count === 0)} />
          </g>
        </svg>
      </div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

function MiniWheel({
  counts,
  n,
  familyLabels,
  strings,
  decorative,
  tracks,
}: {
  counts: WheelCounts;
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  decorative: boolean;
  tracks: boolean;
}) {
  const frame = WHEEL_FRAMES.mini;
  const g = wheelGeometry(counts, n, frame);
  return (
    <svg
      className={styles.mini}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : wheelAriaLabel(g, familyLabels, strings)}
      aria-hidden={decorative ? "true" : undefined}
      focusable="false"
    >
      {tracks ? <FamilyTracks frame={frame} n={g.n} /> : null}
      {g.petals.map((p) =>
        p.d === null ? null : (
          <path key={p.family} className={`${styles.petal} ${familyToneClass(p.family)}`} d={p.d} />
        ),
      )}
      {g.rings
        .filter((ring) => ring.outer)
        .map((ring) => (
          <circle key={ring.people} className={styles.ringOuter} cx={frame.cx} cy={frame.cy} r={ring.radius} />
        ))}
    </svg>
  );
}

/**
 * One coffee's counted flavour wheel. A ring per person, a petal per family as
 * long as the number of PEOPLE who found it, and beside each family its count
 * (a numeral on the ring, like a clock face) and its name.
 *
 * - `size="full"`: the wheel sizes itself to its column, from 320 px up; the
 *   words always paint at the same size, so on a narrow column the wheel is
 *   smaller, never the text. Give it the counted list under it (`CountedList`).
 * - `size="mini"`: the shape only (petals and the outer ring), for a row of
 *   small wheels. The caller writes its caption ("G · Frutal 7"); pass
 *   `decorative` when that caption already says what the drawing shows.
 *
 * It draws; it does not decide. Geometry is `wheelGeometry` (lib/flavorWheel.ts),
 * the labels are `fitWheelLabels` (lib/flavorWheelLayout.ts), and whether a
 * reader may see a wheel at all is `buildWheelData` (lib/reports/wheelData.ts).
 * The family tone paints petals only; every word is ink.
 */
export function FlavorWheel({
  counts,
  n,
  familyLabels,
  strings,
  size = "full",
  caption,
  decorative = false,
  tracks = false,
}: {
  /** People per wheel node id: the `rollup` of `countWheelPeople` / `WheelData`. */
  counts: WheelCounts;
  /** The cuppers the counts are "of". */
  n: number;
  familyLabels: FamilyLabels;
  strings: FlavorWheelStrings;
  size?: "full" | "mini";
  /** Full size only: a line under the drawing. */
  caption?: ReactNode;
  /** Mini only: hide the drawing from assistive technology (its caption says it). */
  decorative?: boolean;
  /** Draw each family's whole sector in a pale tint of its tone, under the
   *  petals: all nine families are seen, and a petal reads as "this many of
   *  everyone". Off by default (an option put to the owner in package R1b). */
  tracks?: boolean;
}) {
  return size === "mini" ? (
    <MiniWheel
      counts={counts}
      n={n}
      familyLabels={familyLabels}
      strings={strings}
      decorative={decorative}
      tracks={tracks}
    />
  ) : (
    <FullWheel
      counts={counts}
      n={n}
      familyLabels={familyLabels}
      strings={strings}
      caption={caption}
      tracks={tracks}
    />
  );
}

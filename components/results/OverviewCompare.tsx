"use client";

import { useState } from "react";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { CompareOption } from "@/lib/reports/coffeeCards";
import type { CardsStrings } from "./cardsStrings";
import { FlavorCompare, type FlavorCompareStrings } from "./FlavorCompare";
import styles from "./SessionOverview.module.css";

/** How many coffees one comparison draws (`compareGeometry`'s own limit). */
const MAX_COMPARED = 3;

export type OverviewCompareStrings = Pick<CardsStrings, "comparePick" | "compareHint" | "compareNeedTwo">;

/**
 * "Comparar" of the overview's flavour tile: chips for the coffees and, for
 * the two or three chosen, their territories on one wheel with the counts in a
 * table under it. The first three of the ranking to start.
 *
 * WHICH coffees may be compared is decided before this component
 * (`compareOptions`, lib/reports/coffeeCards.ts: a closed session only, and
 * only counts this reader may see). The coffees are told apart by line style
 * and by their letter, never by colour; a chip carries the same letter.
 */
export function OverviewCompare({
  options,
  names,
  short,
  familyLabels,
  ground = "rings",
  strings,
  t,
}: {
  options: CompareOption[];
  /** A coffee's label (and its name once revealed), by sample id. */
  names: Readonly<Record<string, string>>;
  /** What a chip prints beside the letter: the coffee's name once revealed, else its label. */
  short: Readonly<Record<string, string>>;
  familyLabels: Record<WheelFamilyId, string>;
  /** What lies under the territories. One prop on purpose: the owner's to confirm. */
  ground?: "rings" | "families";
  strings: FlavorCompareStrings;
  t: OverviewCompareStrings;
}) {
  const [picked, setPicked] = useState<string[]>(() => options.slice(0, MAX_COMPARED).map((o) => o.id));
  // an option that is gone (the data was refreshed) is no longer chosen
  const chosen = options.filter((o) => picked.includes(o.id));
  const full = chosen.length >= MAX_COMPARED;
  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= MAX_COMPARED ? prev : [...prev, id],
    );

  return (
    <div className={styles.compare}>
      <p className={styles.context}>{t.compareHint}</p>
      <div className={styles.chips} role="group" aria-label={t.comparePick}>
        {options.map((option) => {
          const on = picked.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={styles.pick}
              aria-pressed={on}
              aria-label={names[option.id] ?? option.tag}
              // a fourth coffee cannot be added: the chip says so instead of ignoring the tap
              aria-disabled={!on && full ? true : undefined}
              onClick={() => toggle(option.id)}
            >
              <span className={styles.pickTag} aria-hidden="true">
                {option.tag}
              </span>
              <span className={styles.pickName}>{short[option.id] ?? names[option.id] ?? option.tag}</span>
            </button>
          );
        })}
      </div>
      {chosen.length >= 2 ? (
        <FlavorCompare
          others={chosen.map((o) => ({
            id: o.id,
            tag: o.tag,
            name: names[o.id] ?? o.tag,
            counts: o.series.counts,
            n: o.series.n,
          }))}
          familyLabels={familyLabels}
          strings={strings}
          ground={ground}
        />
      ) : (
        <p role="status" className={styles.notice}>
          {t.compareNeedTwo}
        </p>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { CountBar as CountBarData } from "@/lib/resultsScales";
import { familyToneClass } from "./familyTone";
import styles from "./CountBar.module.css";

/**
 * A counted row: "Frutos rojos ▬▬▬▬▬▬ 6 de 7". The bar is as long as the share
 * of PEOPLE (`bar` comes from `countBar` in lib/resultsScales.ts, which owns the
 * arithmetic); the count and its n are always printed beside it, so the bar is
 * never read alone (DESIGN.md "Data display": every count carries its n).
 *
 * The family's tone paints the dot and the bar only; the name and the number
 * are ink. `valueText` is the caller's sentence ("6 de 7"), already in the
 * reader's language.
 */
export function CountBar({
  as: Tag = "div",
  label,
  bar,
  valueText,
  family,
  marked = false,
  markText,
}: {
  /** "li" inside a list (the counted list); "div" when it stands alone. */
  as?: "div" | "li";
  label: ReactNode;
  bar: CountBarData;
  valueText: string;
  /** The family whose tone paints the dot and the bar; neutral without one. */
  family?: WheelFamilyId | null;
  /** The reader chose this one: a ring around the dot. */
  marked?: boolean;
  /** What the ring means ("elegido por ti"), read out with the row. */
  markText?: string;
}) {
  return (
    <Tag className={`${styles.row} ${familyToneClass(family)}`}>
      <span className={marked ? `${styles.dot} ${styles.marked}` : styles.dot} aria-hidden="true" />
      <span className={styles.label}>
        {label}
        {marked && markText ? <span className="sr-only"> ({markText})</span> : null}
      </span>
      <svg className={styles.track} height="8" aria-hidden="true" focusable="false">
        <rect className={styles.trackBg} x="0" y="0" width="100%" height="8" rx="4" />
        {bar.pct > 0 ? <rect className={styles.fill} x="0" y="0" width={`${bar.pct}%`} height="8" rx="4" /> : null}
      </svg>
      <span className={styles.value}>{valueText}</span>
    </Tag>
  );
}

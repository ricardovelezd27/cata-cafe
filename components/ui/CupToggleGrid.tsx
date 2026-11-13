"use client";

import { useState } from "react";
import { Info, Pencil } from "lucide-react";
import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import type { CupCopy } from "@/lib/cupCopy";
import styles from "./CupToggleGrid.module.css";

interface CupToggleGridProps {
  cupsPerSample: number;
  nonUniformBools: boolean[];
  defectiveBools: boolean[];
  /** One entry per cup: the defect type of a defective cup, else null. */
  cupTypes: (SensoryDefect | null)[];
  copy: CupCopy;
  /** Group sessions add "your cups are added to the group's" to the hint. */
  isGroup: boolean;
  onToggleNonUniform: (idx: number) => void;
  /** A type marks the cup defective; null removes the mark (and the type). */
  onSetDefect: (idx: number, type: SensoryDefect | null) => void;
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl);

/**
 * Cup grid of the cupping form (S10 WP1b). Two rows with 2+ cups (non-uniform,
 * defective), ONE row at a single cup (uniformity does not exist there, said
 * in a line). Marking a cup defective asks for its type right away: tapping a
 * defective-row cup opens a small inline choice under the grid with the three
 * types (a cup without a type is not marked); the chosen type is written on the
 * cup's chip (text, not colour alone) and can be changed or removed.
 * TODO(kim-validar:A3)
 */
export function CupToggleGrid({
  cupsPerSample,
  nonUniformBools,
  defectiveBools,
  cupTypes,
  copy,
  isGroup,
  onToggleNonUniform,
  onSetDefect,
}: CupToggleGridProps) {
  const [picking, setPicking] = useState<number | null>(null);
  const showUniformity = cupsPerSample >= 2;
  const hint = isGroup ? `${copy.scoreHintGroup} ${copy.scoreHint}` : copy.scoreHint;
  const marked = Array.from({ length: cupsPerSample }, (_, i) => i).filter((i) => defectiveBools[i]);

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        {showUniformity && (
          <span className={`${styles.legendItem} ${styles.nonUniform}`}>
            <span className={`${styles.legendDot} ${styles.legendDotNonUniform}`} />
            {copy.nonUniformLegend}
          </span>
        )}
        <span className={`${styles.legendItem} ${styles.defective}`}>
          <span className={`${styles.legendDot} ${styles.legendDotDefective}`} />
          {copy.defectiveLegend}
        </span>
      </div>

      {showUniformity && (
        <div className={styles.row}>
          <div className={`${styles.rowLabel} ${styles.nonUniform}`}>
            {copy.nonUniform}
            <span className={styles.rowHint}>{copy.oneTap}</span>
          </div>
          <div className={styles.grid}>
            {Array.from({ length: cupsPerSample }, (_, i) => {
              const isNU = nonUniformBools[i];
              const isDef = defectiveBools[i];
              const cls = isDef
                ? `${styles.cup} ${styles.isDefective}`
                : isNU
                  ? `${styles.cup} ${styles.isNonUniform}`
                  : styles.cup;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (picking === i) setPicking(null);
                    onToggleNonUniform(i);
                  }}
                  className={cls}
                  aria-label={fill(copy.cupNonUniformAria, { n: i + 1 })}
                  aria-pressed={isNU}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.row}>
        <div className={`${styles.rowLabel} ${styles.defective}`}>
          {copy.defective}
          <span className={styles.rowHint}>{copy.oneTap}</span>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: cupsPerSample }, (_, i) => {
            const isDef = defectiveBools[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicking(picking === i ? null : i)}
                className={`${styles.cup} ${isDef ? styles.isDefective : ""}`}
                aria-label={fill(copy.cupDefectiveAria, { n: i + 1 })}
                aria-pressed={isDef}
                aria-expanded={picking === i}
              >
                {isDef ? "✗" : i + 1}
              </button>
            );
          })}
        </div>
        {!showUniformity && (
          <span className={styles.note}>
            <Info size={12} aria-hidden />
            {copy.oneCupNote}
          </span>
        )}
      </div>

      {picking !== null && picking < cupsPerSample && (
        <div
          role="group"
          aria-label={fill(copy.pickTitle, { n: picking + 1 })}
          className="flex flex-col gap-2 rounded-card border border-outline-variant bg-surface-container-low p-3"
        >
          <div className="font-sans text-sm font-semibold text-on-surface">
            {fill(copy.pickTitle, { n: picking + 1 })}
          </div>
          <div className="flex flex-wrap gap-2">
            {SENSORY_DEFECTS.map((dt) => {
              const active = cupTypes[picking] === dt && defectiveBools[picking];
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => {
                    onSetDefect(picking, dt);
                    setPicking(null);
                  }}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-pill border px-4 font-sans text-sm font-medium ${
                    active
                      ? "border-error bg-error text-on-error"
                      : "border-outline bg-surface text-on-surface"
                  }`}
                >
                  {copy.types[dt]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-sans text-xs text-on-surface-variant">{copy.pickHelp}</span>
            <span className="flex gap-2">
              {defectiveBools[picking] && (
                <button
                  type="button"
                  onClick={() => {
                    onSetDefect(picking, null);
                    setPicking(null);
                  }}
                  className="min-h-[44px] rounded-pill border border-outline px-4 font-sans text-sm text-on-surface"
                >
                  {copy.removeMark}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="min-h-[44px] rounded-pill px-4 font-sans text-sm text-on-surface-variant"
              >
                {copy.closePicker}
              </button>
            </span>
          </div>
        </div>
      )}

      {marked.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={copy.defectType}>
          {marked.map((i) => {
            const type = cupTypes[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicking(i)}
                aria-label={fill(copy.changeTypeAria, { n: i + 1 })}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border px-3 font-sans text-sm ${
                  type
                    ? "border-error/40 bg-error-container text-on-error-container"
                    : "border-error bg-surface text-error"
                }`}
              >
                <span className="font-semibold tabular-nums">{i + 1}</span>
                <span aria-hidden>·</span>
                <span>{type ? copy.types[type] : copy.typeMissing}</span>
                <Pencil size={12} aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      <span className={styles.note}>
        <Info size={12} aria-hidden />
        {hint}
      </span>
    </div>
  );
}

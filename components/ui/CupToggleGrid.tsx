"use client";

import { Info } from "lucide-react";
import styles from "./CupToggleGrid.module.css";

interface CupToggleGridProps {
  cupsPerSample: number;
  nonUniformBools: boolean[];
  defectiveBools: boolean[];
  defectTypes: string[];
  defectOptions: readonly string[];
  defectLabels: Record<string, string>;
  /** Labels for the legend + row headings. */
  labels: {
    nonUniform: string;       // "No uniformes"
    defective: string;        // "Defectuosas"
    nonUniformLegend: string; // "No uniforme"
    defectiveLegend: string;  // "Defectuosa"
    oneTap: string;           // "(1 toque)"
    defectType: string;       // "Tipo de defecto"
    notScored: string;        // "Se registra pero no afecta el puntaje (requiere ≥5 tazas)"
  };
  /** True when uniformity is part of the score (cupsPerSample >= 5). */
  uniformityInScore: boolean;
  onToggleNonUniform: (idx: number) => void;
  onToggleDefective: (idx: number) => void;
  onToggleDefectType: (type: string) => void;
}

export function CupToggleGrid({
  cupsPerSample,
  nonUniformBools,
  defectiveBools,
  defectTypes,
  defectOptions,
  defectLabels,
  labels,
  uniformityInScore,
  onToggleNonUniform,
  onToggleDefective,
  onToggleDefectType,
}: CupToggleGridProps) {
  const anyDefective = defectiveBools.some(Boolean);

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={`${styles.legendItem} ${styles.nonUniform}`}>
          <span className={`${styles.legendDot} ${styles.legendDotNonUniform}`} />
          {labels.nonUniformLegend}
        </span>
        <span className={`${styles.legendItem} ${styles.defective}`}>
          <span className={`${styles.legendDot} ${styles.legendDotDefective}`} />
          {labels.defectiveLegend}
        </span>
      </div>

      <div className={styles.row}>
        <div className={`${styles.rowLabel} ${styles.nonUniform}`}>
          {labels.nonUniform}
          <span className={styles.rowHint}>{labels.oneTap}</span>
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
                onClick={() => onToggleNonUniform(i)}
                className={cls}
                aria-label={`Cup ${i + 1} non-uniform`}
                aria-pressed={isNU}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        {!uniformityInScore && (
          <span className={styles.note}>
            <Info size={12} aria-hidden />
            {labels.notScored}
          </span>
        )}
      </div>

      <div className={styles.row}>
        <div className={`${styles.rowLabel} ${styles.defective}`}>
          {labels.defective}
          <span className={styles.rowHint}>{labels.oneTap}</span>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: cupsPerSample }, (_, i) => {
            const isDef = defectiveBools[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggleDefective(i)}
                className={`${styles.cup} ${isDef ? styles.isDefective : ""}`}
                aria-label={`Cup ${i + 1} defective`}
                aria-pressed={isDef}
              >
                {isDef ? "✗" : i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {anyDefective && (
        <div className={styles.row}>
          <div className={styles.rowLabel}>{labels.defectType}</div>
          <div className={styles.defectPills}>
            {defectOptions.map((dt) => {
              const active = defectTypes.includes(dt);
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => onToggleDefectType(dt)}
                  className={`${styles.defectPill} ${active ? styles.active : ""}`}
                  aria-pressed={active}
                >
                  {defectLabels[dt] ?? dt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

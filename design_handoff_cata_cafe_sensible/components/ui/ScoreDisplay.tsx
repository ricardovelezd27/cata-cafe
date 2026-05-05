'use client'
import { useState } from 'react'
import { calculateCVABreakdown, scoreBand, scoreToCategory, SCORE_CATEGORY_LABELS } from '@/lib/scoring'
import { CUPPING_SECTIONS } from '@/lib/constants'
import styles from './ScoreDisplay.module.css'

export interface ScoreDisplayProps {
  sectionScores: number[]
  nonUniformCups: number
  defectiveCups: number
  expandable?: boolean
  defaultExpanded?: boolean
}

export function ScoreDisplay({
  sectionScores,
  nonUniformCups,
  defectiveCups,
  expandable = true,
  defaultExpanded = false,
}: ScoreDisplayProps) {
  const [open, setOpen] = useState(defaultExpanded)
  const b = calculateCVABreakdown(sectionScores, nonUniformCups, defectiveCups)
  const band = scoreBand(b.score)
  const category = scoreToCategory(b.score)

  const [whole, decimal] = b.score.toFixed(2).split('.')

  return (
    <div className={`${styles.card} ${styles[band]}`}>
      <span className={styles.band}>{SCORE_CATEGORY_LABELS[category]}</span>
      <p className={styles.label}>Puntuación CVA</p>
      <div className={styles.num}>
        {whole}
        <span className={styles.decimal}>.{decimal}</span>
      </div>

      <dl className={styles.formula}>
        <dt><span>Σhᵢ</span> Suma afectiva</dt>
        <dd className={styles.positive}>+ {b.affectiveSum.toFixed(2)}</dd>
        <dt><span>×0.65625</span> Coeficiente</dt>
        <dd>{b.affectiveTerm.toFixed(2)}</dd>
        <dt><span>+ 52.75</span> Constante</dt>
        <dd>{(b.affectiveTerm + 52.75).toFixed(2)}</dd>
        {b.uniformityPenalty > 0 && (
          <>
            <dt><span>2u</span> Penalización uniformidad ({b.nonUniformCups})</dt>
            <dd className={styles.penalty}>− {b.uniformityPenalty.toFixed(2)}</dd>
          </>
        )}
        {b.defectPenalty > 0 && (
          <>
            <dt><span>4d</span> Penalización defectos ({b.defectiveCups})</dt>
            <dd className={styles.penalty}>− {b.defectPenalty.toFixed(2)}</dd>
          </>
        )}
      </dl>

      {expandable && (
        <button type="button" className={styles.expand} onClick={() => setOpen((o) => !o)}>
          <span>{open ? 'Ocultar desglose' : 'Ver desglose'}</span>
          <span className={styles.expandIcon} aria-hidden>{open ? '↑' : '↓'}</span>
        </button>
      )}

      {open && (
        <ul className={styles.sections}>
          {CUPPING_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <span>{s.labelEs}</span>
              <span className={styles.sectionScore}>{(b.sectionScores[i] ?? 0).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

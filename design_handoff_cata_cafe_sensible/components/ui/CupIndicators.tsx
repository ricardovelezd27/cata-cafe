'use client'
import { SENSORY_DEFECT_LABELS, type SensoryDefect } from '@/lib/constants'
import styles from './CupIndicators.module.css'

export interface CupIndicatorsProps {
  totalCups?: number
  nonUniform?: number[]
  defective?: { cup: number; type: SensoryDefect }[]
  showSummary?: boolean
}

export function CupIndicators({
  totalCups = 5,
  nonUniform = [],
  defective = [],
  showSummary = false,
}: CupIndicatorsProps) {
  const cups = Array.from({ length: totalCups }, (_, i) => i + 1)
  const nonUniformSet = new Set(nonUniform)
  const defectMap = new Map(defective.map((d) => [d.cup, d.type]))

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        {cups.map((n) => {
          const defect = defectMap.get(n)
          const isNonUniform = nonUniformSet.has(n)
          let cls = styles.uniform
          if (defect) cls = styles.defective
          else if (isNonUniform) cls = styles.nonuniform

          return (
            <div key={n} className={`${styles.cup} ${cls}`}>
              <div className={styles.circle}><span>{n}</span></div>
              {defect && <span className={styles.defectBadge}>{SENSORY_DEFECT_LABELS[defect]}</span>}
            </div>
          )
        })}
      </div>

      {showSummary && (
        <div className={styles.summary}>
          <span>Uniformidad <strong>{totalCups - nonUniform.length - defective.length}/{totalCups}</strong></span>
          <span>No unif. <strong>{nonUniform.length}</strong></span>
          <span>Defectos <strong>{defective.length}</strong></span>
        </div>
      )}
    </div>
  )
}

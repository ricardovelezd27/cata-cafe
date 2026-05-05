'use client'
import { AFFECTIVE_LABELS } from '@/lib/constants'
import styles from './AffectiveBubbles.module.css'

export interface AffectiveBubblesProps {
  value: number | null
  onChange: (v: number) => void
  label?: string
  disabled?: boolean
  showFinal?: boolean
}

export function AffectiveBubbles({ value, onChange, label, disabled, showFinal = true }: AffectiveBubblesProps) {
  return (
    <div className={`${styles.root} ${disabled ? styles.locked : ''}`}>
      {label && (
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          {value !== null && (
            <span className={styles.finalBadge}>Final · {value.toFixed(2)}</span>
          )}
        </div>
      )}

      <div className={styles.row}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const selected = value === n
          const tone = selected ? (n >= 7 ? 'high' : n <= 3 ? 'low' : 'mid') : ''
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`${styles.bubble} ${selected ? styles.selected : ''} ${tone ? styles[tone] : ''}`}
              aria-label={`${n} — ${AFFECTIVE_LABELS[n]}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          )
        })}

        {showFinal && (
          <div className={`${styles.final} ${value !== null ? styles.finalSet : ''}`}>
            <span className={styles.finalCap}>Final</span>
            <span className={styles.finalInput}>{value ?? '—'}</span>
          </div>
        )}
      </div>

      <div className={styles.scale}>
        <div className={styles.scaleInner}>
          <span>{AFFECTIVE_LABELS[1]}</span>
          <span>{AFFECTIVE_LABELS[5]}</span>
          <span>{AFFECTIVE_LABELS[9]}</span>
        </div>
        {showFinal && <div className={styles.scaleSpacer} />}
      </div>
    </div>
  )
}

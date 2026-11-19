'use client'
import { useRef, type KeyboardEvent } from 'react'
import { nextRovingIndex, tabStopIndex } from '@/lib/rovingFocus'
import styles from './AffectiveBubbles.module.css'

/** The 1-9 quality scale's words (messages `cupping.scale`, P5b). `labels[0]` names 1.
 *  They are the radios' ACCESSIBLE NAMES only: the owner removed the visible scale words
 *  and the FINAL readout (2026-11-19). */
export type ScaleCopy = { labels: string[] }

/** Used only when the cup error boundary rehydrates an older cached prop blob without
 *  `scale` (the PARTIAL_COPY_FALLBACK idea). tests/cupScale.test.ts keeps it equal to the
 *  message files. */
export const SCALE_COPY_FALLBACK: Record<'es' | 'en', ScaleCopy> = {
  es: {
    labels: [
      'Extremadamente bajo',
      'Muy bajo',
      'Moderadamente bajo',
      'Ligeramente bajo',
      'Ni alto ni bajo',
      'Ligeramente alto',
      'Moderadamente alto',
      'Muy alto',
      'Extremadamente alto',
    ],
  },
  en: {
    labels: [
      'Extremely low',
      'Very low',
      'Moderately low',
      'Slightly low',
      'Neither high nor low',
      'Slightly high',
      'Moderately high',
      'Very high',
      'Extremely high',
    ],
  },
}

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export interface AffectiveBubblesProps {
  value: number | null
  onChange: (v: number) => void
  label?: string
  /** The attribute's name, read as the group's name (P5b, H-08). Falls back to `label`. */
  ariaLabel?: string
  disabled?: boolean
  /** The scale's words in the page's language; defaults to Spanish. */
  scale?: ScaleCopy
}

/**
 * One quality rating, 1 to 9 (P5b, audit H-08): a RADIO GROUP, so the row is ONE Tab stop
 * (the checked bubble, or 1 when nothing is checked), and the arrow keys, Home and End move
 * and check (`lib/rovingFocus.ts`, the keyboard of P5a's radio groups). A key checks by
 * calling the same `onChange(n)` a tap calls, so the form writes exactly what a tap writes.
 * Space or Enter on a focused bubble is the button's own click. A locked row (pinned
 * reference, "no evaluado") has no Tab stop.
 */
export function AffectiveBubbles({ value, onChange, label, ariaLabel, disabled, scale }: AffectiveBubblesProps) {
  const copy = scale ?? SCALE_COPY_FALLBACK.es
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const off = VALUES.map(() => !!disabled)
  const checked = value === null ? -1 : VALUES.indexOf(value as (typeof VALUES)[number])
  const stop = tabStopIndex(checked, off)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingIndex(e.key, index, off)
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
    if (next !== checked) onChange(VALUES[next])
  }

  return (
    <div className={`${styles.root} ${disabled ? styles.locked : ''}`}>
      {label && (
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
        </div>
      )}

      <div className={styles.row} role="radiogroup" aria-label={ariaLabel ?? label} aria-disabled={disabled || undefined}>
        {VALUES.map((n, index) => {
          const selected = value === n
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === stop ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onKeyDown(e, index)}
              // A-06 (decision 5, TODO(kim-validar:A-06)): one selected colour for every value; a score has no band.
              className={`${styles.bubble} ${selected ? styles.selected : ''}`}
              aria-label={`${n} — ${copy.labels[n - 1]}`}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

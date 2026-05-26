'use client'
import { useId } from 'react'
import styles from './IntensitySlider.module.css'

export interface IntensitySliderProps {
  value: number | null
  onChange: (v: number) => void
  label?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}

const ANCHORS: { v: number; label: string }[] = [
  { v: 0,  label: 'LOW' },
  { v: 5,  label: '' },
  { v: 10, label: 'MEDIUM' },
  { v: 15, label: 'HIGH' },
]

export function IntensitySlider({
  value,
  onChange,
  label,
  disabled = false,
  min = 0,
  max = 15,
  step = 1,
}: IntensitySliderProps) {
  const id = useId()
  const v = value ?? 0
  const pct = ((v - min) / (max - min)) * 100
  const empty = value === null

  return (
    <div className={`${styles.root} ${disabled ? styles.locked : ''} ${empty ? styles.empty : ''}`}>
      {label && (
        <div className={styles.head}>
          <label htmlFor={id} className={styles.label}>{label}</label>
          <span className={styles.valueDisplay}>
            {empty ? <em>Sin marcar</em> : <><span className={styles.num}>{String(v)}</span><span className={styles.cap}>/15</span></>}
          </span>
        </div>
      )}
      <div className={styles.track}>
        {!empty && <div className={styles.fill} style={{ width: `${pct}%` }} />}
        <div className={styles.thumb} style={{ left: `${empty ? 0 : pct}%` }} aria-hidden />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          disabled={disabled}
          onChange={(e) => onChange(Math.round(Number(e.target.value)))}
          className={styles.input}
          aria-label={label}
        />
      </div>
      <div className={styles.ticks}>
        {ANCHORS.map((a, i) => (
          <div key={a.v} className={styles.tick} style={{ textAlign: i === 0 ? 'left' : i === ANCHORS.length - 1 ? 'right' : 'center' }}>
            <span className={styles.tickNum}>{a.v}</span>
            {a.label && <span className={styles.tickLabel}>{a.label}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

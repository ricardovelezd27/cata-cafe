'use client'
import { useEffect, useId, useRef } from 'react'
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

const ANCHORS: number[] = [0, 5, 10, 15]

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
  const inputRef = useRef<HTMLInputElement>(null)
  const v = value ?? 0
  const pct = ((v - min) / (max - min)) * 100
  const empty = value === null

  // Prevent the mouse wheel from changing the value while the user is just
  // scrolling the page. Only respond once the control has been focused
  // (tapped/clicked). A native non-passive listener is required because React's
  // synthetic onWheel is registered passively and cannot call preventDefault().
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

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
          ref={inputRef}
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
        {ANCHORS.map((v, i) => (
          <div key={v} className={styles.tick} style={{ textAlign: i === 0 ? 'left' : i === ANCHORS.length - 1 ? 'right' : 'center' }}>
            <span className={styles.tickNum}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

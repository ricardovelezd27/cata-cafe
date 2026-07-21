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

// Pixels the finger must travel before we commit to an intent (scroll vs slide).
// Mirrors the platform "touch slop" — large enough that a jittery tap or the
// start of a vertical scroll is never read as a horizontal drag.
const TOUCH_SLOP = 10

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
  const trackRef = useRef<HTMLDivElement>(null)
  // Latest onChange/disabled without re-subscribing the native listeners.
  // Synced in an effect (not during render) — the refs are only read inside
  // event handlers, which always fire after effects have committed.
  const onChangeRef = useRef(onChange)
  const disabledRef = useRef(disabled)
  useEffect(() => {
    onChangeRef.current = onChange
    disabledRef.current = disabled
  })

  const v = value ?? 0
  const pct = ((v - min) / (max - min)) * 100
  const empty = value === null

  // Map an absolute clientX to a stepped value using the track geometry.
  const commitFromClientX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const raw = min + ratio * (max - min)
    const stepped = Math.round(raw / step) * step
    onChangeRef.current(Math.min(max, Math.max(min, stepped)))
  }

  // --- Touch: directional lock ------------------------------------------------
  // A native range input snaps to the touched X on first contact, so a vertical
  // scroll that merely starts on the slider would jump the value. We bypass that
  // by handling touch ourselves: wait for TOUCH_SLOP of movement, then decide.
  // Vertical-dominant gestures fall through to the page (scroll, no value
  // change); horizontal-dominant gestures lock the slider and call
  // preventDefault so the page stays put. A tap (no movement) sets the value at
  // the tapped position, matching normal slider behaviour.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    let startX = 0
    let startY = 0
    let mode: 'undecided' | 'slide' | 'scroll' = 'undecided'

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current) return
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      mode = 'undecided'
      // Do NOT preventDefault or change the value here — that would either block
      // scrolling or cause the snap-on-contact jump we're trying to avoid.
    }

    const onTouchMove = (e: TouchEvent) => {
      if (disabledRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (mode === 'undecided') {
        if (Math.hypot(dx, dy) < TOUCH_SLOP) return
        // Bias toward scroll: only lock the slider when horizontal motion
        // clearly dominates (≈ within 45° of horizontal).
        mode = Math.abs(dx) > Math.abs(dy) ? 'slide' : 'scroll'
      }

      if (mode === 'slide') {
        e.preventDefault() // claim the gesture — keep the page from scrolling
        commitFromClientX(t.clientX)
      }
      // mode === 'scroll': do nothing, let the browser scroll the page.
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (disabledRef.current) return
      // Pure tap: finger lifted (touchend) without ever crossing the slop
      // threshold. Set the value at the tapped position, like a normal slider.
      if (mode === 'undecided') {
        const t = e.changedTouches[0]
        commitFromClientX(t.clientX)
        inputRef.current?.focus()
      }
      mode = 'undecided'
    }

    // touchcancel means the browser took the gesture over (e.g. it started
    // scrolling). Never treat this as a tap — just reset, leave the value alone.
    const onTouchCancel = () => {
      mode = 'undecided'
    }

    // Non-passive so preventDefault() works inside touchmove (React's synthetic
    // touch handlers are passive and cannot cancel scrolling).
    track.addEventListener('touchstart', onTouchStart, { passive: true })
    track.addEventListener('touchmove', onTouchMove, { passive: false })
    track.addEventListener('touchend', onTouchEnd, { passive: true })
    track.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      track.removeEventListener('touchstart', onTouchStart)
      track.removeEventListener('touchmove', onTouchMove)
      track.removeEventListener('touchend', onTouchEnd)
      track.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [min, max, step])

  // --- Mouse / pen: immediate drag (no scroll conflict) -----------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'touch') return // touch handled above
    e.currentTarget.setPointerCapture(e.pointerId)
    commitFromClientX(e.clientX)
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'touch') return
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    commitFromClientX(e.clientX)
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

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
      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
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

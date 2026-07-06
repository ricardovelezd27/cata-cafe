'use client'
import styles from './CATAPills.module.css'
import { shadeForLevel, getContrastTextColor } from '@/lib/constants'

export interface CATASubItem {
  id: string
  label: string
}

export interface CATAOption {
  id: string
  label: string
  color: string
  subItems?: readonly CATASubItem[]
}

export interface CATAPillsProps {
  options: readonly CATAOption[]
  selected: string[]
  onChange: (next: string[]) => void
  maxSelect?: number
  showSubItems?: boolean
  disabled?: boolean
}

function getCounterColor(count: number, max: number): string {
  if (count >= max) return '#A83232'
  if (count >= max - 1) return '#C17817'
  return '#3D5A3E'
}

export function CATAPills({ options, selected, onChange, maxSelect, showSubItems = false, disabled }: CATAPillsProps) {
  // A parent with at least one selected sub doesn't count toward the limit —
  // only the subs do. Parents with no selected subs count as 1.
  const parentSubMap = new Map<string, string[]>(
    options.map((o) => [o.id, (o.subItems ?? []).map((s) => s.id)])
  )
  const selectedSet = new Set(selected)
  const isCountedSelection = (id: string): boolean => {
    const subs = parentSubMap.get(id)
    if (subs && subs.length > 0) {
      // It's a parent — count only if none of its subs are selected.
      return !subs.some((sid) => selectedSet.has(sid))
    }
    return true
  }
  const effectiveCount = selected.filter(isCountedSelection).length
  const atLimit = maxSelect !== undefined && effectiveCount >= maxSelect

  function toggle(id: string) {
    if (disabled) return
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else if (!atLimit) {
      onChange([...selected, id])
    }
  }

  return (
    <div className={styles.root}>
      {maxSelect !== undefined && (
        <div className={styles.counter}>
          <span>Selecciona hasta {maxSelect}</span>
          <span
            className={styles.count}
            style={{ color: effectiveCount > 0 ? getCounterColor(effectiveCount, maxSelect) : undefined }}
          >
            <strong>{effectiveCount}</strong>/{maxSelect}
          </span>
        </div>
      )}

      <div className={styles.familyList}>
        {options.map((opt) => {
          const isSel = selected.includes(opt.id)
          const hasSubItems = showSubItems && opt.subItems && opt.subItems.length > 0

          return (
            <div key={opt.id} className={styles.family}>
              <button
                type="button"
                disabled={disabled || (!isSel && atLimit)}
                onClick={() => toggle(opt.id)}
                aria-pressed={isSel}
                className={`${styles.pill} ${isSel ? styles.selected : ''}`}
                style={
                  {
                    '--pill-color': opt.color,
                    '--pill-bg-soft': `color-mix(in oklch, ${opt.color} 10%, transparent)`,
                    '--pill-text': getContrastTextColor(opt.color),
                  } as React.CSSProperties
                }
              >
                <span className={styles.dot} />
                {opt.label}
              </button>

              {hasSubItems && isSel && (
                <div className={styles.subRow}>
                  {opt.subItems!.map((sub) => {
                    const isSubSel = selected.includes(sub.id)
                    const isSubDisabled = disabled || (!isSubSel && atLimit)
                    const subColor = shadeForLevel(opt.color, 3)
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        disabled={isSubDisabled}
                        onClick={() => toggle(sub.id)}
                        aria-pressed={isSubSel}
                        className={`${styles.pill} ${styles.sub} ${isSubSel ? styles.selected : ''}`}
                        style={
                          {
                            '--pill-color': subColor,
                            '--pill-bg-soft': `color-mix(in oklch, ${subColor} 10%, transparent)`,
                            '--pill-text': getContrastTextColor(subColor),
                          } as React.CSSProperties
                        }
                      >
                        <span className={styles.dot} />
                        {sub.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

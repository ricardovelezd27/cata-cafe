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
      // Deselecting a parent must also clear its subItems — otherwise their ids
      // remain in `selected` after the subRow (which only renders while the
      // parent is selected) disappears, leaving invisible selections that still
      // count toward maxSelect and can permanently lock the picker at the limit.
      const subs = parentSubMap.get(id)
      const idsToRemove = subs && subs.length > 0 ? [id, ...subs] : [id]
      onChange(selected.filter((s) => !idsToRemove.includes(s)))
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
          // Defensive: a stale draft saved before this fix could still have a
          // sub selected while its parent isn't (the old bug's aftermath). Show
          // the subRow in that case too, so an orphaned sub is always visible
          // and deselectable rather than invisible-but-counted.
          const hasSelectedSub = hasSubItems && opt.subItems!.some((s) => selected.includes(s.id))

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

              {hasSubItems && (isSel || hasSelectedSub) && (
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

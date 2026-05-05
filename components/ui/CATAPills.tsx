'use client'
import styles from './CATAPills.module.css'

export interface CATAOption {
  id: string
  label: string
  color: string
  subItems?: readonly string[]
}

export interface CATAPillsProps {
  options: readonly CATAOption[]
  selected: string[]
  onChange: (next: string[]) => void
  maxSelect?: number
  showSubItems?: boolean
  disabled?: boolean
}

export function CATAPills({ options, selected, onChange, maxSelect, showSubItems = false, disabled }: CATAPillsProps) {
  const atLimit = maxSelect !== undefined && selected.length >= maxSelect

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
          <span className={styles.count}>
            <strong>{selected.length}</strong>/{maxSelect}
          </span>
        </div>
      )}

      <div className={styles.familyList}>
        {options.map((opt) => {
          const isSel = selected.includes(opt.id)
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
                  } as React.CSSProperties
                }
              >
                <span className={styles.dot} />
                {opt.label}
              </button>

              {showSubItems && isSel && opt.subItems && opt.subItems.length > 0 && (
                <div className={styles.subRow}>
                  {opt.subItems.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      className={`${styles.pill} ${styles.sub}`}
                      style={
                        {
                          '--pill-color': opt.color,
                          '--pill-bg-soft': `color-mix(in oklch, ${opt.color} 10%, transparent)`,
                        } as React.CSSProperties
                      }
                    >
                      <span className={styles.dot} />
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

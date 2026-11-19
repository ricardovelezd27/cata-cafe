"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { nextRovingIndex, tabStopIndex } from "@/lib/rovingFocus";
import styles from "./ModuleSwitcher.module.css";

export type ModuleItem = {
  key: string;
  label: string;
  icon: ReactNode;
  /**
   * If true, selecting this item triggers an action (e.g. navigation)
   * rather than swapping the active state. The component still calls
   * onSelect; the parent decides what to do.
   */
  isAction?: boolean;
  disabled?: boolean;
  /** Optional trailing badge (e.g. a "Beta" pill) rendered next to the label. */
  badge?: ReactNode;
};

interface ModuleSwitcherProps {
  modules: ModuleItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  header?: string;
}

/**
 * The cupping screen's modules (P5b, audit D-02 / H-08). The modules that swap the page's
 * panel (evaluation, physical, origin) are TABS inside the page: a vertical tablist, one Tab
 * stop, the arrow keys, Home and End move the focus (`lib/rovingFocus.ts`), Enter or Space
 * selects (manual: a module change runs the page's own handler). An ACTION item (it leaves
 * the page, e.g. "Resultados") is not a tab: it stays a plain button after the tablist.
 */
export function ModuleSwitcher({
  modules,
  activeKey,
  onSelect,
  header,
}: ModuleSwitcherProps) {
  const tabs = modules.filter((m) => !m.isAction);
  const actions = modules.filter((m) => m.isAction);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = tabs.map((m) => !!m.disabled);
  const stop = tabStopIndex(tabs.findIndex((m) => m.key === activeKey), disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingIndex(e.key, index, disabled);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
  };

  const row = (m: ModuleItem) => (
    <>
      <span className={styles.icon} aria-hidden>
        {m.icon}
      </span>
      <span className={styles.label}>{m.label}</span>
      {m.badge}
      {m.isAction && (
        <span className={styles.chevron} aria-hidden>
          →
        </span>
      )}
    </>
  );

  return (
    <div>
      {header && <div className={styles.header} aria-hidden>{header}</div>}
      <ul role="tablist" aria-label={header ?? "Modules"} aria-orientation="vertical" className="m-0 list-none p-0">
        {tabs.map((m, index) => {
          const isActive = m.key === activeKey;
          return (
            <li key={m.key} role="presentation">
              <button
                ref={(el) => {
                  refs.current[index] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={index === stop ? 0 : -1}
                onClick={() => onSelect(m.key)}
                onKeyDown={(e) => onKeyDown(e, index)}
                disabled={m.disabled}
                className={`${styles.row} ${isActive ? styles.active : ""}`}
              >
                {row(m)}
              </button>
            </li>
          );
        })}
      </ul>
      {actions.length > 0 && (
        <ul className="m-0 list-none p-0">
          {actions.map((m) => (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => onSelect(m.key)}
                disabled={m.disabled}
                className={styles.row}
              >
                {row(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

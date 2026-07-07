"use client";

import type { ReactNode } from "react";
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

export function ModuleSwitcher({
  modules,
  activeKey,
  onSelect,
  header,
}: ModuleSwitcherProps) {
  return (
    <nav aria-label={header ?? "Modules"}>
      {header && <div className={styles.header}>{header}</div>}
      <ul className="m-0 list-none p-0">
        {modules.map((m) => {
          const isActive = !m.isAction && m.key === activeKey;
          return (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => onSelect(m.key)}
                disabled={m.disabled}
                aria-current={isActive ? "page" : undefined}
                className={`${styles.row} ${isActive ? styles.active : ""}`}
              >
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
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

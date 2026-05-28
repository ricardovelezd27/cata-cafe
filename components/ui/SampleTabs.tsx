"use client";

import styles from "./SampleTabs.module.css";

export type SampleTabItem = {
  id: string;
  label: string;
  filled?: boolean;
};

interface SampleTabsProps {
  samples: SampleTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  header?: string;
}

export function SampleTabs({
  samples,
  activeIndex,
  onSelect,
  header,
}: SampleTabsProps) {
  return (
    <nav aria-label={header ?? "Samples"}>
      {header && <div className={styles.header}>{header}</div>}
      <ul className="m-0 list-none p-0">
        {samples.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "page" : undefined}
                className={`${styles.row} ${isActive ? styles.active : ""}`}
              >
                <span className={styles.position}>{i + 1}</span>
                <span className={styles.label}>{s.label}</span>
                {s.filled && !isActive && (
                  <span className={styles.check} aria-label="completed">
                    ✓
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

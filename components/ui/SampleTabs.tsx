"use client";

import { useEffect, useRef } from "react";
import styles from "./SampleTabs.module.css";

export type SampleTabItem = {
  id: string;
  label: string;
  filled?: boolean;
  /** The session's "Referencia" sample — renders a small pill after the label. */
  reference?: boolean;
  /** "R1"/"R2" — replaces `referenceLabel` when a session has several references. */
  referenceTag?: string;
};

interface SampleTabsProps {
  samples: SampleTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  header?: string;
  orientation?: "vertical" | "horizontal";
  /** Pill text for `reference` items, e.g. "Referencia". */
  referenceLabel?: string;
  /** Keep `header` as the nav's aria-label but don't render it (phone row). */
  hideHeader?: boolean;
}

export function SampleTabs({
  samples,
  activeIndex,
  onSelect,
  header,
  orientation = "vertical",
  referenceLabel = "Ref",
  hideHeader = false,
}: SampleTabsProps) {
  const horizontal = orientation === "horizontal";
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!horizontal || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector<HTMLElement>(
      '[aria-current="page"]'
    );
    activeEl?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex, horizontal]);

  const list = (
    <ul className={horizontal ? styles.listH : "m-0 list-none p-0"}>
      {samples.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive ? "page" : undefined}
              className={
                horizontal
                  ? `${styles.rowH} ${isActive ? styles.activeH : ""}`
                  : `${styles.row} ${isActive ? styles.active : ""}`
              }
            >
              <span className={styles.position}>{i + 1}</span>
              <span className={styles.label}>{s.label}</span>
              {s.reference && (
                <span className={styles.reference}>{s.referenceTag ?? referenceLabel}</span>
              )}
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
  );

  return (
    <nav
      aria-label={header ?? "Samples"}
      className={horizontal ? styles.horizontal : undefined}
    >
      {header && !hideHeader && (
        <div className={`${styles.header} ${horizontal ? styles.headerH : ""}`}>
          {header}
        </div>
      )}
      {horizontal ? (
        <div ref={scrollRef} className={styles.scrollerH}>
          {list}
        </div>
      ) : (
        list
      )}
    </nav>
  );
}

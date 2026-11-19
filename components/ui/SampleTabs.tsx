"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { scrollBehavior } from "@/lib/motion";
import { nextRovingIndex, tabStopIndex } from "@/lib/rovingFocus";
import { EdgeFades, useEdgeHint } from "./EdgeHint";
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
  /** Keep `header` as the tablist's name but don't render it (phone row). */
  hideHeader?: boolean;
  /** "muestra {n} de {total}": read after each tab's label (P5b, D-04). */
  positionTemplate?: string;
}

/**
 * The cupping screen's samples (P5b, audit D-02 / D-04 / H-08): TABS, one Tab stop (the
 * current sample), the arrow keys, Home and End move the focus (`lib/rovingFocus.ts`, the
 * keyboard of P5a's tabs). Activation is MANUAL: Enter or Space (the button's own click)
 * selects, because a move awaits the page's flush of pending saves and swaps the form, so
 * scanning with the arrows must not move the cupper. A sideways row says when it has more
 * (P5a's fade with a chevron).
 */
export function SampleTabs({
  samples,
  activeIndex,
  onSelect,
  header,
  orientation = "vertical",
  referenceLabel = "Ref",
  hideHeader = false,
  positionTemplate,
}: SampleTabsProps) {
  const horizontal = orientation === "horizontal";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = samples.map(() => false);
  const stop = tabStopIndex(activeIndex, disabled);
  const hint = useEdgeHint(scrollRef, [samples.length, horizontal]);

  useEffect(() => {
    if (!horizontal || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
    activeEl?.scrollIntoView({
      behavior: scrollBehavior(),
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex, horizontal]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingIndex(e.key, index, disabled);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
  };

  const list = (
    <ul
      role="tablist"
      aria-label={header ?? "Samples"}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      className={horizontal ? styles.listH : "m-0 list-none p-0"}
    >
      {samples.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <li key={s.id} role="presentation">
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={i === stop ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={
                horizontal
                  ? `${styles.rowH} ${isActive ? styles.activeH : ""}`
                  : `${styles.row} ${isActive ? styles.active : ""}`
              }
            >
              <span className={styles.position} aria-hidden>{i + 1}</span>
              <span className={styles.label}>{s.label}</span>
              {s.reference && (
                <span className={styles.reference}>{s.referenceTag ?? referenceLabel}</span>
              )}
              {s.filled && !isActive && (
                <span className={styles.check} aria-label="completed">
                  ✓
                </span>
              )}
              {positionTemplate && (
                <span className="sr-only">
                  {`, ${positionTemplate.replace("{n}", String(i + 1)).replace("{total}", String(samples.length))}`}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={horizontal ? styles.horizontal : undefined}>
      {header && !hideHeader && (
        <div className={`${styles.header} ${horizontal ? styles.headerH : ""}`} aria-hidden>
          {header}
        </div>
      )}
      {horizontal ? (
        <div className="relative min-w-0 flex-1">
          <div ref={scrollRef} className={styles.scrollerH}>
            {list}
          </div>
          <EdgeFades hint={hint} />
        </div>
      ) : (
        list
      )}
    </div>
  );
}

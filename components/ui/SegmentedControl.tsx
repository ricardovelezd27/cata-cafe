"use client";

import { useRef, type KeyboardEvent } from "react";
import { HIT_Y44 } from "./hitArea";
import { nextRovingIndex, tabStopIndex } from "@/lib/rovingFocus";

/**
 * A small, fixed set of ways to draw the same data (DESIGN.md "Interactive
 * control vocabulary"). It chooses, it does not show another panel, so it is
 * a RADIO GROUP (audit H-08, P5a): one Tab stop (the checked segment), the
 * arrow keys, Home and End move and check. The checked segment is raised on
 * its track (`surface-container-lowest`), never the action fill.
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = items.map(() => false);
  const selected = items.findIndex((i) => i.id === value);
  const stop = tabStopIndex(selected, disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingIndex(e.key, index, disabled);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    if (next !== selected) onChange(items[next].id);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex min-h-[44px] rounded-pill bg-surface-container-high p-1 ${className}`}
    >
      {items.map((item, index) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === stop ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            // The segment keeps its size inside the 44 px track; its hit area is the
            // track's full 44 px height (HIT_Y44), never wider than the segment.
            className={`${HIT_Y44} flex-1 rounded-pill px-3 py-1.5 text-caption font-medium transition-colors ${
              active
                ? "bg-surface-container-lowest text-on-surface shadow-card"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

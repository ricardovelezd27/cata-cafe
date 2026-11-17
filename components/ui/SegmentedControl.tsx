"use client";

import { HIT_Y44 } from "./hitArea";

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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex min-h-[44px] rounded-pill bg-surface-container-high p-1 ${className}`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            // The segment keeps its size inside the 44 px track; its hit area is the
            // track's full 44 px height (HIT_Y44), never wider than the segment.
            className={`${HIT_Y44} flex-1 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
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

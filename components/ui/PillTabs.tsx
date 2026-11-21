"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { nextRovingIndex, tabIds, tabStopIndex } from "@/lib/rovingFocus";

export type PillTabItem = {
  id: string;
  label: string;
  badge?: string;
  /** What the badge's number counts, read out in place of the bare number. */
  badgeLabel?: string;
  disabled?: boolean;
};

type PillTabsSize = "md" | "sm";

const SIZE_CLASSES: Record<PillTabsSize, string> = {
  md: "px-4 text-caption",
  sm: "px-3.5 text-caption",
};

/**
 * Tabs inside a page (audit D-02 / H-08, P5a): ONE Tab stop (the selected
 * tab), the arrow keys, Home and End move AND select (automatic activation).
 * The selected tab is marked with a tone (`primary-fixed`) and a weight, never
 * the action fill ("A selection never looks like an action", DESIGN.md).
 *
 * With `idBase`, each tab gets an id and `aria-controls`; the caller renders
 * the shown content inside `<TabPanel idBase value>` so the panel names its
 * tab back. Without it the row is still a tablist (a filter that re-draws the
 * same block below names no panel).
 */
export function PillTabs({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
  idBase,
}: {
  items: PillTabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  size?: PillTabsSize;
  className?: string;
  idBase?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = items.map((i) => !!i.disabled);
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
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={`flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 ${className}`}
    >
      {items.map((item, index) => {
        const active = item.id === value;
        const ids = idBase ? tabIds(idBase, item.id) : null;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={ids?.tab}
            aria-controls={ids && active ? ids.panel : undefined}
            aria-selected={active}
            tabIndex={index === stop ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border py-1.5 transition-colors min-h-[44px] ${SIZE_CLASSES[size]} ${
              active
                ? "border-primary-fixed bg-primary-fixed font-semibold text-on-primary-fixed"
                : "border-outline font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:bg-surface-container active:text-on-surface"
            } ${item.disabled ? "opacity-60 cursor-default" : ""}`}
          >
            {item.label}
            {item.badge != null && (
              <span
                className={`inline-flex items-center rounded-pill px-1.5 py-0.5 text-caption font-semibold tabular-nums ${
                  active ? "bg-surface-container-lowest text-on-surface" : "bg-secondary text-on-secondary"
                }`}
              >
                {/* the number alone says nothing to a screen reader: read what it counts */}
                <span aria-hidden={item.badgeLabel ? true : undefined}>{item.badge}</span>
                {item.badgeLabel ? <span className="sr-only">, {item.badgeLabel}</span> : null}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The content a `PillTabs` with the same `idBase` shows: names its tab back. */
export function TabPanel({
  idBase,
  value,
  className,
  children,
}: {
  idBase: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ids = tabIds(idBase, value);
  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} className={className}>
      {children}
    </div>
  );
}

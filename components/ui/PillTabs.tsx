"use client";

export type PillTabItem = { id: string; label: string; badge?: string; disabled?: boolean };

type PillTabsSize = "md" | "sm";

const SIZE_CLASSES: Record<PillTabsSize, string> = {
  md: "px-4 text-sm",
  sm: "px-3.5 text-[12px]",
};

export function PillTabs({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: {
  items: PillTabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  size?: PillTabsSize;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 ${className}`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill py-1.5 font-medium transition-colors min-h-[44px] ${SIZE_CLASSES[size]} ${
              active
                ? "bg-primary-container text-on-primary"
                : "border border-outline-variant text-on-surface-variant hover:text-on-surface"
            } ${item.disabled ? "opacity-45 cursor-not-allowed" : ""}`}
          >
            {item.label}
            {item.badge != null && (
              <span
                className={`inline-flex items-center rounded-pill px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? "bg-on-primary/20" : "bg-secondary text-on-secondary"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

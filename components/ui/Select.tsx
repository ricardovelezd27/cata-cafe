"use client";

import { ChevronDown } from "lucide-react";

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  ariaLabel: string;
  className?: string;
  /** Lets a visible <label htmlFor> point at the control. */
  id?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full appearance-none rounded-input border border-outline-variant bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface transition-colors focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/25"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
      />
    </div>
  );
}

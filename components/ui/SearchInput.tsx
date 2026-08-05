"use client";

import { Search } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full">
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-input border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant transition-colors focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/25"
      />
    </div>
  );
}

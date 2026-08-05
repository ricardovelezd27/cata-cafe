"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  showingText,
  translations,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  showingText: string;
  translations: { prev: string; next: string };
}) {
  const showControls = totalPages > 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-on-surface-variant">
      <span>{showingText}</span>
      {showControls && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex items-center gap-1 rounded-pill border border-outline-variant px-3 py-1 text-sm text-on-surface-variant transition-colors hover:border-outline disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} aria-hidden />
            {translations.prev}
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex items-center gap-1 rounded-pill border border-outline-variant px-3 py-1 text-sm text-on-surface-variant transition-colors hover:border-outline disabled:cursor-not-allowed disabled:opacity-40"
          >
            {translations.next}
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

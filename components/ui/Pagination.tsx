"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

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
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-caption text-on-surface-variant">
      <span>{showingText}</span>
      {showControls && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            icon={<ChevronLeft size={14} aria-hidden />}
          >
            {translations.prev}
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            {translations.next}
            <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

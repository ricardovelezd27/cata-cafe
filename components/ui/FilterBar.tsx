"use client";

import { X } from "lucide-react";
import { Select } from "./Select";
import { TextAction } from "./TextAction";

export type FacetOption = { value: string; label: string };

export function FilterBar({
  facets,
  values,
  onChange,
  onClear,
  translations,
}: {
  facets: { key: string; label: string; options: FacetOption[] }[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  translations: { clearFilters: string; all: string };
}) {
  const hasActive = facets.some((facet) => (values[facet.key] ?? "") !== "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {facets.map((facet) => (
        <Select
          key={facet.key}
          value={values[facet.key] ?? ""}
          onChange={(v) => onChange(facet.key, v)}
          ariaLabel={facet.label}
          className="min-w-[9rem]"
          options={[
            { value: "", label: `${facet.label}: ${translations.all}` },
            ...facet.options,
          ]}
        />
      ))}
      {hasActive && (
        <TextAction tone="quiet" onClick={onClear}>
          <X size={14} aria-hidden />
          {translations.clearFilters}
        </TextAction>
      )}
    </div>
  );
}

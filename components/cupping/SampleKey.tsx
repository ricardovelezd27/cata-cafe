"use client";

import { ChevronDown } from "lucide-react";

export type SampleKeyRow = {
  id: string;
  /** The label the cuppers see ("Muestra C"). */
  label: string;
  /** Coffee name; null/"" = a coffee-less sample. */
  coffee: string | null;
};

export type SampleKeyTranslations = {
  title: string;
  hint: string;
  noCoffee: string;
};

/**
 * Owner-only "Clave de muestras" (S10 WP2 / A4): which letter got which coffee.
 * The letters are assigned at random when the session is created, so the owner
 * needs a place to look the mapping up. Collapsed by default so a projected
 * screen never shows it by accident. Callers render it for the owner only and
 * must never pass coffee names to a participant.
 */
export function SampleKey({
  rows,
  translations: t,
  className = "",
}: {
  rows: SampleKeyRow[];
  translations: SampleKeyTranslations;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <details
      className={
        "group rounded-input border border-outline-variant bg-surface-container-low/50 " + className
      }
    >
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-widest text-on-surface-variant [&::-webkit-details-marker]:hidden">
        {t.title}
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-3.5 pb-3">
        <p className="mb-2 text-xs text-on-surface-variant">{t.hint}</p>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 text-sm text-on-surface">
              <span className="w-28 shrink-0 font-semibold">{r.label}</span>
              <span className={r.coffee ? "" : "text-on-surface-variant"}>
                {r.coffee || t.noCoffee}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

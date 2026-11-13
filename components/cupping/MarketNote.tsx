"use client";

import { useState } from "react";
import { MARKET_KEY, MARKET_NOTE_KEY, MARKET_NOTE_MAX, type MarketPov } from "@/lib/marketNote";

// The optional "market" line at the end of the affective part (S10 WP3a, Kim
// A10, TODO(kim-validar:A10)). Collapsed by default; two choices and, for "a
// market I know", a short free text. It edits the two keys of the module blob
// through the same onChange as every other field, so it autosaves with the
// module (no extra call). Never read by scoring or completeness.

export type MarketCopy = {
  title: string;
  optional: string;
  own: string;
  known: string;
  noteLabel: string;
  notePlaceholder: string;
};

/** Used only when the cup error boundary rehydrates an older cached prop blob
 *  without `market` (same idea as CUP_COPY_FALLBACK). tests/marketCopy.test.ts
 *  keeps it equal to the message files. */
export const MARKET_COPY_FALLBACK: Record<"es" | "en", MarketCopy> = {
  es: {
    title: "¿Desde qué punto de vista calificaste?",
    optional: "Opcional",
    own: "Mi preferencia",
    known: "Un mercado que conozco",
    noteLabel: "¿Qué mercado?",
    notePlaceholder: "Ej. cafeterías de especialidad en Madrid",
  },
  en: {
    title: "Which point of view did you rate from?",
    optional: "Optional",
    own: "My preference",
    known: "A market I know",
    noteLabel: "Which market?",
    notePlaceholder: "E.g. specialty cafés in Madrid",
  },
};

export function MarketNote({
  data,
  onChange,
  copy,
  disabled = false,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  copy: MarketCopy;
  disabled?: boolean;
}) {
  const pov: MarketPov = data[MARKET_KEY] === "conocido" ? "conocido" : "propio";
  const note = typeof data[MARKET_NOTE_KEY] === "string" ? (data[MARKET_NOTE_KEY] as string) : "";

  // Open at mount only when a choice is already stored; afterwards the browser owns the toggle.
  const [initiallyOpen] = useState(pov === "conocido");

  const choose = (next: MarketPov) => {
    if (next === pov) return;
    const out: Record<string, unknown> = { ...data, [MARKET_KEY]: next };
    // The note is only kept with "a market I know".
    if (next === "propio") delete out[MARKET_NOTE_KEY];
    onChange(out);
  };

  const optionClass = (active: boolean) =>
    `min-h-[44px] flex-1 rounded-input border px-3 py-2 text-left font-sans text-sm transition-colors ${
      active
        ? "border-primary-container bg-primary-container text-on-primary"
        : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
    } disabled:opacity-60`;

  return (
    <details
      className="mt-4 rounded-card border border-outline-variant bg-surface-container-lowest"
      open={initiallyOpen}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-sans text-sm text-on-surface">
        <span>{copy.title}</span>
        <span className="text-xs text-on-surface-variant">{copy.optional}</span>
      </summary>
      <div className="space-y-3 border-t border-outline-variant px-4 py-3">
        <div role="radiogroup" aria-label={copy.title} className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            role="radio"
            aria-checked={pov === "propio"}
            disabled={disabled}
            onClick={() => choose("propio")}
            className={optionClass(pov === "propio")}
          >
            {copy.own}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={pov === "conocido"}
            disabled={disabled}
            onClick={() => choose("conocido")}
            className={optionClass(pov === "conocido")}
          >
            {copy.known}
          </button>
        </div>
        {pov === "conocido" && (
          <label className="block">
            <span className="mb-1 block font-sans text-xs text-on-surface-variant">{copy.noteLabel}</span>
            <input
              type="text"
              value={note}
              maxLength={MARKET_NOTE_MAX}
              disabled={disabled}
              placeholder={copy.notePlaceholder}
              onChange={(e) => onChange({ ...data, [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: e.target.value })}
              className="min-h-[44px] w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 font-sans text-sm text-on-surface"
            />
          </label>
        )}
      </div>
    </details>
  );
}

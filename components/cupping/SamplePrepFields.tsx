"use client";

import { ChevronDown } from "lucide-react";
import { PREP_NOTE_MAX, type SamplePrepForm } from "@/lib/samplePrep";
import { localDateISO } from "@/lib/localDate";

export type SamplePrepTranslations = {
  /** Summary of the collapsed section: "Más datos de la muestra (opcional)". */
  summary: string;
  /** One line: these stay private until the sample is revealed. */
  hint: string;
  roastDate: string;
  preparation: string;
  preparationPh: string;
  offProtocol: string;
  offProtocolNote: string;
  offProtocolNotePh: string;
};

const fieldCls =
  "w-full min-h-[44px] border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";
const labelCls =
  "block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5";

/**
 * The owner's optional per-sample prep data (S10 WP2 / A9): roast date, a free
 * "preparación" note and a "cupped outside protocol" tick that reveals its
 * note. Collapsed by default. Controlled: the wizard keeps it per sample row,
 * the sample editor on the cup page keeps it in its form state. BLIND DATA:
 * owner-only until the sample is revealed (lib/samplePrep.ts).
 */
export function SamplePrepFields({
  value,
  onChange,
  translations: t,
  idPrefix,
  className = "",
}: {
  value: SamplePrepForm;
  onChange: (patch: Partial<SamplePrepForm>) => void;
  translations: SamplePrepTranslations;
  /** Unique per instance so labels bind to their own inputs. */
  idPrefix: string;
  className?: string;
}) {
  return (
    <details
      className={
        "group rounded-input border border-outline-variant bg-surface-container-low/50 " + className
      }
    >
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-widest text-on-surface-variant [&::-webkit-details-marker]:hidden">
        {t.summary}
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 px-3.5 pb-3.5">
        <p className="text-xs text-on-surface-variant">{t.hint}</p>
        <div>
          <label htmlFor={`${idPrefix}-roast`} className={labelCls}>
            {t.roastDate}
          </label>
          <input
            id={`${idPrefix}-roast`}
            type="date"
            suppressHydrationWarning
            max={localDateISO()}
            className={fieldCls}
            value={value.roastDate}
            onChange={(e) => onChange({ roastDate: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-prep`} className={labelCls}>
            {t.preparation}
          </label>
          <textarea
            id={`${idPrefix}-prep`}
            maxLength={PREP_NOTE_MAX}
            className={fieldCls + " min-h-[64px]"}
            value={value.preparationNote}
            placeholder={t.preparationPh}
            onChange={(e) => onChange({ preparationNote: e.target.value })}
          />
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={value.offProtocol}
            onChange={(e) => onChange({ offProtocol: e.target.checked })}
            className="h-4 w-4 rounded accent-primary-container cursor-pointer"
          />
          {t.offProtocol}
        </label>
        {value.offProtocol && (
          <div>
            <label htmlFor={`${idPrefix}-off`} className={labelCls}>
              {t.offProtocolNote}
            </label>
            <textarea
              id={`${idPrefix}-off`}
              maxLength={PREP_NOTE_MAX}
              className={fieldCls + " min-h-[64px]"}
              value={value.offProtocolNote}
              placeholder={t.offProtocolNotePh}
              onChange={(e) => onChange({ offProtocolNote: e.target.value })}
            />
          </div>
        )}
      </div>
    </details>
  );
}

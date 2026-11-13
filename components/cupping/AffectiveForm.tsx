"use client";

import {
  STEP_ATTRIBUTES,
  STEP_DESC_LABELS,
  type CuppingStep,
} from "@/lib/constants";
import {
  AffectiveBubbles,
  FormSection,
  Notes,
  CupToggleGrid,
} from "@/components/ui";

import { CUP_COPY_FALLBACK, cupSummary, type CupCopy } from "@/lib/cupCopy";
import { applyDefectChoice, applyNonUniformToggle, formCupState } from "@/lib/cupDefects";

type Data = Record<string, unknown>;

export function AffectiveForm({
  sampleData,
  onChange,
  cupsPerSample,
  currentStep,
  missingIds,
  lockedAffective = false,
  lockedNote,
  lockedCupsNote,
  isGroup = false,
  locale = "es",
  cupCopy,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
  currentStep: CuppingStep;
  /** affectiveIds (from lib/completeness) still missing on this step; drives the * / red flag. */
  missingIds?: string[];
  /** Reference (control) sample: every quality bubble is pinned at 5 and the
   *  cup checks are cleared (lib/referenceRules.ts). Only notes stay editable. */
  lockedAffective?: boolean;
  /** Banner explaining the lock; shown once at the top of the form. */
  lockedNote?: string;
  /** Replaces the cup grid on the overall step while locked. */
  lockedCupsNote?: string;
  /** Group sessions only: adds "Tus tazas se suman a las del grupo." to the cup hint. */
  isGroup?: boolean;
  locale?: "es" | "en";
  /** Cup grid + "score after submitting" copy (messages `cupping.cups`). */
  cupCopy?: CupCopy;
}) {
  const copy = cupCopy ?? CUP_COPY_FALLBACK[locale];
  const isFlagged = (id: string) => missingIds?.includes(id) ?? false;
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const getNum = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const getStr = (k: string): string => (d[k] as string | undefined) ?? "";

  // ONE cup shows the grid too (only the defective row, S10 WP1b).
  const showCups = cupsPerSample >= 1;

  const stepAttrs = STEP_ATTRIBUTES[currentStep];

  const lockedBanner =
    lockedAffective && lockedNote ? (
      <div
        role="note"
        className="mb-4 rounded-card border border-secondary/30 bg-secondary-fixed px-4 py-3 font-sans text-sm text-on-secondary-fixed-variant"
      >
        {lockedNote}
      </div>
    ) : null;

  // Cup state (only used in overall step)
  const cupState = formCupState(d, cupsPerSample);
  const nonUniformBools = cupState.nonUniform;
  const defectiveBools = cupState.defective;
  const nonUniformCount = nonUniformBools.filter(Boolean).length;
  const defectiveCount = defectiveBools.filter(Boolean).length;

  // Non-overall steps
  if (currentStep !== "overall") {
    return (
      <div>
        {lockedBanner}
        {stepAttrs.map((attr) => {
          const title = attr.descriptiveId
            ? STEP_DESC_LABELS[attr.descriptiveId] ?? attr.affectiveId
            : attr.affectiveId;

          return (
            <FormSection
              key={attr.affectiveId}
              title={title}
              accent
              flagged={isFlagged(attr.affectiveId)}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-6">
                {/* Left: quality (liking) */}
                <div className="min-w-0">
                  <AffectiveBubbles
                    value={getNum(`${attr.affectiveId}_final`)}
                    onChange={(v) => set(`${attr.affectiveId}_final`, v)}
                    disabled={lockedAffective}
                  />
                </div>

                {/* Right: notes */}
                <div className="min-w-0 mt-5 pt-5 border-t border-brown-light lg:mt-0 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-6">
                  <Notes
                    value={getStr(`${attr.affectiveId}_notas`)}
                    onChange={(v) => set(`${attr.affectiveId}_notas`, v)}
                    placeholder="Notas afectivas..."
                  />
                </div>
              </div>
            </FormSection>
          );
        })}
      </div>
    );
  }

  // Overall step: impresión global + cups + score
  return (
    <div>
      {lockedBanner}
      <FormSection title="Impresión Global" accent flagged={isFlagged("impresion_global")}>
        <AffectiveBubbles
          value={getNum("impresion_global_final")}
          onChange={(v) => set("impresion_global_final", v)}
          disabled={lockedAffective}
        />
        <div className="mt-3">
          <Notes
            value={getStr("impresion_global_notas")}
            onChange={(v) => set("impresion_global_notas", v)}
            placeholder="Notas finales..."
          />
        </div>
      </FormSection>

      {showCups && lockedAffective && lockedCupsNote && (
        <FormSection title={copy.title}>
          <p className="font-sans text-sm text-brown-mid">{lockedCupsNote}</p>
        </FormSection>
      )}
      {showCups && !lockedAffective && (
        <FormSection title={copy.title}>
          <CupToggleGrid
            cupsPerSample={cupsPerSample}
            nonUniformBools={nonUniformBools}
            defectiveBools={defectiveBools}
            cupTypes={cupState.types}
            copy={copy}
            isGroup={isGroup}
            onToggleNonUniform={(i) => onChange(applyNonUniformToggle(d, cupsPerSample, i))}
            onSetDefect={(i, type) => onChange(applyDefectChoice(d, cupsPerSample, i, type))}
          />
          {(nonUniformCount > 0 || defectiveCount > 0) && (
            <div className="mt-2 text-[11px] text-brown-mid">
              {cupSummary(copy, nonUniformCount, defectiveCount)}
            </div>
          )}
        </FormSection>
      )}

      <p className="mt-4 font-sans text-sm text-on-surface-variant">{copy.scoreLater}</p>
    </div>
  );
}

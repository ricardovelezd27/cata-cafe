"use client";

import {
  STEP_ATTRIBUTES,
  STEP_DESC_LABELS,
  STEP_CATA_MAX,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
  type CuppingStep,
} from "@/lib/constants";
import {
  IntensitySlider,
  AffectiveBubbles,
  CATAPills,
  FormSection,
  Notes,
  CupToggleGrid,
} from "@/components/ui";
import { FlavorPicker } from "@/components/cupping/FlavorPicker";
import type { CATAOption, CATASubItem } from "@/components/ui/CATAPills";

type Data = Record<string, unknown>;

const acidityCATAOptions: CATAOption[] = ACIDITY_CATA.map((o) => ({
  id: o.id,
  label: o.label,
  color: o.color,
  subItems: o.subItems as unknown as CATASubItem[],
}));

const sweetnessCATAOptions: CATAOption[] = SWEETNESS_CATA.map((o) => ({
  id: o.id,
  label: o.label,
  color: o.color,
  subItems: o.subItems as unknown as CATASubItem[],
}));

const mouthfeelCATAOptions: CATAOption[] = MOUTHFEEL_CATA.map((o) => ({
  id: o.id,
  label: o.label,
  color: o.color,
  subItems: o.subItems as unknown as CATASubItem[],
}));

const mainTasteOptions: CATAOption[] = MAIN_TASTES.map((t) => ({
  id: t.id,
  label: t.label,
  color: "var(--color-amber)",
}));

// Flavor-wheel stages use the 3-level modal picker; the rest use flat/2-level CATA.
function isFlavorDesc(descId: string): boolean {
  return (
    descId === "fragancia" ||
    descId === "aroma" ||
    descId === "sabor" ||
    descId === "sabor_residual"
  );
}

function pillsForDescId(descId: string): CATAOption[] | null {
  if (descId === "acidez") return acidityCATAOptions;
  if (descId === "dulzor") return sweetnessCATAOptions;
  if (descId === "sensacion") return mouthfeelCATAOptions;
  return null;
}

import { CUP_COPY_FALLBACK, cupSummary, type CupCopy } from "@/lib/cupCopy";
import { applyDefectChoice, applyNonUniformToggle, formCupState } from "@/lib/cupDefects";

export function CombinedForm({
  sampleData,
  onChange,
  cupsPerSample,
  currentStep,
  locale = "es",
  missingIds,
  lockedAffective = false,
  lockedNote,
  lockedCupsNote,
  isGroup = false,
  cupCopy,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
  currentStep: CuppingStep;
  locale?: "es" | "en";
  /** affectiveIds (from lib/completeness) still missing on this step; drives the * / red flag. */
  missingIds?: string[];
  /** Reference (control) sample: quality bubbles pinned at 5, cups cleared
   *  (lib/referenceRules.ts). Descriptive side and notes stay editable. */
  lockedAffective?: boolean;
  lockedNote?: string;
  lockedCupsNote?: string;
  /** Group sessions only: adds "Tus tazas se suman a las del grupo." to the cup hint. */
  isGroup?: boolean;
  /** Cup grid + "score after submitting" copy (messages `cupping.cups`). */
  cupCopy?: CupCopy;
}) {
  const copy = cupCopy ?? CUP_COPY_FALLBACK[locale];
  const isFlagged = (id: string) => missingIds?.includes(id) ?? false;
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const num = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";
  // Qualifying notes live in a parallel `<descKey>_notes` map (node id → terms).
  const notesOf = (descKey: string): Record<string, string[]> =>
    (d[`${descKey}_notes`] as Record<string, string[]> | undefined) ?? {};
  // Value + notes must land in ONE blob update — the blob is replaced wholesale
  // per onChange, so two same-tick set() calls would clobber each other.
  const setDescAndNotes =
    (descKey: string) => (v: string[], n?: Record<string, string[]>) =>
      onChange(
        n === undefined
          ? { ...d, [descKey]: v }
          : { ...d, [descKey]: v, [`${descKey}_notes`]: n }
      );

  // ONE cup shows the grid too (only the defective row, S10 WP1b).
  const showCups = cupsPerSample >= 1;

  const lockedBanner =
    lockedAffective && lockedNote ? (
      <div
        role="note"
        className="mb-4 rounded-card border border-secondary/30 bg-secondary-fixed px-4 py-3 font-sans text-sm text-on-secondary-fixed-variant"
      >
        {lockedNote}
      </div>
    ) : null;

  const cupState = formCupState(d, cupsPerSample);
  const nonUniformBools = cupState.nonUniform;
  const defectiveBools = cupState.defective;

  const nonUniformCount = nonUniformBools.filter(Boolean).length;
  const defectiveCount = defectiveBools.filter(Boolean).length;

  // Overall step
  if (currentStep === "overall") {
    return (
      <div>
        {lockedBanner}
        <FormSection title="Impresión Global" accent flagged={isFlagged("impresion_global")}>
          <AffectiveBubbles
            value={num("impresion_global_final")}
            onChange={(v) => set("impresion_global_final", v)}
            disabled={lockedAffective}
          />
          <div className="mt-3">
            <Notes
              value={str("impresion_global_notas")}
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

  // Non-overall: descriptive (intensity + CATA) + affective (bubbles) per attribute
  const stepAttrs = STEP_ATTRIBUTES[currentStep];

  return (
    <div>
      {lockedBanner}
      {stepAttrs.map((attr) => {
        const descId = attr.descriptiveId;
        if (!descId) return null;
        const affId = attr.affectiveId;
        const title = STEP_DESC_LABELS[descId] ?? descId;
        const flavor = isFlavorDesc(descId);
        const pills = pillsForDescId(descId);
        const max = STEP_CATA_MAX[descId];

        return (
          <FormSection key={affId} title={title} accent flagged={isFlagged(affId)}>
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-6">
              {/* Left: descriptive */}
              <div className="min-w-0">
                <div className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-green-mid mb-2">
                  Descriptivo
                </div>
                <IntensitySlider
                  label="Intensidad"
                  value={num(`${descId}_int`)}
                  onChange={(v) => set(`${descId}_int`, v)}
                />
                {flavor ? (
                  <div className="mt-4">
                    <FlavorPicker
                      value={arr(`${descId}_desc`)}
                      notes={notesOf(`${descId}_desc`)}
                      onChange={setDescAndNotes(`${descId}_desc`)}
                      maxSelect={max}
                      locale={locale}
                    />
                  </div>
                ) : (
                  pills && (
                    <div className="mt-4">
                      <CATAPills
                        options={pills}
                        selected={arr(`${descId}_desc`)}
                        onChange={(v) => set(`${descId}_desc`, v)}
                        maxSelect={max}
                        showSubItems
                      />
                    </div>
                  )
                )}
              </div>

              {/* Right: affective + notes */}
              <div className="min-w-0 mt-5 pt-5 border-t border-brown-light lg:mt-0 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-6">
                <div className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-amber mb-2">
                  Calidad 1–9
                </div>
                <AffectiveBubbles
                  value={num(`${affId}_final`)}
                  onChange={(v) => set(`${affId}_final`, v)}
                  disabled={lockedAffective}
                />

                <div className="mt-4">
                  <Notes
                    value={str(`${descId}_notas`)}
                    onChange={(v) => set(`${descId}_notas`, v)}
                    placeholder="Notas..."
                  />
                </div>
              </div>
            </div>
          </FormSection>
        );
      })}

      {currentStep === "taste_aftertaste" && (
        <FormSection title="Gustos Predominantes" accent flagged={isFlagged("gustos")}>
          <div className="text-[11px] text-brown-mid mb-2">
            Selecciona hasta 2 sabores principales
          </div>
          <CATAPills
            options={mainTasteOptions}
            selected={arr("gustos")}
            onChange={(v) => set("gustos", v)}
            maxSelect={2}
          />
        </FormSection>
      )}
    </div>
  );
}

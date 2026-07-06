"use client";

import {
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
  STEP_CATA_MAX,
  type CuppingStep,
} from "@/lib/constants";
import {
  IntensitySlider,
  CATAPills,
  FormSection,
  Notes,
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

export function DescriptiveForm({
  sampleData,
  onChange,
  currentStep,
  locale = "es",
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  currentStep: CuppingStep;
  locale?: "es" | "en";
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const num = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";
  // Qualifying notes live in a parallel `<descKey>_notes` map (node id → terms).
  const notesOf = (descKey: string): Record<string, string[]> =>
    (d[`${descKey}_notes`] as Record<string, string[]> | undefined) ?? {};

  // `options === null` → flavor-wheel block (3-level modal picker);
  // otherwise a flat/2-level CATA block (acidity/dulzor/sensación).
  const renderBlock = (
    id: string,
    title: string,
    options: CATAOption[] | null,
  ) => (
    <FormSection key={id} title={title} accent>
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-6">
        {/* Left: intensity + descriptors */}
        <div className="min-w-0">
          <IntensitySlider
            label="Intensidad"
            value={num(`${id}_int`)}
            onChange={(v) => set(`${id}_int`, v)}
          />
          <div className="mt-4">
            {options === null ? (
              <FlavorPicker
                value={arr(`${id}_desc`)}
                onChange={(v) => set(`${id}_desc`, v)}
                notes={notesOf(`${id}_desc`)}
                onNotesChange={(n) => set(`${id}_desc_notes`, n)}
                maxSelect={STEP_CATA_MAX[id]}
                locale={locale}
              />
            ) : (
              <CATAPills
                options={options}
                selected={arr(`${id}_desc`)}
                onChange={(v) => set(`${id}_desc`, v)}
                maxSelect={STEP_CATA_MAX[id]}
                showSubItems
              />
            )}
          </div>
        </div>

        {/* Right: notes */}
        <div className="min-w-0 mt-5 pt-5 border-t border-brown-light lg:mt-0 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-6">
          <Notes
            value={str(`${id}_notas`)}
            onChange={(v) => set(`${id}_notas`, v)}
            placeholder="Notas descriptivas..."
          />
        </div>
      </div>
    </FormSection>
  );

  if (currentStep === "fragrance") {
    return <div>{renderBlock("fragancia", "Fragancia", null)}</div>;
  }

  if (currentStep === "aroma") {
    return <div>{renderBlock("aroma", "Aroma", null)}</div>;
  }

  if (currentStep === "taste_aftertaste") {
    return (
      <div>
        {renderBlock("sabor", "Sabor", null)}
        {renderBlock("sabor_residual", "Sabor Residual (Regusto)", null)}
        <FormSection title="Gustos Predominantes" accent>
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
      </div>
    );
  }

  if (currentStep === "acidity_sweetness_mouthfeel") {
    return (
      <div>
        {renderBlock("acidez", "Acidez", acidityCATAOptions)}
        {renderBlock("dulzor", "Dulzor", sweetnessCATAOptions)}
        {renderBlock("sensacion", "Sensación en Boca", mouthfeelCATAOptions)}
      </div>
    );
  }

  return null;
}

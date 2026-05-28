"use client";

import {
  FLAVOR_FAMILIES,
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
import type { CATAOption, CATASubItem } from "@/components/ui/CATAPills";

type Data = Record<string, unknown>;

const flavorCATAOptions: CATAOption[] = FLAVOR_FAMILIES.map((f) => ({
  id: f.id,
  label: f.label,
  color: f.color,
  subItems: f.subItems as unknown as CATASubItem[],
}));

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
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  currentStep: CuppingStep;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const num = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";

  const renderBlock = (
    id: string,
    title: string,
    options: CATAOption[],
    showSubItems: boolean,
  ) => (
    <FormSection key={id} title={title} accent>
      <IntensitySlider
        label="Intensidad"
        value={num(`${id}_int`)}
        onChange={(v) => set(`${id}_int`, v)}
      />
      <div className="mt-4">
        <CATAPills
          options={options}
          selected={arr(`${id}_desc`)}
          onChange={(v) => set(`${id}_desc`, v)}
          maxSelect={STEP_CATA_MAX[id]}
          showSubItems={showSubItems}
        />
      </div>
      <div className="mt-3">
        <Notes
          value={str(`${id}_notas`)}
          onChange={(v) => set(`${id}_notas`, v)}
          placeholder="Notas descriptivas..."
        />
      </div>
    </FormSection>
  );

  if (currentStep === "fragrance_aroma") {
    return (
      <div>
        {renderBlock("fragancia", "Fragancia", flavorCATAOptions, true)}
        {renderBlock("aroma", "Aroma", flavorCATAOptions, true)}
      </div>
    );
  }

  if (currentStep === "taste_aftertaste") {
    return (
      <div>
        {renderBlock("sabor", "Sabor", flavorCATAOptions, true)}
        {renderBlock("sabor_residual", "Sabor Residual (Regusto)", flavorCATAOptions, true)}
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
        {renderBlock("acidez", "Acidez", acidityCATAOptions, true)}
        {renderBlock("dulzor", "Dulzor", sweetnessCATAOptions, true)}
        {renderBlock("sensacion", "Sensación en Boca", mouthfeelCATAOptions, true)}
      </div>
    );
  }

  return null;
}

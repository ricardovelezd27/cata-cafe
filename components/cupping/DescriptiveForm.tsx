"use client";

import {
  FLAVOR_FAMILIES,
  MOUTHFEEL_OPTIONS,
  MAIN_TASTES,
  CATA_MAX_SELECT,
  type CuppingPhase,
} from "@/lib/constants";
import { IntensitySlider } from "@/components/ui/IntensitySlider";
import { CATAPills, type CATAOption, type CATASubItem } from "@/components/ui/CATAPills";
import { Section } from "./Section";
import { NotesInput } from "./NotesInput";

type Data = Record<string, unknown>;

const flavorCATAOptions: CATAOption[] = FLAVOR_FAMILIES.map((f) => ({
  id: f.id,
  label: f.label,
  color: f.color,
  subItems: f.subItems as unknown as CATASubItem[],
}));

const mouthfeelCATAOptions: CATAOption[] = MOUTHFEEL_OPTIONS.map((o) => ({
  id: o.id,
  label: o.label,
  color: "#8B7355",
}));

const mainTasteOptions: CATAOption[] = MAIN_TASTES.map((t) => ({
  id: t.id,
  label: t.label,
  color: "#C17817",
}));

export function DescriptiveForm({
  sampleData,
  onChange,
  currentPhase,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  currentPhase: CuppingPhase;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const num = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";

  if (currentPhase === "fragrance") {
    return (
      <div>
        <Section title="Fragancia">
          <IntensitySlider
            label="Intensidad"
            value={num("fragancia_int")}
            onChange={(v) => set("fragancia_int", v)}
          />
          <div className="mt-3">
            <CATAPills
              options={flavorCATAOptions}
              selected={arr("fragancia_desc")}
              onChange={(v) => set("fragancia_desc", v)}
              maxSelect={CATA_MAX_SELECT.fragrance}
              showSubItems
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("fragancia_notas")}
              onChange={(v) => set("fragancia_notas", v)}
              placeholder="Notas descriptivas..."
            />
          </div>
        </Section>
      </div>
    );
  }

  if (currentPhase === "aroma") {
    return (
      <div>
        <Section title="Aroma">
          <IntensitySlider
            label="Intensidad"
            value={num("aroma_int")}
            onChange={(v) => set("aroma_int", v)}
          />
          <div className="mt-3">
            <CATAPills
              options={flavorCATAOptions}
              selected={arr("aroma_desc")}
              onChange={(v) => set("aroma_desc", v)}
              maxSelect={CATA_MAX_SELECT.aroma}
              showSubItems
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("aroma_notas")}
              onChange={(v) => set("aroma_notas", v)}
              placeholder="Notas descriptivas..."
            />
          </div>
        </Section>
      </div>
    );
  }

  if (currentPhase === "flavor") {
    return (
      <div>
        <Section title="Sabor">
          <IntensitySlider
            label="Intensidad"
            value={num("sabor_int")}
            onChange={(v) => set("sabor_int", v)}
          />
          <div className="mt-3">
            <CATAPills
              options={flavorCATAOptions}
              selected={arr("sabor_desc")}
              onChange={(v) => set("sabor_desc", v)}
              maxSelect={CATA_MAX_SELECT.flavor}
              showSubItems
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("sabor_notas")}
              onChange={(v) => set("sabor_notas", v)}
              placeholder="Notas descriptivas..."
            />
          </div>
        </Section>

        <Section title="Sabor Residual (Regusto)">
          <IntensitySlider
            label="Intensidad"
            value={num("sabor_residual_int")}
            onChange={(v) => set("sabor_residual_int", v)}
          />
          <div className="mt-3">
            <CATAPills
              options={flavorCATAOptions}
              selected={arr("sabor_residual_desc")}
              onChange={(v) => set("sabor_residual_desc", v)}
              maxSelect={CATA_MAX_SELECT.flavor}
              showSubItems
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("sabor_residual_notas")}
              onChange={(v) => set("sabor_residual_notas", v)}
              placeholder="Notas descriptivas..."
            />
          </div>
        </Section>

        <Section title="Gustos Predominantes">
          <div className="text-[11px] text-brown-mid mb-2">Selecciona hasta 2 sabores principales</div>
          <CATAPills
            options={mainTasteOptions}
            selected={arr("gustos")}
            onChange={(v) => set("gustos", v)}
            maxSelect={2}
          />
        </Section>
      </div>
    );
  }

  if (currentPhase === "acidity") {
    return (
      <div>
        <Section title="Acidez">
          <IntensitySlider
            label="Intensidad"
            value={num("acidez_int")}
            onChange={(v) => set("acidez_int", v)}
          />
          <div className="mt-3">
            <label className="text-[11px] font-semibold text-brown-mid block mb-1">
              Descriptores (libre)
            </label>
            <textarea
              value={str("acidez_desc_libre")}
              onChange={(e) => set("acidez_desc_libre", e.target.value)}
              placeholder="Ej: cítrica, málica, brillante..."
              rows={2}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #E8E0D0",
                background: "#FDFBF7",
                fontSize: 13,
                color: "#5C4A32",
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("acidez_notas")}
              onChange={(v) => set("acidez_notas", v)}
              placeholder="Notas adicionales..."
            />
          </div>
        </Section>
      </div>
    );
  }

  if (currentPhase === "sweetness") {
    return (
      <div>
        <Section title="Dulzor">
          <IntensitySlider
            label="Intensidad"
            value={num("dulzor_int")}
            onChange={(v) => set("dulzor_int", v)}
          />
          <div className="mt-3">
            <label className="text-[11px] font-semibold text-brown-mid block mb-1">
              Descriptores (libre)
            </label>
            <textarea
              value={str("dulzor_desc_libre")}
              onChange={(e) => set("dulzor_desc_libre", e.target.value)}
              placeholder="Ej: miel, panela, caramelo..."
              rows={2}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #E8E0D0",
                background: "#FDFBF7",
                fontSize: 13,
                color: "#5C4A32",
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("dulzor_notas")}
              onChange={(v) => set("dulzor_notas", v)}
              placeholder="Notas adicionales..."
            />
          </div>
        </Section>
      </div>
    );
  }

  if (currentPhase === "mouthfeel") {
    return (
      <div>
        <Section title="Sensación en Boca">
          <IntensitySlider
            label="Intensidad"
            value={num("sensacion_int")}
            onChange={(v) => set("sensacion_int", v)}
          />
          <div className="mt-3">
            <CATAPills
              options={mouthfeelCATAOptions}
              selected={arr("sensacion_desc")}
              onChange={(v) => set("sensacion_desc", v)}
              maxSelect={2}
            />
          </div>
          <div className="mt-2">
            <NotesInput
              value={str("sensacion_notas")}
              onChange={(v) => set("sensacion_notas", v)}
              placeholder="Notas descriptivas..."
            />
          </div>
        </Section>
      </div>
    );
  }

  // overall — affective only
  return (
    <div
      style={{
        textAlign: "center",
        padding: "24px 16px",
        color: "#8B7355",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      Esta sección es solo afectiva — registra tu impresión global con la escala 1–9.
    </div>
  );
}

"use client";

import { ACIDITY_DESCRIPTORS, MOUTHFEEL_DESCRIPTORS, SWEETNESS_DESCRIPTORS, type CuppingPhase } from "@/lib/constants";
import { Section } from "./Section";
import { IntensitySlider } from "./IntensitySlider";
import { FlavorTreeSelector } from "./FlavorTreeSelector";
import { DescriptorSelector } from "./DescriptorSelector";
import { GustosSelector } from "./GustosSelector";
import { NotesInput } from "./NotesInput";

type Data = Record<string, unknown>;

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
  const num = (k: string, def = 7.5) => (d[k] as number | undefined) ?? def;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";

  return (
    <div>
      {currentPhase === "fragrance" && (
        <Section title="Nivel de Tueste">
          <IntensitySlider value={num("tueste")} onChange={(v) => set("tueste", v)} />
        </Section>
      )}

      {currentPhase === "fragrance" && (
        <Section title="Fragancia">
          <IntensitySlider value={num("fragancia_int")} onChange={(v) => set("fragancia_int", v)} />
          <div className="mt-2">
            <FlavorTreeSelector
              selected={arr("fragancia_desc")}
              onChange={(v) => set("fragancia_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("fragancia_notas")} onChange={(v) => set("fragancia_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "aroma" && (
        <Section title="Aroma">
          <IntensitySlider value={num("aroma_int")} onChange={(v) => set("aroma_int", v)} />
          <div className="mt-2">
            <FlavorTreeSelector
              selected={arr("aroma_desc")}
              onChange={(v) => set("aroma_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("aroma_notas")} onChange={(v) => set("aroma_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Sabor">
          <IntensitySlider value={num("sabor_int")} onChange={(v) => set("sabor_int", v)} />
          <div className="mt-2">
            <FlavorTreeSelector
              selected={arr("sabor_desc")}
              onChange={(v) => set("sabor_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("sabor_notas")} onChange={(v) => set("sabor_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Sabor Residual">
          <IntensitySlider value={num("residual_int")} onChange={(v) => set("residual_int", v)} />
          <div className="mt-2">
            <FlavorTreeSelector
              selected={arr("residual_desc")}
              onChange={(v) => set("residual_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("residual_notas")} onChange={(v) => set("residual_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Gustos Predominantes">
          <GustosSelector selected={arr("gustos")} onChange={(v) => set("gustos", v)} />
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Acidez">
          <IntensitySlider value={num("acidez_int")} onChange={(v) => set("acidez_int", v)} />
          <div className="mt-2">
            <div className="text-[11px] font-semibold text-brown-mid mb-1">Tipo de acidez</div>
            <DescriptorSelector
              descriptors={ACIDITY_DESCRIPTORS}
              selected={arr("acidez_desc")}
              onChange={(v) => set("acidez_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("acidez_notas")} onChange={(v) => set("acidez_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Dulzor">
          <IntensitySlider value={num("dulzor_int")} onChange={(v) => set("dulzor_int", v)} />
          <div className="mt-2">
            <div className="text-[11px] font-semibold text-brown-mid mb-1">Tipo de dulzor</div>
            <DescriptorSelector
              descriptors={SWEETNESS_DESCRIPTORS}
              selected={arr("dulzor_desc")}
              onChange={(v) => set("dulzor_desc", v)}
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("dulzor_notas")} onChange={(v) => set("dulzor_notas", v)} />
          </div>
        </Section>
      )}

      {currentPhase === "liquoring" && (
        <Section title="Sensación en Boca">
          <IntensitySlider value={num("sensacion_int")} onChange={(v) => set("sensacion_int", v)} />
          <div className="mt-2">
            <DescriptorSelector
              descriptors={MOUTHFEEL_DESCRIPTORS}
              selected={arr("sensacion_desc")}
              onChange={(v) => set("sensacion_desc", v)}
              hasSubs
            />
          </div>
          <div className="mt-1.5">
            <NotesInput value={str("sensacion_notas")} onChange={(v) => set("sensacion_notas", v)} />
          </div>
        </Section>
      )}
    </div>
  );
}

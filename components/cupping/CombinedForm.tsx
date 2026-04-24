"use client";

import {
  ACIDITY_DESCRIPTORS,
  DEFECT_TYPES,
  MOUTHFEEL_DESCRIPTORS,
  SWEETNESS_DESCRIPTORS,
} from "@/lib/constants";
import { calcIndividualScore } from "@/lib/scoring";
import { Section } from "./Section";
import { IntensitySlider } from "./IntensitySlider";
import { AffectiveScale } from "./AffectiveScale";
import { FlavorTreeSelector } from "./FlavorTreeSelector";
import { DescriptorSelector } from "./DescriptorSelector";
import { GustosSelector } from "./GustosSelector";
import { NotesInput } from "./NotesInput";
import { CupCheckboxes } from "./CupCheckboxes";

type Data = Record<string, unknown>;

const COMBINED_ATTRS = [
  { id: "fragancia", affId: "fragancia_af", label: "Fragancia", kind: "flavor" },
  { id: "aroma", affId: "aroma_af", label: "Aroma", kind: "flavor" },
  { id: "sabor", affId: "sabor_af", label: "Sabor", kind: "flavor" },
  { id: "sabor_residual", affId: "sabor_residual_af", label: "Sabor Residual", kind: "flavor" },
  { id: "acidez", affId: "acidez_af", label: "Acidez", kind: "acidity" },
  { id: "dulzor", affId: "dulzor_af", label: "Dulzor", kind: "sweetness" },
  { id: "sensacion", affId: "sensacion_af", label: "Sensación en Boca", kind: "mouthfeel" },
] as const;

export function CombinedForm({
  sampleData,
  onChange,
  cupsPerSample,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const num = (k: string, def = 7.5) => (d[k] as number | undefined) ?? def;
  const nOrNull = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (d[k] as string | undefined) ?? "";
  const bools = (k: string): boolean[] =>
    (d[k] as boolean[] | undefined) ?? Array(cupsPerSample).fill(false);

  const showUniformity = cupsPerSample >= 2;
  const uniformityInScore = cupsPerSample >= 5;

  return (
    <div>
      <Section title="Nivel de Tueste">
        <IntensitySlider value={num("tueste")} onChange={(v) => set("tueste", v)} />
      </Section>

      <div className="text-[11px] text-brown-mid mb-3 p-2 bg-cream rounded-lg text-center">
        Cada atributo: primero <span className="text-green-mid font-bold">descriptivo</span>, luego{" "}
        <span className="text-amber-warm font-bold">afectivo</span> (1-9).
      </div>

      {COMBINED_ATTRS.map((attr) => (
        <Section key={attr.id} title={attr.label}>
          <div className="text-[9px] font-bold tracking-widest text-green-mid uppercase mb-1">
            Descriptivo — Intensidad
          </div>
          <IntensitySlider
            value={num(`${attr.id}_int`)}
            onChange={(v) => set(`${attr.id}_int`, v)}
          />

          {attr.kind === "flavor" && (
            <div className="mt-2">
              <FlavorTreeSelector
                selected={arr(`${attr.id}_desc`)}
                onChange={(v) => set(`${attr.id}_desc`, v)}
              />
            </div>
          )}
          {attr.kind === "acidity" && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-brown-mid mb-1">Tipo de acidez</div>
              <DescriptorSelector
                descriptors={ACIDITY_DESCRIPTORS}
                selected={arr(`${attr.id}_desc`)}
                onChange={(v) => set(`${attr.id}_desc`, v)}
              />
            </div>
          )}
          {attr.kind === "sweetness" && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-brown-mid mb-1">Tipo de dulzor</div>
              <DescriptorSelector
                descriptors={SWEETNESS_DESCRIPTORS}
                selected={arr(`${attr.id}_desc`)}
                onChange={(v) => set(`${attr.id}_desc`, v)}
              />
            </div>
          )}
          {attr.kind === "mouthfeel" && (
            <div className="mt-2">
              <DescriptorSelector
                descriptors={MOUTHFEEL_DESCRIPTORS}
                selected={arr(`${attr.id}_desc`)}
                onChange={(v) => set(`${attr.id}_desc`, v)}
                hasSubs
              />
            </div>
          )}

          <div className="mt-1.5">
            <NotesInput
              value={str(`${attr.id}_notas`)}
              onChange={(v) => set(`${attr.id}_notas`, v)}
              placeholder="Notas descriptivas..."
            />
          </div>

          <div className="border-t border-dashed border-[#D4C5A9] mt-3 pt-2">
            <div className="text-[9px] font-bold tracking-widest text-amber-warm uppercase mb-1">
              Afectivo — Impresión de calidad
            </div>
            <AffectiveScale
              value={nOrNull(attr.affId)}
              onChange={(v) => set(attr.affId, v)}
              showFinal
              finalValue={nOrNull(`${attr.affId}_final`)}
              onFinalChange={(v) => set(`${attr.affId}_final`, v)}
            />
            <div className="mt-1.5">
              <NotesInput
                value={str(`${attr.affId}_notas`)}
                onChange={(v) => set(`${attr.affId}_notas`, v)}
                placeholder="Notas afectivas..."
              />
            </div>
          </div>
        </Section>
      ))}

      <Section title="Gustos Predominantes">
        <GustosSelector selected={arr("gustos")} onChange={(v) => set("gustos", v)} />
      </Section>

      <Section title="Impresión Global">
        <AffectiveScale
          value={nOrNull("impresion_global")}
          onChange={(v) => set("impresion_global", v)}
          showFinal
          finalValue={nOrNull("impresion_global_final")}
          onFinalChange={(v) => set("impresion_global_final", v)}
        />
      </Section>

      {showUniformity && (
        <Section title="Tazas">
          <CupCheckboxes
            count={cupsPerSample}
            label="TAZAS NO UNIFORMES"
            checked={bools("tazas_no_uniformes")}
            onChange={(v) => {
              const curDef = bools("tazas_defectuosas");
              const newDef = curDef.map((def, i) => def && v[i]);
              onChange({ ...d, tazas_no_uniformes: v, tazas_defectuosas: newDef });
            }}
            color="#C17817"
          />
          <CupCheckboxes
            count={cupsPerSample}
            label="TAZAS DEFECTUOSAS"
            checked={bools("tazas_defectuosas")}
            onChange={(v) => {
              const curNU = bools("tazas_no_uniformes");
              const newNU = curNU.map((nu, i) => nu || v[i]);
              onChange({ ...d, tazas_defectuosas: v, tazas_no_uniformes: newNU });
            }}
            color="#A83232"
          />
          {!uniformityInScore && (
            <div className="text-[10px] text-amber-warm italic">
              ⓘ Se registra pero no afecta el puntaje (requiere ≥5 tazas por catador)
            </div>
          )}
          <div className="mt-2">
            <div className="text-[11px] font-bold text-brown-mid mb-1">DEFECTO (DE HABERLO)</div>
            <div className="flex gap-1.5">
              {DEFECT_TYPES.map((dt) => {
                const active = arr("defecto_tipo").includes(dt);
                return (
                  <button
                    key={dt}
                    onClick={() => {
                      const cur = arr("defecto_tipo");
                      set("defecto_tipo", active ? cur.filter((x) => x !== dt) : [...cur, dt]);
                    }}
                    className={`px-3 py-[5px] rounded-lg border text-xs cursor-pointer ${
                      active
                        ? "bg-red-defect text-white border-red-defect"
                        : "bg-transparent text-brown-dark border-[#D4C5A9]"
                    }`}
                  >
                    {dt}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <Section title="Otras Notas">
        <NotesInput
          value={str("otras_notas")}
          onChange={(v) => set("otras_notas", v)}
          placeholder="Notas adicionales..."
        />
      </Section>

      <Section title="Puntaje Calculado">
        <div className="text-center text-3xl font-bold text-green-dark font-serif">
          {calcIndividualScore(d, cupsPerSample)}
        </div>
        {cupsPerSample < 5 && (
          <div className="text-center text-[10px] text-brown-mid">
            Sin penalización por uniformidad/defectos ({cupsPerSample} tazas)
          </div>
        )}
      </Section>
    </div>
  );
}

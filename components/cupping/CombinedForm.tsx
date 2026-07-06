"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  STEP_ATTRIBUTES,
  STEP_DESC_LABELS,
  STEP_CATA_MAX,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
  SENSORY_DEFECTS,
  SENSORY_DEFECT_LABELS,
  type CuppingStep,
  type SensoryDefect,
} from "@/lib/constants";
import {
  IntensitySlider,
  AffectiveBubbles,
  CATAPills,
  CupIndicators,
  ScoreDisplay,
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

const CUP_LABELS = {
  nonUniform: "No uniformes",
  defective: "Defectuosas",
  nonUniformLegend: "No uniforme",
  defectiveLegend: "Defectuosa",
  oneTap: "(1 toque)",
  defectType: "Tipo de defecto",
  notScored: "Se registra pero no afecta el puntaje (requiere ≥5 tazas)",
};

export function CombinedForm({
  sampleData,
  onChange,
  cupsPerSample,
  currentStep,
  locale = "es",
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
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
  const getBools = (k: string): boolean[] =>
    (d[k] as boolean[] | undefined) ?? Array(cupsPerSample).fill(false);

  const showCups = cupsPerSample >= 2;
  const uniformityInScore = cupsPerSample >= 5;

  const nonUniformBools = getBools("tazas_no_uniformes");
  const defectiveBools = getBools("tazas_defectuosas");
  const defectoTipo = arr("defecto_tipo");

  const nonUniformCups = nonUniformBools
    .map((v, i) => (v ? i + 1 : -1))
    .filter((n) => n > 0);
  const defectiveCupsList = defectiveBools
    .map((v, i) =>
      v
        ? { cup: i + 1, type: (defectoTipo[0] as SensoryDefect | undefined) ?? "moldy" }
        : null
    )
    .filter(Boolean) as { cup: number; type: SensoryDefect }[];

  function toggleNonUniform(idx: number) {
    const next = [...nonUniformBools];
    if (next[idx]) {
      next[idx] = false;
      const nextDef = [...defectiveBools];
      nextDef[idx] = false;
      onChange({ ...d, tazas_no_uniformes: next, tazas_defectuosas: nextDef });
    } else {
      next[idx] = true;
      onChange({ ...d, tazas_no_uniformes: next });
    }
  }

  function toggleDefective(idx: number) {
    const next = [...defectiveBools];
    next[idx] = !next[idx];
    const nextNU = [...nonUniformBools];
    if (next[idx]) nextNU[idx] = true;
    onChange({ ...d, tazas_defectuosas: next, tazas_no_uniformes: nextNU });
  }

  function toggleDefectType(type: string) {
    const cur = arr("defecto_tipo");
    if (cur.includes(type)) {
      set("defecto_tipo", cur.filter((x) => x !== type));
    } else {
      set("defecto_tipo", [...cur, type]);
    }
  }

  // Overall step
  if (currentStep === "overall") {
    return (
      <div>
        <FormSection title="Impresión Global" accent>
          <AffectiveBubbles
            value={num("impresion_global_final")}
            onChange={(v) => set("impresion_global_final", v)}
          />
          <div className="mt-3">
            <Notes
              value={str("impresion_global_notas")}
              onChange={(v) => set("impresion_global_notas", v)}
              placeholder="Notas finales..."
            />
          </div>
        </FormSection>

        {showCups && (
          <FormSection title="Tazas">
            <CupToggleGrid
              cupsPerSample={cupsPerSample}
              nonUniformBools={nonUniformBools}
              defectiveBools={defectiveBools}
              defectTypes={defectoTipo}
              defectOptions={SENSORY_DEFECTS as readonly string[]}
              defectLabels={SENSORY_DEFECT_LABELS as Record<string, string>}
              labels={CUP_LABELS}
              uniformityInScore={uniformityInScore}
              onToggleNonUniform={toggleNonUniform}
              onToggleDefective={toggleDefective}
              onToggleDefectType={toggleDefectType}
            />
            <div className="mt-4">
              <CupIndicators
                totalCups={cupsPerSample}
                nonUniform={nonUniformCups}
                defective={defectiveCupsList}
                showSummary
              />
            </div>
          </FormSection>
        )}

        <FormSection title="Puntaje Calculado">
          <ScoreDisplay
            sectionScores={AFFECTIVE_ATTRIBUTES.map((a) => num(`${a.id}_final`) ?? 0)}
            nonUniformCups={nonUniformBools.filter(Boolean).length}
            defectiveCups={defectiveBools.filter(Boolean).length}
            defaultExpanded={false}
          />
        </FormSection>
      </div>
    );
  }

  // Non-overall: descriptive (intensity + CATA) + affective (bubbles) per attribute
  const stepAttrs = STEP_ATTRIBUTES[currentStep];

  return (
    <div>
      {stepAttrs.map((attr) => {
        const descId = attr.descriptiveId;
        if (!descId) return null;
        const affId = attr.affectiveId;
        const title = STEP_DESC_LABELS[descId] ?? descId;
        const flavor = isFlavorDesc(descId);
        const pills = pillsForDescId(descId);
        const max = STEP_CATA_MAX[descId];

        return (
          <FormSection key={affId} title={title} accent>
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
                      onChange={(v) => set(`${descId}_desc`, v)}
                      notes={notesOf(`${descId}_desc`)}
                      onNotesChange={(n) => set(`${descId}_desc_notes`, n)}
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
      )}
    </div>
  );
}

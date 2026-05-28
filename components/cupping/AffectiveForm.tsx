"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  STEP_ATTRIBUTES,
  STEP_DESC_LABELS,
  STEP_CATA_MAX,
  FLAVOR_FAMILIES,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  SENSORY_DEFECTS,
  SENSORY_DEFECT_LABELS,
  type CuppingStep,
  type SensoryDefect,
} from "@/lib/constants";
import {
  AffectiveBubbles,
  CATAPills,
  CupIndicators,
  ScoreDisplay,
  FormSection,
  Notes,
  CupToggleGrid,
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

function pillsForDescId(descId: string | null): CATAOption[] | null {
  if (!descId) return null;
  if (
    descId === "fragancia" ||
    descId === "aroma" ||
    descId === "sabor" ||
    descId === "sabor_residual"
  ) {
    return flavorCATAOptions;
  }
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

export function AffectiveForm({
  sampleData,
  onChange,
  cupsPerSample,
  currentStep,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
  currentStep: CuppingStep;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const getNum = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const getStr = (k: string): string => (d[k] as string | undefined) ?? "";
  const getArr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];
  const getBools = (k: string): boolean[] =>
    (d[k] as boolean[] | undefined) ?? Array(cupsPerSample).fill(false);

  const showCups = cupsPerSample >= 2;
  const uniformityInScore = cupsPerSample >= 5;

  const stepAttrs = STEP_ATTRIBUTES[currentStep];

  // Cup state (only used in overall step)
  const nonUniformBools = getBools("tazas_no_uniformes");
  const defectiveBools = getBools("tazas_defectuosas");
  const defectoTipo = getArr("defecto_tipo");

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
    const cur = getArr("defecto_tipo");
    if (cur.includes(type)) {
      set("defecto_tipo", cur.filter((x) => x !== type));
    } else {
      set("defecto_tipo", [...cur, type]);
    }
  }

  // Non-overall steps
  if (currentStep !== "overall") {
    return (
      <div>
        {stepAttrs.map((attr) => {
          const title = attr.descriptiveId
            ? STEP_DESC_LABELS[attr.descriptiveId] ?? attr.affectiveId
            : attr.affectiveId;
          const pills = pillsForDescId(attr.descriptiveId);
          const descKey = attr.descriptiveId ?? attr.affectiveId;
          const max = attr.descriptiveId ? STEP_CATA_MAX[attr.descriptiveId] : undefined;

          return (
            <FormSection key={attr.affectiveId} title={title} accent>
              <AffectiveBubbles
                value={getNum(`${attr.affectiveId}_final`)}
                onChange={(v) => set(`${attr.affectiveId}_final`, v)}
              />
              {pills && (
                <div className="mt-4">
                  <CATAPills
                    options={pills}
                    selected={getArr(`${descKey}_desc`)}
                    onChange={(v) => set(`${descKey}_desc`, v)}
                    maxSelect={max}
                    showSubItems
                  />
                </div>
              )}
              <div className="mt-3">
                <Notes
                  value={getStr(`${attr.affectiveId}_notas`)}
                  onChange={(v) => set(`${attr.affectiveId}_notas`, v)}
                  placeholder="Notas afectivas..."
                />
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
      <FormSection title="Impresión Global" accent>
        <AffectiveBubbles
          value={getNum("impresion_global_final")}
          onChange={(v) => set("impresion_global_final", v)}
        />
        <div className="mt-3">
          <Notes
            value={getStr("impresion_global_notas")}
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
          sectionScores={AFFECTIVE_ATTRIBUTES.map((a) => getNum(`${a.id}_final`) ?? 0)}
          nonUniformCups={nonUniformBools.filter(Boolean).length}
          defectiveCups={defectiveBools.filter(Boolean).length}
          defaultExpanded={false}
        />
      </FormSection>
    </div>
  );
}

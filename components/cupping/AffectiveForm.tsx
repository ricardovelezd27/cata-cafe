"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  STEP_ATTRIBUTES,
  STEP_DESC_LABELS,
  SENSORY_DEFECTS,
  SENSORY_DEFECT_LABELS,
  type CuppingStep,
} from "@/lib/constants";
import {
  AffectiveBubbles,
  ScoreDisplay,
  FormSection,
  Notes,
  CupToggleGrid,
} from "@/components/ui";

type Data = Record<string, unknown>;

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
  missingIds,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
  currentStep: CuppingStep;
  /** affectiveIds (from lib/completeness) still missing on this step; drives the * / red flag. */
  missingIds?: string[];
}) {
  const isFlagged = (id: string) => missingIds?.includes(id) ?? false;
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
      <FormSection title="Impresión Global" accent flagged={isFlagged("impresion_global")}>
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
          {(nonUniformCups.length > 0 || defectiveBools.some(Boolean)) && (
            <div className="mt-2 text-[11px] text-brown-mid">
              {nonUniformCups.length} {CUP_LABELS.nonUniform.toLowerCase()} ·{" "}
              {defectiveBools.filter(Boolean).length} {CUP_LABELS.defective.toLowerCase()}
            </div>
          )}
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

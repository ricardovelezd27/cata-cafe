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
import { AffectiveBubbles } from "@/components/ui/AffectiveBubbles";
import { CATAPills, type CATAOption, type CATASubItem } from "@/components/ui/CATAPills";
import { CupIndicators } from "@/components/ui/CupIndicators";
import { ScoreDisplay } from "@/components/ui/ScoreDisplay";
import { Section } from "./Section";
import { NotesInput } from "./NotesInput";

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
  if (descId === "fragancia" || descId === "aroma" || descId === "sabor" || descId === "sabor_residual") {
    return flavorCATAOptions;
  }
  if (descId === "acidez") return acidityCATAOptions;
  if (descId === "dulzor") return sweetnessCATAOptions;
  if (descId === "sensacion") return mouthfeelCATAOptions;
  return null;
}

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

  // Cup state helpers (only used in overall step)
  const nonUniformBools = getBools("tazas_no_uniformes");
  const defectiveBools = getBools("tazas_defectuosas");
  const defectoTipo = getArr("defecto_tipo");

  const nonUniformCups = nonUniformBools.map((v, i) => (v ? i + 1 : -1)).filter((n) => n > 0);
  const defectiveCupsList = defectiveBools
    .map((v, i) =>
      v ? { cup: i + 1, type: (defectoTipo[0] as SensoryDefect | undefined) ?? "moldy" } : null
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

  function setDefectType(type: SensoryDefect) {
    const cur = getArr("defecto_tipo");
    if (cur.includes(type)) {
      set("defecto_tipo", cur.filter((x) => x !== type));
    } else {
      set("defecto_tipo", [...cur, type]);
    }
  }

  // Non-overall steps: render each attribute as a Section with bubbles + CATA + notes.
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
            <Section key={attr.affectiveId} title={title}>
              <AffectiveBubbles
                value={getNum(`${attr.affectiveId}_final`)}
                onChange={(v) => set(`${attr.affectiveId}_final`, v)}
              />
              {pills && (
                <div className="mt-3">
                  <CATAPills
                    options={pills}
                    selected={getArr(`${descKey}_desc`)}
                    onChange={(v) => set(`${descKey}_desc`, v)}
                    maxSelect={max}
                    showSubItems
                  />
                </div>
              )}
              <div className="mt-2">
                <NotesInput
                  value={getStr(`${attr.affectiveId}_notas`)}
                  onChange={(v) => set(`${attr.affectiveId}_notas`, v)}
                  placeholder="Notas afectivas..."
                />
              </div>
            </Section>
          );
        })}
      </div>
    );
  }

  // Overall step: impresión global + cups + score
  return (
    <div>
      <Section title="Impresión Global">
        <AffectiveBubbles
          value={getNum("impresion_global_final")}
          onChange={(v) => set("impresion_global_final", v)}
        />
        <div className="mt-2">
          <NotesInput
            value={getStr("impresion_global_notas")}
            onChange={(v) => set("impresion_global_notas", v)}
            placeholder="Notas finales..."
          />
        </div>
      </Section>

      {showCups && (
        <Section title="Tazas">
          <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8B7355", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#C17817", display: "inline-block" }} />
              No uniforme
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#A83232", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#A83232", display: "inline-block" }} />
              Defectuosa
            </span>
          </div>

          <div className="mb-3">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#8B7355", marginBottom: 6 }}>
              No uniformes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>(1 toque)</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: cupsPerSample }, (_, i) => {
                const isNonUniform = nonUniformBools[i];
                const isDefective = defectiveBools[i];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleNonUniform(i)}
                    style={{
                      width: 40,
                      height: 40,
                      minWidth: 40,
                      borderRadius: "50%",
                      border: `2px solid ${isDefective ? "#A83232" : isNonUniform ? "#C17817" : "#D4C5A9"}`,
                      background: isDefective ? "#A83232" : isNonUniform ? "#C17817" : "transparent",
                      color: isNonUniform || isDefective ? "#FFF" : "#8B7355",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            {!uniformityInScore && (
              <div className="text-[10px] text-amber-warm italic mt-1">
                ⓘ Se registra pero no afecta el puntaje (requiere ≥5 tazas)
              </div>
            )}
          </div>

          <div className="mb-3">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#A83232", marginBottom: 6 }}>
              Defectuosas <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>(1 toque)</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: cupsPerSample }, (_, i) => {
                const isDefective = defectiveBools[i];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDefective(i)}
                    style={{
                      width: 40,
                      height: 40,
                      minWidth: 40,
                      borderRadius: "50%",
                      border: `2px solid ${isDefective ? "#A83232" : "#D4C5A9"}`,
                      background: isDefective ? "#A83232" : "transparent",
                      color: isDefective ? "#FFF" : "#8B7355",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    {isDefective ? "✗" : i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {defectiveBools.some(Boolean) && (
            <div className="mb-3">
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#8B7355", marginBottom: 6 }}>
                Tipo de defecto
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SENSORY_DEFECTS.map((dt) => {
                  const active = defectoTipo.includes(dt);
                  return (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setDefectType(dt)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 20,
                        border: `1.5px solid ${active ? "#A83232" : "#D4C5A9"}`,
                        background: active ? "#A83232" : "transparent",
                        color: active ? "#FFF" : "#5C4A32",
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {SENSORY_DEFECT_LABELS[dt]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <CupIndicators
            totalCups={cupsPerSample}
            nonUniform={nonUniformCups}
            defective={defectiveCupsList}
            showSummary
          />
        </Section>
      )}

      <Section title="Puntaje Calculado">
        <ScoreDisplay
          sectionScores={AFFECTIVE_ATTRIBUTES.map((a) => (getNum(`${a.id}_final`) ?? 0))}
          nonUniformCups={nonUniformBools.filter(Boolean).length}
          defectiveCups={defectiveBools.filter(Boolean).length}
          defaultExpanded={false}
        />
      </Section>
    </div>
  );
}
